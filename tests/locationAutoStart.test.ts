import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('HQ mobile auto-location', () => {
  const source = readFileSync(new URL('../src/components/admin/LocationAutoStart.tsx', import.meta.url), 'utf8')

  it('only fires on a phone viewport (no desktop trigger)', () => {
    expect(source).toContain("matchMedia('(max-width: 767px)')")
    expect(source).toContain('lg:hidden')
  })

  it('auto-starts silently when permission is already granted, and only when idle', () => {
    expect(source).toContain("geoPerm.permission !== 'granted'")
    expect(source).toContain("sharing !== 'idle'")
  })

  it('never starts while an active field assignment is open (that screen owns its watch)', () => {
    expect(source).toMatch(/field-work/)
    expect(source).toContain('onActiveAssignment')
  })

  it('does not re-nag after a denial or dismissal', () => {
    expect(source).toContain('!geoPerm.ctaHidden')
    expect(source).toContain('geoPerm.hideCta')
  })

  it('reuses the shared live-location hook instead of a second watch implementation', () => {
    expect(source).toContain("from '../../lib/useLiveLocationShare'")
  })
})

describe('live location sharing stays single-sourced', () => {
  const hook = readFileSync(new URL('../src/lib/useLiveLocationShare.ts', import.meta.url), 'utf8')
  const permissionHook = readFileSync(new URL('../src/lib/useGeolocationPermission.ts', import.meta.url), 'utf8')

  it('the permission hook never starts watchPosition on its own', () => {
    expect(permissionHook).not.toContain('navigator.geolocation.watchPosition')
  })

  it('the shared hook owns the watch loop and posts to /admin/location', () => {
    expect(hook).toContain('navigator.geolocation.watchPosition')
    expect(hook).toContain("api.post('/admin/location'")
    expect(hook).toContain("api.post('/admin/location/stop'")
  })

  it('the Network page delegates to the shared hook instead of its own watch loop', () => {
    const page = readFileSync(new URL('../src/pages/admin/ProviderNetworkAdmin.tsx', import.meta.url), 'utf8')
    expect(page).toContain("useLiveLocationShare")
    expect(page).not.toContain('navigator.geolocation.watchPosition')
  })
})
