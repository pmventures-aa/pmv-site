import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { vendorMobilePrimary, vendorNav, vendorNavForWorld } from '../src/components/layout/nav'
import { hqUrl, portalUrl } from '../functions/_lib/appUrls'

describe('Vendor HQ mobile navigation', () => {
  const layout = readFileSync(new URL('../src/components/admin/AdminLayout.tsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/pages/admin/AdminApp.tsx', import.meta.url), 'utf8')
  const field = readFileSync(new URL('../src/pages/admin/FieldWorkVendor.tsx', import.meta.url), 'utf8')

  it('exposes assignments and messages as mobile primary tabs', () => {
    const keys = new Set(vendorNav.map((item) => item.key))
    for (const key of vendorMobilePrimary) expect(keys.has(key)).toBe(true)
    expect([...vendorMobilePrimary]).toEqual(['assignments', 'messages'])
  })

  it('keeps field-work/mine as the assignments destination across worlds', () => {
    for (const world of ['general', 'property', 'documents'] as const) {
      const assignments = vendorNavForWorld(world).find((item) => item.key === 'assignments')
      expect(assignments?.to).toBe('field-work/mine')
    }
  })

  it('keeps security in the More drawer rather than the bottom bar', () => {
    expect(vendorMobilePrimary).not.toContain('security-center')
    expect(vendorNav.some((item) => item.key === 'security-center')).toBe(true)
  })

  it('wires vendorMobilePrimary into AdminLayout for vendors only', () => {
    expect(app).toContain('vendorMobilePrimary')
    expect(app).toContain('mobilePrimary={isVendor ? vendorMobilePrimary : undefined}')
    expect(layout).toContain('showVendorTabs')
    expect(layout).toContain('Primary field destinations')
    expect(layout).toContain('Assignments')
    expect(layout).toContain('More')
  })

  it('keeps Assignments active on field detail and uses mine-scoped list fetch', () => {
    expect(layout).toContain('onAssignmentDetail')
    expect(field).toContain("view=mine")
    expect(field).toContain("navigate(p('field-work/mine'))")
    expect(field).toContain('min-h-14')
    expect(field).toContain('sticky')
  })
})

describe('secure URL cutover helpers', () => {
  it('builds post-login links on secure. with /hq for HQ paths', () => {
    expect(portalUrl('/set-password')).toBe('https://secure.pinnaclemanagementventures.com/set-password')
    expect(hqUrl('/login')).toBe('https://secure.pinnaclemanagementventures.com/hq/login')
  })

  it('stops minting legacy hosts from UsersAdmin and InvitationsAdmin', () => {
    const users = readFileSync(new URL('../src/pages/admin/UsersAdmin.tsx', import.meta.url), 'utf8')
    const invites = readFileSync(new URL('../src/pages/admin/InvitationsAdmin.tsx', import.meta.url), 'utf8')
    expect(users).toContain('secure.pinnaclemanagementventures.com')
    expect(users).not.toContain('client.pinnaclemanagementventures.com')
    expect(users).not.toContain('hq.pinnaclemanagementventures.com')
    expect(invites).toContain('secure.pinnaclemanagementventures.com/hq/vendor-signup')
  })
})
