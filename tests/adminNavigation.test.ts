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

  it('keeps Field Work and Remote Notarization as separate Delivery tabs', () => {
    const field = adminNav.find((item) => item.key === 'field-work')
    const ron = adminNav.find((item) => item.key === 'ron')
    expect(field?.label).toBe('Field Work')
    expect(field?.section).toBe('Delivery')
    expect(ron?.label).toBe('Remote Notarization')
    expect(ron?.section).toBe('Delivery')
    // Neither tab should carry the combined 'Field Work & RON' label.
    expect(adminNav.some((item) => /field.*ron/i.test(item.label))).toBe(false)
  })

  it('consolidates the sidebar into the six intended hubs, contiguously', () => {
    const network = adminNav.find((item) => item.key === 'network')
    expect(network?.section).toBe('People')
    const users = adminNav.find((item) => item.key === 'users')
    expect(users?.section).toBe('People')
    const messages = adminNav.find((item) => item.key === 'messages')
    expect(messages?.section).toBe('Service')
    const automation = adminNav.find((item) => item.key === 'automation-center')
    expect(automation?.section).toBe('Intelligence')

    // Only these hubs, and each hub's items must be contiguous so the sidebar
    // grouping (which merges consecutive same-section items) renders one block
    // per hub.
    const sections = adminNav.filter((i) => i.section).map((i) => i.section as string)
    const uniqueInOrder = sections.filter((s, i) => sections[i - 1] !== s)
    expect(uniqueInOrder).toEqual(['Revenue', 'Service', 'Delivery', 'People', 'Intelligence', 'Administration'])
    expect(new Set(uniqueInOrder).size).toBe(uniqueInOrder.length)
  })
})
