import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Source-shape tests for the field-location session hook. Full runtime
// tests for a hook that owns watchPosition + fetch calls would require
// a JSDOM harness with mocked navigator.geolocation and fetch stubs
// that this codebase does not currently maintain. These tests pin the
// contract that the spec calls out explicitly so a future refactor
// cannot silently regress the throttle / permission-revoked / cleanup
// paths.

describe('useFieldLocationSession contract', () => {
  const source = readFileSync(new URL('../src/lib/useFieldLocationSession.ts', import.meta.url), 'utf8')

  it('does not open a session unless permission is granted', () => {
    // Any of denied / revoked / unsupported / non-granted must bail
    // early - the hook must never trigger navigator.geolocation while
    // permission is not affirmatively granted.
    expect(source).toMatch(/permission === 'denied' \|\| geoPerm\.permission === 'revoked' \|\| geoPerm\.permission === 'unsupported'/)
    expect(source).toMatch(/permission !== 'granted'/)
  })

  it('never triggers the browser permission dialog itself', () => {
    // The permission dialog is owned by the caller's setup surface via
    // useGeolocationPermission.request(). This hook must never call
    // getCurrentPosition directly, only watchPosition after grant.
    expect(source).toContain('navigator.geolocation.watchPosition')
    expect(source).not.toContain('navigator.geolocation.getCurrentPosition')
  })

  it('client-side throttles points that fall inside BOTH the time and distance windows', () => {
    // Mirrors the server throttle so we save battery + bandwidth
    // before the request even leaves the device.
    expect(source).toContain('CLIENT_MIN_INTERVAL_MS')
    expect(source).toContain('CLIENT_MIN_DISTANCE_METERS')
    expect(source).toMatch(/elapsed < CLIENT_MIN_INTERVAL_MS && moved < CLIENT_MIN_DISTANCE_METERS/)
  })

  it('resumes an existing active session for the same assignment instead of opening a duplicate', () => {
    expect(source).toContain("api.get<ActiveSessionResponse>('/admin/field-location/session/active')")
    expect(source).toMatch(/active\.session\.assignment_id === assignmentIdRef\.current && !active\.stale/)
  })

  it('cleans up a stale or wrong-assignment session before starting fresh', () => {
    expect(source).toMatch(/active\.stale \|\| active\.session\.assignment_id !== assignmentIdRef\.current/)
    expect(source).toMatch(/api\.post\(`\/admin\/field-location\/session\/\$\{active\.session\.id\}\/end`/)
  })

  it('ends the session with permission_revoked when the browser revokes mid-watch', () => {
    // watchPosition's error handler must translate code 1 into a
    // permission_revoked end + paused state.
    expect(source).toMatch(/err\.code === 1/)
    expect(source).toContain("endSession('permission_revoked')")
    expect(source).toContain("setState('paused')")
  })

  it('ends the session on unmount using the caller-supplied reason', () => {
    // The cleanup function passed to useEffect runs on both assignment
    // change and unmount, and must end the server session so we do not
    // leak an active session across screens.
    expect(source).toMatch(/options\.endReasonOnUnmount \?\? 'operator_stopped'/)
  })

  it('exposes an explicit stop() so a Stop-sharing button does not depend on unmount', () => {
    expect(source).toMatch(/stop: \(reason\?: FieldLocationEndedReason\) => Promise<void>/)
    expect(source).toContain("stoppingRef.current = true")
  })

  it('mirrors the server enum vocabulary for source and ended_reason', () => {
    // Keep the client union in lockstep with the migration CHECK
    // constraints so a typo does not surface as a silent 400.
    for (const src of ["'browser'", "'pwa'", "'native'", "'manual'", "'geofence'"]) {
      expect(source).toContain(src)
    }
    for (const reason of ["'assignment_completed'", "'assignment_cancelled'", "'assignment_failed'", "'operator_stopped'", "'timeout'", "'permission_revoked'"]) {
      expect(source).toContain(reason)
    }
  })
})

describe('FieldLocationIndicator + Staleness', () => {
  const source = readFileSync(new URL('../src/components/admin/FieldLocationIndicator.tsx', import.meta.url), 'utf8')

  it('renders nothing while tracking is idle', () => {
    expect(source).toMatch(/if \(state === 'idle'\) return null/)
  })

  it('surfaces the tracking state in an aria-live status region', () => {
    expect(source).toContain('role="status"')
    expect(source).toContain('aria-live="polite"')
  })

  it('marks a stale pin as stale and an offline pin as last-known instead of live', () => {
    // The spec is explicit: never present a stale location as though
    // it is currently live. Enforce the two thresholds are named.
    expect(source).toContain('STALE_MS')
    expect(source).toContain('OFFLINE_MS')
    expect(source).toContain('Last known')
    expect(source).toContain('Stale')
    expect(source).toContain('Location unavailable')
  })
})
