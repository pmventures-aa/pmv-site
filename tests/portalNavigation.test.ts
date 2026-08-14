import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { clientMobilePrimary, clientPortalNav, portalMobilePrimary, portalNav } from '../src/components/layout/nav'

describe('Client portal navigation', () => {
  it('keeps a short default sidebar instead of a tile directory', () => {
    const keys = clientPortalNav([]).map((item) => item.key)
    expect(keys).toEqual(['dashboard', 'work', 'messages', 'documents', 'support', 'calendar', 'billing', 'services'])
    expect(keys).not.toContain('security')
    expect(keys).not.toContain('business-profile')
  })

  it('only adds property, funding, and project destinations when those services are live', () => {
    const withProperty = clientPortalNav(['property_management']).map((item) => item.key)
    expect(withProperty).toContain('properties')
    expect(withProperty).toContain('work')
    expect(withProperty).not.toContain('funding')
    expect(withProperty.slice(0, 3)).toEqual(['dashboard', 'work', 'properties'])

    const withFunding = clientPortalNav(['funding']).map((item) => item.key)
    expect(withFunding).toContain('funding')
    expect(withFunding).not.toContain('properties')
    expect(withFunding.slice(0, 3)).toEqual(['dashboard', 'work', 'funding'])
  })

  it('exposes the four mobile primary destinations from the default nav', () => {
    const keys = new Set(portalNav.map((item) => item.key))
    for (const key of portalMobilePrimary) expect(keys.has(key)).toBe(true)
  })

  it('keeps the portal mobile tab bar as the client pattern', () => {
    const shell = readFileSync(new URL('../src/components/layout/Shell.tsx', import.meta.url), 'utf8')
    expect(shell).toContain('Primary client destinations')
    expect(shell).toContain('grid-cols-5')
    expect(shell).toContain('More')
  })

  it('uses world-specific mobile tabs when a primary service is active', () => {
    expect(clientMobilePrimary(['property_management'])).toEqual(['dashboard', 'work', 'messages', 'documents'])
    expect(clientMobilePrimary(['mobile_notary'])).toEqual(['dashboard', 'work', 'messages', 'documents'])
    expect(clientMobilePrimary(['funding'])).toEqual(['dashboard', 'work', 'messages', 'documents'])
  })
})
