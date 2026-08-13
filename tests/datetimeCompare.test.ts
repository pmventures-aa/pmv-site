import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('ISO vs SQLite datetime comparisons', () => {
  it('normalizes appointment upcoming filters with datetime()', () => {
    const portal = readFileSync(new URL('../functions/_lib/routes/portal.ts', import.meta.url), 'utf8')
    const admin = readFileSync(new URL('../functions/_lib/routes/admin.ts', import.meta.url), 'utf8')
    expect(portal).toContain("datetime(starts_at) >= datetime('now')")
    expect(admin).toContain("datetime(a.starts_at) >= datetime('now')")
    expect(admin).toContain("datetime(starts_at) >= datetime('now')")
  })

  it('normalizes invite expiry sweeps with datetime()', () => {
    const invitations = readFileSync(new URL('../functions/_lib/routes/invitationAdmin.ts', import.meta.url), 'utf8')
    const trusted = readFileSync(new URL('../functions/_lib/routes/trustedContacts.ts', import.meta.url), 'utf8')
    expect(invitations).toContain("datetime(expires_at) <= datetime('now')")
    expect(trusted).toContain("datetime(expires_at) <= datetime('now')")
  })
})
