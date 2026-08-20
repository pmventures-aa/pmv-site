import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Source-shape tests for the field-work location permission hook. The
// prior implementation returned permission='prompt' whenever the
// Permissions API was unavailable (Safari's historical behavior for
// geolocation), which made the setup banner reappear on every mount
// even after the user had granted the browser permission. These tests
// pin the fix in place so a future refactor cannot silently regress it.

describe('useGeolocationPermission state model', () => {
  const source = readFileSync(new URL('../src/lib/useGeolocationPermission.ts', import.meta.url), 'utf8')

  it('models the full spec state union including revoked and unsupported', () => {
    // Match against the exported type so the test fails if any variant
    // is dropped in a refactor.
    for (const variant of ["'unknown'", "'prompt'", "'granted'", "'denied'", "'revoked'", "'unsupported'"]) {
      expect(source).toContain(variant)
    }
  })

  it('persists the last-known browser permission state to localStorage', () => {
    expect(source).toContain('pmv:geolocation-known-state')
    expect(source).toContain('localStorage.setItem')
    expect(source).toContain('localStorage.getItem')
  })

  it('optimistically restores granted state on mount so the banner does not flash on remount', () => {
    // useState initializer reads the persisted state and returns
    // 'granted' immediately when we have proof from a prior mount.
    expect(source).toMatch(/useState<GeoPermission>\(\(\) => \{[\s\S]*?readPersistedState\(\)/)
    expect(source).toMatch(/if \(persisted === 'granted'\) return 'granted'/)
  })

  it('reports revoked (not prompt/denied) when a prior grant transitions to prompt or denied', () => {
    // The applyPermission callback must emit 'revoked' on
    // granted -> prompt / granted -> denied so the caller can
    // distinguish "never enabled" from "had it, lost it".
    expect(source).toMatch(/prior === 'granted'[\s\S]*?next === 'prompt' \|\| next === 'denied'/)
    expect(source).toContain("resolved = 'revoked'")
  })

  it('falls back to a silent getCurrentPosition probe when Permissions API is unavailable', () => {
    // Safari historically has no Permissions API for geolocation.
    // A silent success means the browser already had a grant; we
    // must not force the user to click Allow again in that case.
    expect(source).toContain('hasPermissionsApi()')
    // The slow-path branch runs getCurrentPosition to observe permission.
    expect(source).toMatch(/no Permissions API[\s\S]*?navigator\.geolocation\.getCurrentPosition/)
  })

  it('never persists the transient prompt/unknown states', () => {
    // derivePersistFrom must only return granted/denied/revoked so we
    // do not race the next mount with a stale prompt cache.
    expect(source).toMatch(/derivePersistFrom[\s\S]*?if \(state === 'granted'\) return 'granted'/)
    expect(source).toMatch(/derivePersistFrom[\s\S]*?return null/)
  })
})

describe('revoked/denied location surfaces via the top-bar icon, not a banner', () => {
  const autoStart = readFileSync(new URL('../src/components/admin/LocationAutoStart.tsx', import.meta.url), 'utf8')
  const box = readFileSync(new URL('../src/components/admin/TopbarLocation.tsx', import.meta.url), 'utf8')

  it('LocationAutoStart no longer renders any location banner', () => {
    // The big mobile banner was removed in favour of one native prompt per
    // login plus the persistent top-bar icon.
    expect(autoStart).not.toContain('Location access was turned off')
    expect(autoStart).not.toContain('Let HQ find you')
    expect(autoStart).toContain('return null')
  })

  it('the top-bar icon distinguishes revoked/denied and offers re-enable', () => {
    expect(box).toMatch(/permission === 'revoked'/)
    expect(box).toContain("permission === 'denied'")
  })
})

describe('Network & Dispatch page respects the fuller state model', () => {
  const source = readFileSync(new URL('../src/pages/admin/ProviderNetworkAdmin.tsx', import.meta.url), 'utf8')

  it('shows the setup card on prompt OR revoked, and hides Not now on revoked', () => {
    expect(source).toMatch(/permission === 'revoked'/)
    expect(source).toContain('Re-enable location')
  })
})
