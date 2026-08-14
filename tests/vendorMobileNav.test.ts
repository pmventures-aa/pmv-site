import { describe, expect, it } from 'vitest'
import { vendorMobilePrimary, vendorNav, vendorNavForWorld } from '../src/components/layout/nav'

describe('Vendor HQ mobile navigation', () => {
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
})
