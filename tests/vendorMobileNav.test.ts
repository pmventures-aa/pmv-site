import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { vendorMobilePrimary, vendorNav, vendorNavForWorld } from '../src/components/layout/nav'

describe('Vendor HQ mobile navigation', () => {
  const layout = readFileSync(new URL('../src/components/admin/AdminLayout.tsx', import.meta.url), 'utf8')
  const adminApp = readFileSync(new URL('../src/pages/admin/AdminApp.tsx', import.meta.url), 'utf8')
  const fieldWork = readFileSync(new URL('../src/pages/admin/FieldWorkVendor.tsx', import.meta.url), 'utf8')

  it('keeps Assignments and Messages as the vendor primary tabs', () => {
    expect([...vendorMobilePrimary]).toEqual(['assignments', 'messages'])
    const keys = vendorNav.map((item) => item.key)
    for (const key of vendorMobilePrimary) expect(keys).toContain(key)
    expect(vendorNavForWorld('property')[0].to).toBe('field-work/mine')
    expect(vendorNavForWorld('documents')[0].label).toContain('Signing')
  })

  it('renders a vendor-only bottom tab bar instead of making staff hunt a hamburger', () => {
    expect(layout).toContain("variant?: 'staff' | 'vendor'")
    expect(layout).toContain('isVendorShell')
    expect(layout).toContain('Primary vendor destinations')
    expect(layout).toContain('Assignments')
    expect(layout).toContain('More')
    expect(layout).toContain('lg:hidden')
    expect(adminApp).toContain("variant={isVendor ? 'vendor' : 'staff'}")
  })

  it('does not give staff the vendor bottom tabs', () => {
    expect(layout).toContain("variant = 'staff'")
    expect(layout).toContain('{isVendorShell && (')
  })

  it('lazy-loads HQ pages including field work instead of bundling them into the shell', () => {
    expect(adminApp).toContain("lazy(() => import('./FieldWorkVendor')")
    expect(adminApp).toContain("lazy(() => import('./QuotesAdmin'))")
    expect(adminApp).toContain("lazy(() => import('./MessagesAdmin'))")
    expect(adminApp).not.toMatch(/import FieldWorkDetail, \{ FieldWorkList \} from '\.\/FieldWorkVendor'/)
  })

  it('keeps field assignment list and detail usable as in-app navigation', () => {
    expect(fieldWork).toContain('to={p(`field-work/${assignment.id}`)}')
    expect(fieldWork).not.toContain('window.location.href')
    expect(fieldWork).toContain("listPath = workspace.party_type === 'vendor' ? 'field-work/mine' : 'field-work'")
    expect(fieldWork).toContain('vendor-assignment-actions')
    expect(fieldWork).toContain('min-h-12')
  })
})
