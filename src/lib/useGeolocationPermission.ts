import { useCallback, useEffect, useRef, useState } from 'react'

// Permission-aware geolocation hook for staff/vendor dispatch and field
// surfaces. Solves the recurring banner problem: on browsers without the
// Permissions API for geolocation (Safari historically), we used to fall
// back to permission = 'prompt' on every mount, which made the "Enable
// Location" banner reappear on every page load even for users who had
// already granted the browser permission the first time.
//
// State model (matches the field-location spec):
//
//   'unknown'    - initial, still deciding what state we are in
//   'prompt'     - permission is undetermined; user needs to click Allow
//   'granted'    - browser has granted geolocation to this origin
//   'denied'     - user actively refused
//   'revoked'    - was granted before, has since been revoked or reset
//   'unsupported'- the platform does not expose navigator.geolocation
//
// Resolution order on mount:
//
//   1. Read the local remembered state (KNOWN_STATE_KEY). If it says
//      "granted", we render that immediately so the banner does not flash.
//      This is a UI hint only - browser permission is still the source
//      of truth.
//   2. If the Permissions API is available, subscribe to it: authoritative
//      state + live change events. A transition granted -> prompt/denied
//      is reported as 'revoked' so callers can distinguish "user just
//      turned it off" from "user has never enabled it".
//   3. If Permissions API is not available, silently call
//      getCurrentPosition. A silent success means the browser has an
//      existing grant and never fired a dialog - we can safely treat
//      this as 'granted' and persist it. Any error whose code is 1
//      (permission_denied) means the user has refused; other errors leave
//      the state as 'prompt' so the caller can ask.

export type GeoPermission =
  | 'unknown'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'revoked'
  | 'unsupported'

export interface GeoState {
  permission: GeoPermission
  position: GeolocationPosition | null
  error: string | null
  busy: boolean
}

// Local remembered app-level state. This never REPLACES the browser
// permission check - it lets the UI render the correct enabled state
// immediately on remount / route change / login without flashing the
// setup banner.
const KNOWN_STATE_KEY = 'pmv:geolocation-known-state'
// Legacy "user clicked Not now" remembered dismissal (kept for the
// non-mobile Network page banner and any surface that wants a one-time
// hide even when permission is still 'prompt').
const HINT_KEY = 'pmv:geolocation-cta-hidden'

type PersistedState = 'granted' | 'denied' | 'revoked'

function readPersistedState(): PersistedState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KNOWN_STATE_KEY)
    if (raw === 'granted' || raw === 'denied' || raw === 'revoked') return raw
    return null
  } catch { return null }
}

function writePersistedState(state: PersistedState | null): void {
  if (typeof window === 'undefined') return
  try {
    if (state == null) window.localStorage.removeItem(KNOWN_STATE_KEY)
    else window.localStorage.setItem(KNOWN_STATE_KEY, state)
  } catch { /* private-mode / storage disabled - fine, we just re-derive */ }
}

function hasPermissionsApi(): boolean {
  return typeof navigator !== 'undefined'
    && typeof (navigator as Navigator & { permissions?: unknown }).permissions !== 'undefined'
}

// Only mirror the truly-known browser states into localStorage. Prompt
// and unknown are transient - persisting them would just make the next
// mount race with re-derivation.
function derivePersistFrom(state: GeoPermission): PersistedState | null {
  if (state === 'granted') return 'granted'
  if (state === 'denied') return 'denied'
  if (state === 'revoked') return 'revoked'
  return null
}

export function useGeolocationPermission(): GeoState & {
  request: () => void
  refresh: () => void
  hideCta: () => void
  ctaHidden: boolean
} {
  const [permission, setPermission] = useState<GeoPermission>(() => {
    const persisted = readPersistedState()
    // Optimistically render as granted so the banner does not flash on
    // remount. The Permissions API / silent probe below will confirm or
    // correct this within one tick.
    if (persisted === 'granted') return 'granted'
    if (persisted === 'denied') return 'denied'
    if (persisted === 'revoked') return 'revoked'
    return 'unknown'
  })
  const [position, setPosition] = useState<GeolocationPosition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ctaHidden, setCtaHidden] = useState(() => {
    try { return typeof window !== 'undefined' && window.localStorage.getItem(HINT_KEY) === '1' } catch { return false }
  })
  const priorRef = useRef<GeoPermission>('unknown')

  // Apply a resolved permission state, mirror it to localStorage, and
  // flip granted -> prompt/denied transitions into 'revoked' so the UI
  // can distinguish "never enabled" from "had it, lost it".
  const applyPermission = useCallback((next: GeoPermission) => {
    setPermission((prev) => {
      const prior = priorRef.current
      let resolved = next
      if ((prior === 'granted') && (next === 'prompt' || next === 'denied')) {
        // Grant was revoked (browser settings / OS location off / user
        // reset the permission). Distinct signal from a first-time
        // 'prompt' so the caller can render an appropriate message.
        resolved = 'revoked'
      }
      priorRef.current = resolved
      writePersistedState(derivePersistFrom(resolved))
      return prev === resolved ? prev : resolved
    })
  }, [])

  const captureSilent = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (p) => { setPosition(p); setError(null); setBusy(false); applyPermission('granted') },
      (err) => {
        setBusy(false)
        setError(err.message || null)
        if (err.code === 1) applyPermission('denied')
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
    )
  }, [applyPermission])

  // Initial permission inspection + subscribe to changes.
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    if (!navigator.geolocation) { applyPermission('unsupported'); return }

    // Fast path: Permissions API is authoritative and change-tracked.
    if (hasPermissionsApi()) {
      let cancelled = false
      let status: PermissionStatus | null = null
      const apply = (state: PermissionState) => {
        if (cancelled) return
        applyPermission(state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt')
        if (state === 'granted') captureSilent()
      }
      const onChange = () => { if (status) apply(status.state) }
      ;(navigator as Navigator & { permissions: { query: (d: { name: string }) => Promise<PermissionStatus> } })
        .permissions.query({ name: 'geolocation' })
        .then((s) => {
          if (cancelled) return
          status = s
          apply(s.state)
          s.addEventListener('change', onChange)
        })
        .catch(() => { if (!cancelled) applyPermission('prompt') })
      return () => {
        cancelled = true
        if (status) status.removeEventListener('change', onChange)
      }
    }

    // Slow path (Safari historically): no Permissions API. Silent-probe
    // getCurrentPosition - if it succeeds without user interaction the
    // browser already had a grant; if it errors with code 1 the user has
    // refused; anything else means we should ask.
    let cancelled = false
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (cancelled) return
        setPosition(p)
        setError(null)
        applyPermission('granted')
      },
      (err) => {
        if (cancelled) return
        if (err.code === 1) applyPermission('denied')
        else applyPermission('prompt')
      },
      // Keep this probe cheap - do NOT enableHighAccuracy just to observe
      // permission state, and allow a stale cached fix.
      { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 10_000 },
    )
    return () => { cancelled = true }
  }, [applyPermission, captureSilent])

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      applyPermission('unsupported')
      return
    }
    setBusy(true)
    // Calling getCurrentPosition is what actually surfaces the browser
    // dialog when permission is 'prompt'. If it is already 'granted'
    // this is silent.
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition(p)
        setError(null)
        setBusy(false)
        applyPermission('granted')
      },
      (err) => {
        setBusy(false)
        setError(err.message || 'Could not access location.')
        if (err.code === 1) applyPermission('denied')
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    )
  }, [applyPermission])

  const refresh = useCallback(() => {
    if (permission === 'granted') captureSilent()
  }, [permission, captureSilent])

  const hideCta = useCallback(() => {
    setCtaHidden(true)
    try { window.localStorage.setItem(HINT_KEY, '1') } catch { /* fine */ }
  }, [])

  return { permission, position, error, busy, request, refresh, hideCta, ctaHidden }
}
