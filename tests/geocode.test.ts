import { describe, expect, it } from 'vitest'
import { hitFromCensus, hitsFromNominatim, hitsFromPhoton } from '../functions/_lib/geocode'
import { abbreviateState, composeAddressQuery, geoCacheKey, isUsefulGeoQuery, normalizeGeoQuery } from '../shared/geocode'

describe('geocode helpers', () => {
  it('normalizes queries so cache hits survive punctuation and case', () => {
    expect(normalizeGeoQuery('123 Main St., Boca Raton')).toBe('123 main st, boca raton')
    expect(geoCacheKey('123 Main St., Boca Raton')).toBe('us:123 main st, boca raton')
    expect(composeAddressQuery({ line1: '214 Palmetto Park Rd', city: 'Boca Raton', state: 'FL', postal: '33432' })).toBe('214 Palmetto Park Rd, Boca Raton, FL, 33432')
  })

  it('abbreviates state names and ignores already-short codes', () => {
    expect(abbreviateState('Florida')).toBe('FL')
    expect(abbreviateState('fl')).toBe('FL')
    expect(abbreviateState('New York')).toBe('NY')
  })

  it('requires a street-like query before spending an upstream lookup', () => {
    expect(isUsefulGeoQuery('Boca')).toBe(false)
    expect(isUsefulGeoQuery('214 Palmetto')).toBe(true)
  })
})

describe('public geocoder parsers', () => {
  it('reads lat/lng from Nominatim search rows', () => {
    const hits = hitsFromNominatim([
      {
        display_name: '214 Palmetto Park Rd, Boca Raton, Florida, 33432, United States',
        lat: '26.3501',
        lon: '-80.0831',
        address: { house_number: '214', road: 'Palmetto Park Rd', city: 'Boca Raton', state: 'Florida', postcode: '33432', country_code: 'us' },
      },
    ])
    expect(hits[0]).toMatchObject({ line1: '214 Palmetto Park Rd', city: 'Boca Raton', state: 'FL', lat: 26.3501, lng: -80.0831 })
  })

  it('reads lat/lng from Photon autocomplete features', () => {
    const hits = hitsFromPhoton([
      { geometry: { coordinates: [-80.1289, 26.3683] }, properties: { housenumber: '100', street: 'N Federal Hwy', city: 'Boca Raton', state: 'Florida', postcode: '33432', countrycode: 'us' } },
    ])
    expect(hits[0].lat).toBe(26.3683)
    expect(hits[0].lng).toBe(-80.1289)
    expect(hits[0].state).toBe('FL')
  })

  it('reads lat/lng from the Census one-line geocoder', () => {
    const hit = hitFromCensus({
      result: {
        addressMatches: [{
          matchedAddress: '214 PALMETTO PARK RD, BOCA RATON, FL, 33432',
          coordinates: { x: -80.0831, y: 26.3501 },
          addressComponents: { fromAddress: '214', streetName: 'PALMETTO PARK', suffixType: 'RD', city: 'BOCA RATON', state: 'FL', zip: '33432' },
        }],
      },
    })
    expect(hit).toMatchObject({ lat: 26.3501, lng: -80.0831, state: 'FL', postal_code: '33432' })
  })

  it('returns null when Census has no address match', () => {
    expect(hitFromCensus({ result: { addressMatches: [] } })).toBeNull()
  })
})
