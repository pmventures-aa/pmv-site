// Shared contact-field validation for email and phone. Used by the provider
// application (client + server) and HQ provider editing so the same rules
// apply everywhere a phone or email is captured.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isValidEmail(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  // Guard against absurd lengths and the obvious malformed shapes; this is a
  // structural check, not a deliverability check.
  return trimmed.length <= 254 && EMAIL_RE.test(trimmed)
}

// Strip everything but digits (and a single leading +) so we can count them.
export function phoneDigits(value: unknown): string {
  if (typeof value !== 'string') return ''
  const plus = value.trim().startsWith('+') ? '+' : ''
  return plus + value.replace(/[^\d]/g, '')
}

// Accepts a US 10-digit number, a US 11-digit number led by 1, or an
// international number in E.164 range (up to 15 digits). Rejects anything
// shorter than 10 digits so a stray "555" or a typo can't slip through.
export function isValidPhone(value: unknown): boolean {
  const digits = phoneDigits(value).replace('+', '')
  if (digits.length < 10 || digits.length > 15) return false
  return true
}

// Present a US 10-digit number as (xxx) xxx-xxxx; an 11-digit US number as
// +1 (xxx) xxx-xxxx; otherwise return the number with a leading + preserved.
// Non-phone input is returned unchanged so callers can show what the user typed.
export function formatPhone(value: unknown): string {
  if (typeof value !== 'string') return ''
  const raw = value.trim()
  const hasPlus = raw.startsWith('+')
  const digits = raw.replace(/[^\d]/g, '')
  if (!hasPlus && digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (!hasPlus && digits.length === 11 && digits.startsWith('1')) {
    const d = digits.slice(1)
    return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  }
  return raw
}
