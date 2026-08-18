import { describe, expect, it } from 'vitest'
import { sanitizePropertyInput, PROPERTY_TEXT_FIELDS } from '../shared/cleaningProperty'

describe('cleaning property profile sanitizer', () => {
  it('trims and caps text fields, nulls empties', () => {
    const s = sanitizePropertyInput({ nickname: '  Beach Condo  ', parking: '', address: 'x'.repeat(3000) })
    expect(s.text.nickname).toBe('Beach Condo')
    expect(s.text.parking).toBe(null)
    expect(s.text.address?.length).toBe(2000)
  })

  it('coerces integer fields and rejects junk', () => {
    const s = sanitizePropertyInput({ bedrooms: '3', bathrooms: 2.6, beds: -4, square_feet: 'abc' })
    expect(s.ints.bedrooms).toBe(3)
    expect(s.ints.bathrooms).toBe(3) // rounded
    expect(s.ints.beds).toBe(null) // negative rejected
    expect(s.ints.square_feet).toBe(null)
  })

  it('validates county and property type against allow-lists', () => {
    expect(sanitizePropertyInput({ county: 'broward' }).county).toBe('broward')
    expect(sanitizePropertyInput({ county: 'orange' }).county).toBe(null)
    expect(sanitizePropertyInput({ property_type: 'condo' }).propertyType).toBe('condo')
    expect(sanitizePropertyInput({ property_type: 'castle' }).propertyType).toBe(null)
  })

  it('keeps access instructions separate from general text', () => {
    const s = sanitizePropertyInput({ access_instructions: 'Lockbox 4821 by the door' })
    expect(s.accessInstructions).toBe('Lockbox 4821 by the door')
    expect(Object.values(s.text)).not.toContain('Lockbox 4821 by the door')
  })

  it('exposes a stable set of editable form fields', () => {
    const cols = PROPERTY_TEXT_FIELDS.map((f) => f.column)
    expect(cols).toContain('nickname')
    expect(cols).toContain('cleaning_preferences')
    expect(cols).not.toContain('access_instructions') // handled separately
  })
})
