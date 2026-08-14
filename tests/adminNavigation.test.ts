import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { adminNav } from '../src/components/layout/nav'

describe('HQ navigation contract', () => {
  const appSource = readFileSync(new URL('../src/pages/admin/AdminApp.tsx', import.meta.url), 'utf8')

  it('has a registered route for every HQ navigation destination', () => {
    const missing = adminNav
      .filter((item) => item.to)
      .filter((item) => !appSource.includes(`path="${item.to}"`))
      .map((item) => `${item.section || 'Overview'} > ${item.label} (${item.to})`)

    expect(missing, `Unregistered HQ navigation destinations:\n${missing.join('\n')}`).toEqual([])
  })

  it('does not expose duplicate HQ destinations', () => {
    const destinations = adminNav.map((item) => item.to || '/')
    expect(new Set(destinations).size).toBe(destinations.length)
  })

  it('lazy-loads HQ workspaces so field work is not in the AdminApp entry graph', () => {
    expect(appSource).toContain("lazy(() => import('./FieldWorkVendor'))")
    expect(appSource).toContain("lazy(() => import('./QuotesAdmin'))")
    expect(appSource).toContain("lazy(() => import('./CommunicationsCRMAdmin'))")
    expect(appSource).not.toMatch(/^import FieldWorkDetail/m)
  })

  it('keeps revenue, documents, and people tools on a shorter HQ sidebar', () => {
    const keys = adminNav.map((item) => item.key)
    expect(keys).toContain('invoices')
    expect(keys).toContain('inquiries')
    expect(keys).toContain('document-center')
    expect(keys).not.toContain('esign-platform')
    expect(keys).not.toContain('community-documents')
    expect(keys).not.toContain('envelopes')
    expect(adminNav.find((item) => item.key === 'inquiries')?.section).toBe('Revenue')
    expect(adminNav.find((item) => item.key === 'audit-log')?.section).toBe('Administration')
  })

  it('surfaces role control and previously hidden operator tools', () => {
    const keys = new Set(adminNav.map((item) => item.key))
    for (const key of ['roles', 'invitations', 'service-assignments', 'assignments']) {
      expect(keys, `missing HQ nav key: ${key}`).toContain(key)
    }
    expect(keys.has('communications')).toBe(false)
    expect(keys.has('client-banners')).toBe(false)
  })
})
