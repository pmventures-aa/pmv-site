import { describe, expect, it } from 'vitest'
import { inviteExpiry, INVITE_EXPIRED_SQL, providerInviteCopy } from '../functions/_lib/invites'
import { impersonationDenylistForClient } from '../functions/_lib/impersonationGuard'
import { twoBusinessHoursFrom } from '../functions/_lib/scopeFunnel'

describe('invite expiry storage', () => {
  it('stores SQLite-comparable UTC stamps without a T separator', () => {
    const stamp = inviteExpiry(24)
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(stamp.includes('T')).toBe(false)
    expect(stamp.endsWith('Z')).toBe(false)
  })

  it('normalizes both ISO and SQLite shapes for SQL cleanup', () => {
    expect(INVITE_EXPIRED_SQL).toContain("replace(substr(expires_at, 1, 19), 'T', ' ')")
    expect(INVITE_EXPIRED_SQL).toContain("datetime('now')")
    // Lexical ISO compare is the historical bug: 'T' > ' ' so same-day
    // ISO expiries never matched datetime('now').
    expect('2026-08-13T10:00:00.000Z' <= '2026-08-13 16:00:00').toBe(false)
    expect('2026-08-13 10:00:00' <= '2026-08-13 16:00:00').toBe(true)
  })

  it('keeps provider invite copy personalized', () => {
    expect(providerInviteCopy({ known_services: ['mobile_notary'] }).subject).toContain('notary')
  })
})

describe('impersonation denylist', () => {
  it('covers real logout, portal password change, and session revoke paths', () => {
    const paths = impersonationDenylistForClient().map((entry) => `${entry.method} ${entry.path}`)
    expect(paths).toContain('POST /api/auth/logout')
    expect(paths).toContain('POST /api/portal/change-password')
    expect(paths).toContain('POST /api/admin/impersonate')
    expect(paths).toContain('POST /api/admin/security/sessions/revoke-others')
    expect(paths.some((p) => p.includes('/api/auth/change-password'))).toBe(false)
  })
})

describe('care plan SLA clock', () => {
  it('uses staffed Eastern business hours instead of wall-clock +2h', () => {
    // Friday 4pm ET (20:00 UTC in August) should land Monday morning ET.
    expect(twoBusinessHoursFrom(new Date('2026-08-07T20:00:00.000Z'))).toBe('2026-08-10T14:00:00.000Z')
  })
})
