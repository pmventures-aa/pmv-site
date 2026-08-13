import { describe, expect, it } from 'vitest'
import { DEFAULT_INVITE_TTL_HOURS, formatInviteTtl, parseInviteTtlHours } from '../shared/inviteTtl'
import { slugTemplateKey } from '../functions/_lib/managedTemplates'

describe('company-wide invite link lifetime', () => {
  it('defaults to 24 hours and clamps invalid values', () => {
    expect(parseInviteTtlHours(undefined)).toBe(DEFAULT_INVITE_TTL_HOURS)
    expect(parseInviteTtlHours('')).toBe(24)
    expect(parseInviteTtlHours(0)).toBe(1)
    expect(parseInviteTtlHours(9000)).toBe(8760)
    expect(parseInviteTtlHours('168')).toBe(168)
  })

  it('formats hours as days when the value is a whole day count', () => {
    expect(formatInviteTtl(24)).toBe('24 hours')
    expect(formatInviteTtl(48)).toBe('2 days')
    expect(formatInviteTtl(168)).toBe('7 days')
    expect(formatInviteTtl(12)).toBe('12 hours')
  })
})

describe('managed template keys', () => {
  it('slugs a display name into a stable template key', () => {
    expect(slugTemplateKey('Client Services Agreement')).toBe('client-services-agreement')
    expect(slugTemplateKey('  NDAs!!  ')).toBe('ndas')
  })
})
