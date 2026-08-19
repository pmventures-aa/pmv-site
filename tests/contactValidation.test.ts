import { describe, it, expect } from 'vitest'
import { isValidEmail, isValidPhone, phoneDigits, formatPhone } from '../shared/contactValidation'

describe('isValidEmail', () => {
  it('accepts ordinary addresses', () => {
    for (const e of ['a@b.co', 'first.last@example.com', 'x+tag@sub.domain.org']) {
      expect(isValidEmail(e), e).toBe(true)
    }
  })
  it('rejects malformed addresses', () => {
    for (const e of ['', 'plainaddress', 'a@b', 'a@@b.com', 'a b@c.com', 'a@b.c', '@b.com', 'a@.com']) {
      expect(isValidEmail(e), e).toBe(false)
    }
  })
  it('rejects non-strings and absurd lengths', () => {
    expect(isValidEmail(null)).toBe(false)
    expect(isValidEmail(`${'a'.repeat(250)}@b.com`)).toBe(false)
  })
})

describe('isValidPhone', () => {
  it('accepts 10-digit, 11-digit US, and E.164', () => {
    for (const p of ['561-388-7879', '(561) 388-7879', '15613887879', '+1 561 388 7879', '+44 20 7946 0958']) {
      expect(isValidPhone(p), p).toBe(true)
    }
  })
  it('rejects too-short or garbage', () => {
    for (const p of ['', '555', '388-7879', 'call me', '+1234567890123456']) {
      expect(isValidPhone(p), p).toBe(false)
    }
  })
})

describe('phoneDigits', () => {
  it('keeps a single leading plus and strips the rest', () => {
    expect(phoneDigits('+1 (561) 388-7879')).toBe('+15613887879')
    expect(phoneDigits('561.388.7879')).toBe('5613887879')
  })
})

describe('formatPhone', () => {
  it('formats US numbers', () => {
    expect(formatPhone('5613887879')).toBe('(561) 388-7879')
    expect(formatPhone('15613887879')).toBe('+1 (561) 388-7879')
  })
  it('preserves international input', () => {
    expect(formatPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958')
  })
})
