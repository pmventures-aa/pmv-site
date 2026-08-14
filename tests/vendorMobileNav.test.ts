import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { vendorMobilePrimary, vendorNav, vendorNavForWorld } from '../src/components/layout/nav'
import { portalMobilePrimary } from '../src/components/layout/nav'

describe('vendor HQ mobile shell', () => {
  const layout = readFileSync(new URL('../src/components/admin/AdminLayout.tsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/pages/admin/AdminApp.tsx', import.meta.url), 'utf8')
  const field = readFileSync(new URL('../src/pages/admin/FieldWorkVendor.tsx', import.meta.url), 'utf8')
  const portal = readFileSync(new URL('../src/components/layout/Shell.tsx', import.meta.url), 'utf8')

  it('keeps assignments and inbox as the vendor primary tabs', () => {
    expect([...vendorMobilePrimary]).toEqual(['assignments', 'messages'])
    const keys = new Set(vendorNav.map((item) => item.key))
    for (const key of vendorMobilePrimary) expect(keys.has(key)).toBe(true)
    expect(vendorNavForWorld('property').find((item) => item.key === 'assignments')?.to).toBe('field-work/mine')
  })

  it('wires vendor-only bottom nav through HQ layout, not staff hamburger', () => {
    expect(app).toContain('vendorMobilePrimary')
    expect(app).toContain("party_type === 'vendor'")
    expect(app).toContain('mobilePrimary={isVendor ? [...vendorMobilePrimary] : []}')
    expect(layout).toContain('Primary field destinations')
    expect(layout).toContain('vendorMobile')
    expect(layout).toContain('More')
    expect(layout).not.toContain('mobilePrimary = [...portalMobilePrimary]')
  })

  it('does not give staff the vendor bottom tab bar by default', () => {
    expect(layout).toContain('mobilePrimary = []')
    expect(layout).toContain('vendorMobile &&')
  })

  it('keeps the client portal bottom tabs intact', () => {
    expect([...portalMobilePrimary]).toEqual(['dashboard', 'work', 'messages', 'documents'])
    expect(portal).toContain('Primary client destinations')
    expect(portal).toContain('mobilePrimary.includes(item.key)')
  })

  it('keeps field assignment detail on large tap targets with a sticky next action', () => {
    expect(field).toContain("navigate(p(`field-work/${assignment.id}`))")
    expect(field).toContain("navigate(p('field-work/mine'))")
    expect(field).toContain('vendor-sign-panel')
    expect(field).toContain("nextAction === 'depart'")
    expect(field).toContain("nextAction === 'arrive'")
    expect(field).toContain('Leave for site')
    expect(field).toContain('I have arrived')
    expect(field).toContain('min-h-12')
    expect(layout).toContain('env(safe-area-inset-bottom)')
  })
})
