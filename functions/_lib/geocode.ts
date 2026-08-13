import type { Env } from './types'
import { abbreviateState, geoCacheKey, type GeoHit } from '../../shared/geocode'

const USER_AGENT = 'PinnacleManagementVentures/1.0 (https://pinnaclemanagementventures.com; hello@pinnaclemanagementventures.com)'
const GLOBAL_FETCH_CAP_PER_HOUR = 180
const IP_FETCH_CAP_PER_HOUR = 80
const HIT_CACHE_MS = 90 * 24 * 60 * 60 * 1000
const MISS_CACHE_MS = 6 * 60 * 60 * 1000

type NominatimHit = {
  display_name?: string
  lat?: string
  lon?: string
  address?: {
    house_number?: string
    road?: string
    city?: string
    town?: string
    village?: string
    hamlet?: string
    county?: string
    state?: string
    postcode?: string
    country_code?: string
  }
}

type PhotonFeature = {
  geometry?: { coordinates?: number[] }
  properties?: {
    name?: string
    housenumber?: string
    street?: string
    city?: string
    state?: string
    postcode?: string
    country?: string
    countrycode?: string
  }
}

function line1FromParts(house?: string, road?: string, fallback?: string): string {
  return [house, road].filter(Boolean).join(' ').trim() || (fallback || '').split(',')[0]?.trim() || ''
}

export function hitsFromNominatim(rows: NominatimHit[]): GeoHit[] {
  const hits: GeoHit[] = []
  for (const row of rows) {
    const lat = Number(row.lat)
    const lng = Number(row.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const a = row.address || {}
    hits.push({
      display: row.display_name || '',
      line1: line1FromParts(a.house_number, a.road, row.display_name),
      city: a.city || a.town || a.village || a.hamlet || '',
      state: abbreviateState(a.state),
      postal_code: a.postcode || '',
      country: (a.country_code || 'us').toUpperCase(),
      lat,
      lng,
    })
  }
  return hits
}

export function hitsFromPhoton(features: PhotonFeature[]): GeoHit[] {
  const hits: GeoHit[] = []
  for (const feature of features) {
    const lng = Number(feature.geometry?.coordinates?.[0])
    const lat = Number(feature.geometry?.coordinates?.[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const p = feature.properties || {}
    const line1 = line1FromParts(p.housenumber, p.street, p.name)
    const display = [line1, p.city, abbreviateState(p.state), p.postcode].filter(Boolean).join(', ')
    hits.push({
      display,
      line1,
      city: p.city || '',
      state: abbreviateState(p.state),
      postal_code: p.postcode || '',
      country: (p.countrycode || 'us').toUpperCase(),
      lat,
      lng,
    })
  }
  return hits
}

export function hitFromCensus(payload: unknown): GeoHit | null {
  const root = payload as {
    result?: {
      addressMatches?: Array<{
        matchedAddress?: string
        coordinates?: { x?: number; y?: number }
        addressComponents?: { city?: string; state?: string; zip?: string; fromAddress?: string; streetName?: string; suffixType?: string }
      }>
    }
  }
  const match = root?.result?.addressMatches?.[0]
  const lat = Number(match?.coordinates?.y)
  const lng = Number(match?.coordinates?.x)
  if (!match || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const c = match.addressComponents || {}
  const line1 = [c.fromAddress, c.streetName, c.suffixType].filter(Boolean).join(' ').trim()
    || (match.matchedAddress || '').split(',')[0]?.trim()
    || ''
  return {
    display: match.matchedAddress || line1,
    line1,
    city: c.city || '',
    state: abbreviateState(c.state),
    postal_code: c.zip || '',
    country: 'US',
    lat,
    lng,
  }
}

function cacheAgeMs(fetchedAt: string | undefined): number {
  if (!fetchedAt) return Number.POSITIVE_INFINITY
  const parsed = Date.parse(String(fetchedAt).replace(' ', 'T') + 'Z')
  return Number.isFinite(parsed) ? Date.now() - parsed : Number.POSITIVE_INFINITY
}

async function readCache(env: Env, key: string): Promise<GeoHit[] | null> {
  try {
    const row = await env.DB.prepare('SELECT results_json, fetched_at FROM geocode_cache WHERE query_key = ?').bind(key).first<{ results_json: string; fetched_at: string }>()
    if (!row?.results_json) return null
    const parsed = JSON.parse(row.results_json) as GeoHit[]
    if (!Array.isArray(parsed)) return null
    const maxAge = parsed.length ? HIT_CACHE_MS : MISS_CACHE_MS
    if (cacheAgeMs(row.fetched_at) > maxAge) return null
    return parsed
  } catch {
    return null
  }
}

async function writeCache(env: Env, key: string, query: string, hits: GeoHit[], source: string) {
  try {
    await env.DB.prepare(
      `INSERT INTO geocode_cache (query_key, query_text, results_json, source, fetched_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(query_key) DO UPDATE SET results_json = excluded.results_json, source = excluded.source, fetched_at = datetime('now')`,
    ).bind(key, query.slice(0, 300), JSON.stringify(hits).slice(0, 8000), source).run()
  } catch {
    // Migration may not have run yet; search still works without persistence.
  }
}

async function allowUpstream(env: Env, ip: string): Promise<boolean> {
  try {
    const global = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM geocode_cache WHERE fetched_at > datetime('now', '-1 hour')`,
    ).first<{ n: number }>()
    if (Number(global?.n || 0) >= GLOBAL_FETCH_CAP_PER_HOUR) return false
  } catch {
    // Migration may not have run yet; still apply the per-IP cap.
  }
  try {
    const key = `geo:${ip}`
    const count = Number(await env.SESSIONS.get(key) || 0)
    if (count >= IP_FETCH_CAP_PER_HOUR) return false
    await env.SESSIONS.put(key, String(count + 1), { expirationTtl: 3600 })
  } catch {
    // KV unavailable: the D1 hourly cap still bounds upstream traffic.
  }
  return true
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  })
  if (!res.ok) throw new Error(`geocode status ${res.status}`)
  return res.json()
}

export async function searchGeocode(env: Env, query: string, opts: { limit?: number; countryCodes?: string; ip?: string } = {}): Promise<{ results: GeoHit[]; cached: boolean; source: string }> {
  const limit = Math.min(Math.max(opts.limit || 5, 1), 5)
  const countryCodes = opts.countryCodes || 'us'
  const key = geoCacheKey(query, countryCodes)
  const cached = await readCache(env, key)
  if (cached) return { results: cached.slice(0, limit), cached: true, source: cached.length ? 'cache' : 'cache-miss' }

  if (!(await allowUpstream(env, opts.ip || 'unknown'))) {
    return { results: [], cached: false, source: 'throttled' }
  }

  const encoded = encodeURIComponent(query)
  const completeUs = countryCodes.includes('us') && /[a-z]/i.test(query) && /\d/.test(query) && (/,/.test(query) || /\b\d{5}(?:-\d{4})?\b/.test(query))
  let hits: GeoHit[] = []
  let source = 'none'
  let completed = false

  async function tryCensus() {
    const census = await fetchJson(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encoded}&benchmark=Public_AR_Current&format=json`)
    completed = true
    const hit = hitFromCensus(census)
    if (hit) {
      hits = [hit]
      source = 'census'
    }
  }

  if (completeUs) {
    try {
      await tryCensus()
    } catch {
      // Photon / Nominatim next
    }
  }

  if (!hits.length) {
    try {
      const photon = await fetchJson(`https://photon.komoot.io/api/?q=${encoded}&limit=${limit}&lang=en`) as { features?: PhotonFeature[] }
      completed = true
      hits = hitsFromPhoton(photon.features || [])
      if (hits.length) source = 'photon'
    } catch {
      hits = []
    }
  }

  if (!hits.length && countryCodes.includes('us') && !completeUs && /[a-z].*\d|\d.*[a-z]/i.test(query)) {
    try {
      await tryCensus()
    } catch {
      // Nominatim next
    }
  }

  if (!hits.length) {
    try {
      const nominatim = await fetchJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${limit}&countrycodes=${encodeURIComponent(countryCodes)}&q=${encoded}`) as NominatimHit[]
      completed = true
      hits = hitsFromNominatim(Array.isArray(nominatim) ? nominatim : [])
      if (hits.length) source = 'nominatim'
    } catch {
      hits = []
    }
  }

  if (hits.length || completed) await writeCache(env, key, query, hits, source)
  return { results: hits.slice(0, limit), cached: false, source }
}
