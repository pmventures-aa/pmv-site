import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { vendorMobilePrimary, vendorMobileTabLabel, vendorNavForWorld } from '../src/components/layout/nav'

describe('vendor mobile HQ shell', () => {
  const layout = readFileSync(new URL('../src/components/admin/AdminLayout.tsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/pages/admin/AdminApp.tsx', import.meta.url), 'utf8')
  const fieldWork = readFileSync(new URL('../src/pages/admin/FieldWorkVendor.tsx', import.meta.url), 'utf8')

  it('exposes Assignments and Messages as vendor mobile primary tabs', () => {
    expect([...vendorMobilePrimary]).toEqual(['assignments', 'messages'])
    const keys = vendorNavForWorld('property').map((item) => item.key)
    for (const key of vendorMobilePrimary) expect(keys).toContain(key)
    expect(vendorMobileTabLabel(vendorNavForWorld('property')[0])).toBe('Assignments')
    expect(vendorMobileTabLabel(vendorNavForWorld('general')[1])).toBe('Messages')
  })

  it('turns on the vendor bottom nav from AdminApp for party_type vendor only', () => {
    expect(app).toContain('vendorMobile={isVendor}')
    expect(layout).toContain('vendorMobile = false')
    expect(layout).toContain("aria-label=\"Primary field destinations\"")
    expect(layout).toContain('More')
    expect(layout).not.toContain('m.pinnacle')
    expect(layout).not.toContain('mobile.pinnacle')
  })

  it('keeps field assignment list and detail usable on a phone', () => {
    expect(fieldWork).toContain('/admin/field-assignments?mine=1')
    expect(fieldWork).toContain("navigate(p(`field-work/${assignment.id}`))")
    expect(fieldWork).toContain("workspace.party_type === 'vendor' ? 'field-work/mine'")
    expect(fieldWork).toContain('min-h-14')
    expect(fieldWork).toContain('safe-area-inset-bottom')
    expect(fieldWork).toContain('Leave for site')
    expect(fieldWork).toContain('I have arrived')
    expect(fieldWork).toContain('Sign &amp; mark assignment completed')
  })

  it('installs an HQ PWA manifest on the existing secure host', () => {
    const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
    const manifest = readFileSync(new URL('../public/manifest-hq.json', import.meta.url), 'utf8')
    const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
    expect(main).toContain("manifestHref = surface === 'admin' ? '/manifest-hq.json'")
    expect(main).toContain("navigator.serviceWorker.register('/sw.js')")
    expect(manifest).toContain('/hq/field-work/mine')
    expect(manifest).not.toContain('m.')
    expect(sw).toContain("url.pathname.startsWith('/api/')")
    expect(sw).toContain('return')
  })
})
