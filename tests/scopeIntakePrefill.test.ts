import { describe, expect, it } from 'vitest'
import { fieldPrefillFromScope, formatScopeAnswersSummary, parseScopeAnswers, quotePrefillFromScope, type ScopeIntakeRow } from '../shared/scopeIntakePrefill'

const row: ScopeIntakeRow = {
  id: 'req-1',
  job_type: 'property_inspection',
  service_key: 'property_inspections',
  location_type: 'onsite',
  city: 'Boca Raton',
  state: 'FL',
  postal_code: '33432',
  timing: 'This week',
  details: 'Lockbox on the side gate.',
  contact_name: 'Jordan Hale',
  email: 'jordan@example.com',
  phone: '5615550100',
  answers_json: JSON.stringify({
    occupied: 'Yes',
    photos_required: 'Interior photo package',
    reports_required: 'Written occupancy report',
    meeting_location: '214 Palmetto Park Rd',
  }),
  estimate_low_cents: 18500,
  estimate_high_cents: 24000,
  reserved_user_id: null,
  created_at: '2026-08-13T00:00:00.000Z',
}

describe('scope intake prefill', () => {
  it('parses occupancy, photos, and reports from answers_json', () => {
    const answers = parseScopeAnswers(row.answers_json)
    expect(answers.occupied).toBe('Yes')
    expect(formatScopeAnswersSummary(row)).toContain('Interior photo package')
    expect(formatScopeAnswersSummary(row)).toContain('Written occupancy report')
  })

  it('builds a quote with occupancy, photo, and report lines', () => {
    const quote = quotePrefillFromScope(row)
    expect(quote.recipient_name).toBe('Jordan Hale')
    expect(quote.recipient_email).toBe('jordan@example.com')
    expect(quote.property_address).toBe('214 Palmetto Park Rd')
    expect(quote.lines.map((line) => line.name)).toEqual([
      'Get eyes on a property',
      'Occupied-property coordination',
      'Photo package',
      'Written report',
    ])
    expect(quote.lines[0].unit_price).toBe('185.00')
  })

  it('prefills a field assignment without re-asking the scope questions', () => {
    const field = fieldPrefillFromScope(row)
    expect(field.kind).toBe('field')
    expect(field.site_city).toBe('Boca Raton')
    expect(field.site_address).toBe('214 Palmetto Park Rd')
    expect(field.notes).toContain('occupied')
    expect(field.new_client.email).toBe('jordan@example.com')
  })
})
