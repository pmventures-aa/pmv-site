import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { searchGeocode, hitsFromNominatim } from '../geocode'
import { normalizeGeoQuery } from '../../../shared/geocode'

export const geoRoutes = new Hono<AppEnv>()

geoRoutes.get('/geo/search', async (c) => {
  const query = normalizeGeoQuery(c.req.query('q') || '')
  if (query.length < 4) return c.json({ results: [], cached: false, source: 'short' })
  if (query.length > 200) return c.json({ error: 'query too long' }, 400)
  const limit = Number(c.req.query('limit') || 5)
  const countryCodes = (c.req.query('countrycodes') || 'us').toLowerCase().replace(/[^a-z,]/g, '').slice(0, 12) || 'us'
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown'
  const result = await searchGeocode(c.env, query, { limit, countryCodes, ip })
  return c.json(result)
})

// Reverse geocode a coordinate pair into a US-postal-ish address hit. Used
// by the client "Use My Current Location" field-work request flow to prefill
// the service address from the browser's Geolocation position. Kept small
// and unauthenticated (same as /geo/search) so the intake wizard can call it
// before the client has a session.
geoRoutes.get('/geo/reverse', async (c) => {
  const lat = Number(c.req.query('lat'))
  const lng = Number(c.req.query('lng'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return c.json({ error: 'valid lat and lng are required' }, 400)
  }
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lng))
    url.searchParams.set('format', 'json')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('zoom', '18')
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'PinnacleManagementVentures/1.0 (https://pinnaclemanagementventures.com; hello@pinnaclemanagementventures.com)',
        'Accept': 'application/json',
      },
    })
    if (!res.ok) return c.json({ error: 'reverse geocode failed' }, 502)
    const raw = await res.json() as any
    const [hit] = hitsFromNominatim([raw])
    if (!hit) return c.json({ error: 'no result' }, 404)
    return c.json({ result: hit })
  } catch {
    return c.json({ error: 'reverse geocode failed' }, 502)
  }
})
