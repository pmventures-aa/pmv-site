import { describe, expect, it } from 'vitest'
import {
  applyCatalogToQuoteLines,
  buildScopeIntroMessage,
  estimateMidpointCents,
  formatEstimateRange,
  offeringIdForScopePhoto,
} from '../shared/quoteCatalog'
import { quotePrefillFromScope } from '../shared/scopeIntakePrefill'

describe('quote catalog resolution', () => {
  const catalog = new Map([
    ['property-moveout-clean', {
      id: 'property-moveout-clean',
      name: 'Move-Out / Turnover Cleaning',
      description: 'Landlord-inspection-grade clean between occupants.',
      starting_price_cents: 42500,
      pricing_label: 'Typically $325-650',
    }],
    ['field-exterior-light', {
      id: 'field-exterior-light',
      name: 'Exterior Photo Verification - Light',
      description: 'Exterior documentation with GPS-tagged photos.',
      starting_price_cents: 6500,
      pricing_label: 'Starting at $65',
    }],
  ])

  it('refreshes template line prices from the live catalog', () => {
    const resolved = applyCatalogToQuoteLines([
      { offering_id: 'property-moveout-clean', name: 'Stale template label', unit_price_cents: 1000 },
    ], catalog)
    expect(resolved[0]?.name).toBe('Move-Out / Turnover Cleaning')
    expect(resolved[0]?.unit_price_cents).toBe(42500)
  })

  it('formats estimate ranges and midpoints for scope intake', () => {
    expect(formatEstimateRange(32500, 65000)).toBe('$325–$650')
    expect(estimateMidpointCents(32500, 65000)).toBe(48750)
  })

  it('maps scope photo labels to catalog offerings', () => {
    expect(offeringIdForScopePhoto('Quick exterior (3-6 photos)')).toBe('field-exterior-light')
  })
})

describe('scope quote prefill', () => {
  const catalog = new Map([
    ['property-moveout-clean', {
      id: 'property-moveout-clean',
      name: 'Move-Out / Turnover Cleaning',
      description: 'Landlord-inspection-grade clean between occupants.',
      starting_price_cents: 42500,
      pricing_label: 'Typically $325-650',
    }],
    ['field-exterior-light', {
      id: 'field-exterior-light',
      name: 'Exterior Photo Verification - Light',
      description: 'Exterior documentation with GPS-tagged photos.',
      starting_price_cents: 6500,
      pricing_label: 'Starting at $65',
    }],
  ])

  it('builds catalog-backed lines instead of zero-dollar placeholders', () => {
    const prefill = quotePrefillFromScope({
      id: 'scope-1',
      job_type: 'cleaning_turnover',
      service_key: 'property_management',
      location_type: 'onsite',
      city: 'Boca Raton',
      state: 'FL',
      postal_code: '33432',
      timing: 'Next week',
      details: null,
      contact_name: 'Alex Owner',
      email: 'alex@example.com',
      phone: '5615550100',
      answers_json: JSON.stringify({
        photos_required: 'Quick exterior (3-6 photos)',
      }),
      estimate_low_cents: 32500,
      estimate_high_cents: 65000,
      reserved_user_id: null,
      created_at: '2026-08-14T12:00:00Z',
    }, catalog)

    expect(prefill.lines[0]?.offering_id).toBe('property-moveout-clean')
    expect(prefill.lines[0]?.unit_price).toBe('487.50')
    expect(prefill.lines.some((line) => line.offering_id === 'field-exterior-light' && line.unit_price !== '0.00')).toBe(true)
    expect(prefill.intro_message).toContain('Hi Alex')
    expect(prefill.intro_message).not.toBe(prefill.lines[0]?.description)
  })

  it('writes a client-facing intro instead of a raw Q&A dump', () => {
    const intro = buildScopeIntroMessage({
      contactName: 'Alex Owner',
      jobLabel: 'Clean or make a property rent-ready',
      propertyAddress: 'Boca Raton, FL',
      estimateRange: '$325–$650',
      summary: 'Timing: Next week',
    })
    expect(intro).toContain('Planning range')
    expect(intro).toContain('Thank you')
  })
})
