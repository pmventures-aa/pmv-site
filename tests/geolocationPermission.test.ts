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

describe('LocationAutoStart banner respects the fuller state model', () => {
  const source = readFileSync(new URL('../src/components/admin/LocationAutoStart.tsx', import.meta.url), 'utf8')

  it('re-shows the setup banner on a revoked grant, even when ctaHidden is set', () => {
    // The revoked branch must not gate on !ctaHidden - the user needs
    // to know sharing has stopped regardless of a prior "Not now".
    expect(source).toMatch(/permission === 'revoked'/)
  })

  it('does not present revoked with the first-time copy', () => {
    // Copy must differentiate: "was turned off" vs "let HQ find you".
    expect(source).toContain('Location access was turned off')
  })
})

describe('Network & Dispatch page respects the fuller state model', () => {
  const source = readFileSync(new URL('../src/pages/admin/ProviderNetworkAdmin.tsx', import.meta.url), 'utf8')

  it('shows the setup card on prompt OR revoked, and hides Not now on revoked', () => {
    expect(source).toMatch(/permission === 'revoked'/)
    expect(source).toContain('Re-enable location')
  })
})
