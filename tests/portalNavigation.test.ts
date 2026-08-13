import { describe, expect, it } from 'vitest'
import { clientMobilePrimary, clientPortalNav, portalMobilePrimary, portalNav } from '../src/components/layout/nav'
import { resolvePortalDeepLink } from '../src/lib/basePath'

describe('Client portal navigation', () => {
  it('keeps a short default sidebar instead of a tile directory', () => {
    const keys = clientPortalNav([]).map((item) => item.key)
    expect(keys).toEqual(['dashboard', 'support', 'documents', 'messages', 'calendar', 'billing', 'services'])
    expect(keys).not.toContain('security')
    expect(keys).not.toContain('business-profile')
  })

  it('only adds property, funding, and project destinations when those services are live', () => {
    const withProperty = clientPortalNav(['property_management']).map((item) => item.key)
    expect(withProperty).toContain('properties')
    expect(withProperty).not.toContain('funding')
    expect(withProperty.slice(0, 3)).toEqual(['dashboard', 'properties', 'support'])

    const withFunding = clientPortalNav(['funding']).map((item) => item.key)
    expect(withFunding).toContain('funding')
    expect(withFunding).not.toContain('properties')
    expect(withFunding.slice(0, 3)).toEqual(['dashboard', 'funding', 'support'])
  })

  it('exposes the four mobile primary destinations from the default nav', () => {
    const keys = new Set(portalNav.map((item) => item.key))
    for (const key of portalMobilePrimary) expect(keys.has(key)).toBe(true)
  })

  it('uses world-specific mobile tabs when a primary service is active', () => {
    expect(clientMobilePrimary(['property_management'])).toEqual(['dashboard', 'properties', 'support', 'documents'])
    expect(clientMobilePrimary(['mobile_notary'])).toEqual(['dashboard', 'documents', 'support', 'messages'])
    expect(clientMobilePrimary(['funding'])).toEqual(['dashboard', 'funding', 'documents', 'support'])
  })
})

describe('portal deep links', () => {
  it('maps stored /portal paths onto the current app base', () => {
    const nested = (path: string) => `/portal/${path}`
    const rooted = (path: string) => `/${path}`
    expect(resolvePortalDeepLink('/portal/billing', nested)).toBe('/portal/billing')
    expect(resolvePortalDeepLink('/portal/billing', rooted)).toBe('/billing')
    expect(resolvePortalDeepLink('documents', nested)).toBe('/portal/documents')
    expect(resolvePortalDeepLink('/billing?tab=open', rooted)).toBe('/billing?tab=open')
    expect(resolvePortalDeepLink('https://example.com/x', nested)).toBe('https://example.com/x')
  })
})
