import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The Security Center session tables are wide (min-w 760-940px). On a phone a
// raw overflow-x table clips the trailing columns off the screen, so each table
// collapses to a stacked card list on mobile and keeps the full table on md+.
describe('security center mobile', () => {
  const src = readFileSync(new URL('../src/pages/admin/SecurityCenter.tsx', import.meta.url), 'utf8')

  it('renders session cards on mobile and the table only on desktop', () => {
    // Card lists are mobile-only.
    expect(src).toContain('space-y-3 md:hidden')
    // Both wide tables are hidden until md and keep their horizontal scroll there.
    expect(src.match(/hidden overflow-x-auto rounded-lg border border-white\/10 md:block/g)?.length).toBe(2)
    expect(src).toContain('min-w-[940px]')
    expect(src).toContain('min-w-[760px]')
  })

  it('labels each value in the mobile cards so no column context is lost', () => {
    expect(src).toContain('<Field label="Location">')
    expect(src).toContain('<Field label="Last active">')
    expect(src).toContain('<Field label="Ended">')
    expect(src).toContain('<Field label="Reason">')
  })

  it('keeps revoke actions reachable from the mobile cards', () => {
    // The revoke controls appear in both the card and the table branch.
    expect(src.match(/onClick=\{\(\)=>revoke\(s\)\}/g)?.length).toBe(2)
    expect(src).toContain('canRevokeUser(s)')
  })
})
