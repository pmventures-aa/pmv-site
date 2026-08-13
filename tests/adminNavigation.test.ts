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

  it('surfaces previously URL-only HQ tools in the sidebar', () => {
    const keys = new Set(adminNav.map((item) => item.key))
    for (const key of ['roles', 'invitations', 'communications', 'invoices', 'service-assignments', 'client-banners']) {
      expect(keys, `missing HQ nav key: ${key}`).toContain(key)
    }
  })
})
