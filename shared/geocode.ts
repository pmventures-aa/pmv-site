export type GeoHit = {
  display: string
  line1: string
  city: string
  state: string
  postal_code: string
  country: string
  lat: number
  lng: number
}

const STATE_ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC',
}

export function normalizeGeoQuery(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.#]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim()
}

export function composeAddressQuery(parts: { line1?: string | null; city?: string | null; state?: string | null; postal?: string | null }): string {
  return [parts.line1, parts.city, parts.state, parts.postal]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(', ')
}

export function abbreviateState(value: string | null | undefined): string {
  const raw = (value || '').trim()
  if (!raw) return ''
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase()
  return STATE_ABBR[raw.toLowerCase()] || raw
}

export function geoCacheKey(query: string, countryCodes = 'us'): string {
  return `${countryCodes}:${normalizeGeoQuery(query)}`
}

export function isUsefulGeoQuery(query: string): boolean {
  const normalized = normalizeGeoQuery(query)
  if (normalized.length < 6) return false
  return /[a-z]/.test(normalized) && /\d/.test(normalized)
}
