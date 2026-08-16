import { useCallback, useEffect, useState } from 'react'

// One-time, permission-aware geolocation authorization for staff/vendor
// dispatch surfaces. The rules the sprint spec calls out:
//   - inspect browser permission state where supported
//   - if granted: obtain position silently, do NOT re-prompt
//   - if prompt/undetermined: expose a single explanatory CTA that the caller
//     can render; only then invoke getCurrentPosition() to trigger the browser
//     permission dialog
//   - if denied: expose that as state so callers can render a small
//     "Enable in browser settings" affordance instead of re-nagging
//   - never conflate "online" with "location available"
// The hook does NOT begin watchPosition on its own. Callers that legitimately
// need continuous updates (network dispatch, active field assignment) start
// their own watch after `permission === 'granted'`.

export type GeoPermission = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported'

export interface GeoState {
  permission: GeoPermission
  position: GeolocationPosition | null
  error: string | null
  busy: boolean
}

// Local remember-my-choice so we do not re-explain to a user whose browser
// does not implement Permissions API and who has already dismissed us.
const HINT_KEY = 'pmv:geolocation-cta-hidden'

function hasPermissionsApi(): boolean {
  return typeof navigator !== 'undefined'
    && typeof (navigator as Navigator & { permissions?: unknown }).permissions !== 'undefined'
}

export function useGeolocationPermission(): GeoState & {
  request: () => void
  refresh: () => void
  hideCta: () => void
  ctaHidden: boolean
} {
  const [permission, setPermission] = useState<GeoPermission>('unknown')
  const [position, setPosition] = useState<GeolocationPosition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ctaHidden, setCtaHidden] = useState(() => {
    try { return typeof window !== 'undefined' && window.localStorage.getItem(HINT_KEY) === '1' } catch { return false }
  })

  const captureSilent = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (p) => { setPosition(p); setError(null); setBusy(false) },
      (err) => { setError(err.message || null); setBusy(false) },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
    )
  }, [])

  // Initial permission inspection + subscribe to changes.
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    if (!navigator.geolocation) { setPermission('unsupported'); return }
    if (!hasPermissionsApi()) { setPermission('prompt'); return }
    let cancelled = false
    let status: PermissionStatus | null = null
    const apply = (state: PermissionState) => {
      if (cancelled) return
      setPermission(state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt')
      if (state === 'granted') captureSilent()
    }
    ;(navigator as Navigator & { permissions: { query: (d: { name: string }) => Promise<PermissionStatus> } })
      .permissions.query({ name: 'geolocation' })
      .then((s) => { status = s; apply(s.state); s.addEventListener('change', () => apply(s.state)) })
      .catch(() => { if (!cancelled) setPermission('prompt') })
    return () => {
      cancelled = true
      if (status) status.onchange = null
    }
  }, [captureSilent])

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPermission('unsupported')
      return
    }
    setBusy(true)
    // Calling getCurrentPosition is what actually surfaces the browser dialog
    // when permission is 'prompt'. If it is already 'granted' this is silent.
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition(p)
        setError(null)
        setPermission('granted')
        setBusy(false)
      },
      (err) => {
        setBusy(false)
        setError(err.message || 'Could not access location.')
        // PermissionDeniedError.code === 1
        if (err.code === 1) setPermission('denied')
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    )
  }, [])

  const refresh = useCallback(() => {
    if (permission === 'granted') captureSilent()
  }, [permission, captureSilent])

  const hideCta = useCallback(() => {
    setCtaHidden(true)
    try { window.localStorage.setItem(HINT_KEY, '1') } catch {}
  }, [])

  return { permission, position, error, busy, request, refresh, hideCta, ctaHidden }
}
