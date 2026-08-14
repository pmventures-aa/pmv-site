import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { vendorMobilePrimary, vendorNavForWorld } from '../src/components/layout/nav'
import { hqUrl, portalUrl } from '../functions/_lib/appUrls'

describe('vendor mobile shell', () => {
  const layout = readFileSync(new URL('../src/components/admin/AdminLayout.tsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/pages/admin/AdminApp.tsx', import.meta.url), 'utf8')
  const field = readFileSync(new URL('../src/pages/admin/FieldWorkVendor.tsx', import.meta.url), 'utf8')

  it('exposes Assignments + Messages as primary mobile tabs for every vendor world', () => {
    for (const world of ['general', 'property', 'documents'] as const) {
      const keys = new Set(vendorNavForWorld(world).map((item) => item.key))
      for (const key of vendorMobilePrimary) expect(keys.has(key)).toBe(true)
    }
    expect([...vendorMobilePrimary]).toEqual(['assignments', 'messages'])
  })

  it('wires vendorMobilePrimary into AdminLayout only for vendors', () => {
    expect(app).toContain('vendorMobilePrimary')
    expect(app).toContain('mobilePrimary={isVendor ? vendorMobilePrimary : undefined}')
    expect(layout).toContain('Primary vendor destinations')
    expect(layout).toContain('showVendorTabs')
    expect(layout).toContain('Assignments')
    expect(layout).toContain('More')
  })

  it('keeps staff on hamburger chrome without a forced bottom tab bar', () => {
    expect(layout).toContain('!showVendorTabs && (')
    expect(layout).toContain('Open navigation')
  })

  it('uses mine=1 list fetch and returns vendors to field-work/mine', () => {
    expect(field).toContain('/admin/field-assignments?mine=1')
    expect(field).toContain("navigate(p('field-work/mine'))")
    expect(field).toContain('min-h-11')
  })
})

describe('secure URL cutover helpers', () => {
  it('builds post-login links on secure. with /hq for HQ paths', () => {
    expect(portalUrl()).toBe('https://secure.pinnaclemanagementventures.com')
    expect(portalUrl('/set-password')).toBe('https://secure.pinnaclemanagementventures.com/set-password')
    expect(hqUrl()).toBe('https://secure.pinnaclemanagementventures.com/hq')
    expect(hqUrl('/vendor-signup')).toBe('https://secure.pinnaclemanagementventures.com/hq/vendor-signup')
  })

  it('stops emitting legacy client./hq. hosts from UsersAdmin and InvitationsAdmin', () => {
    const users = readFileSync(new URL('../src/pages/admin/UsersAdmin.tsx', import.meta.url), 'utf8')
    const invites = readFileSync(new URL('../src/pages/admin/InvitationsAdmin.tsx', import.meta.url), 'utf8')
    expect(users).toContain('secure.pinnaclemanagementventures.com')
    expect(users).not.toContain('client.pinnaclemanagementventures.com')
    expect(users).not.toContain('hq.pinnaclemanagementventures.com')
    expect(invites).toContain('secure.pinnaclemanagementventures.com/hq/vendor-signup')
    expect(invites).not.toContain('hq.pinnaclemanagementventures.com/vendor-signup')
  })
})
