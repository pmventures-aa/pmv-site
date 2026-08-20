import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useGeolocationPermission } from '../../lib/useGeolocationPermission'
import { useLiveLocationShare } from '../../lib/useLiveLocationShare'

// Auto-location for the HQ mobile shell. This renders nothing - there is no
// banner. Location is handled two ways only:
//   1. One native permission request per login. On first mobile entry, once the
//      browser has confirmed the state is still undetermined, we ask exactly
//      once (the OS/browser dialog), then never nag again.
//   2. The persistent top-bar location icon (TopbarLocation) is the single
//      visible control after that - it shows live/off/blocked and toggles
//      sharing on tap.
// If the grant already exists, sharing starts silently. We never start on an
// active field assignment (that screen runs its own watch) or on the Network
// page (which has its own controls).
const PROMPTED_KEY = 'pmv:hq-location-prompted'

export function LocationAutoStart() {
  const location = useLocation()
  const geoPerm = useGeolocationPermission()
  const { sharing, start } = useLiveLocationShare()
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 767px)').matches
      : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const onNetworkPage = /\/network(\/|$)/.test(location.pathname)
  const onActiveAssignment = /\/field-work\/[^/]+/.test(location.pathname)

  // Silent auto-start when this device already granted location and we are not
  // on a surface that manages its own watch.
  useEffect(() => {
    if (!isMobile) return
    // Only auto-start once the BROWSER has confirmed the grant. Starting on the
    // optimistic localStorage 'granted' would fire watchPosition - and the
    // permission dialog - on every page open for a device whose real state is
    // still 'prompt'.
    if (!geoPerm.confirmed) return
    if (geoPerm.permission !== 'granted') return
    if (sharing !== 'idle') return
    if (onNetworkPage || onActiveAssignment) return
    start()
  }, [isMobile, geoPerm.confirmed, geoPerm.permission, sharing, onNetworkPage, onActiveAssignment, start])

  // One native permission prompt per login - replaces the old explanatory
  // banner. When the browser confirms permission is still undetermined, ask
  // exactly once this session, then leave control to the top-bar icon.
  const asked = useRef(false)
  const request = geoPerm.request
  useEffect(() => {
    if (!isMobile) return
    if (asked.current) return
    if (!geoPerm.confirmed) return
    if (geoPerm.permission !== 'prompt') return
    if (onActiveAssignment) return
    let already = false
    try { already = sessionStorage.getItem(PROMPTED_KEY) === '1' } catch { /* private mode - fall through */ }
    asked.current = true
    if (already) return
    try { sessionStorage.setItem(PROMPTED_KEY, '1') } catch { /* fine */ }
    request()
  }, [isMobile, geoPerm.confirmed, geoPerm.permission, onActiveAssignment, request])

  return null
}
