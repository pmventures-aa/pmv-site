import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'

// Live location sharing for staff/vendor dispatch surfaces. Encapsulates the
// watchPosition loop that posts a ping to /admin/location (throttled) plus the
// /admin/location/stop teardown, so the Network & Dispatch page, the HQ mobile
// auto-start, and the top-bar indicator share ONE implementation. The caller is
// responsible for deciding WHEN to share (permission gate, mobile-only rules,
// "not on an active assignment"); this hook only owns HOW.
//
// State is a module-level singleton: one watch and one shared `sharing` value
// across every surface, so a persistent top-bar control and a page-level control
// never spin up competing watches or disagree about whether this device is live.
// The watch deliberately survives component unmount (SPA navigation) - it is
// stopped only by an explicit stop() so sharing keeps flowing as the operator
// moves between HQ pages.
export type SharingState = 'idle' | 'starting' | 'live' | 'error'

let sharing: SharingState = 'idle'
let watchId: number | null = null
let lastLocationSend = 0
const listeners = new Set<() => void>()

function notify() { listeners.forEach((l) => l()) }
function setSharing(next: SharingState) {
  if (sharing === next) return
  sharing = next
  notify()
}

// Start is safe to call repeatedly: it no-ops while a watch is already running.
export function startLiveLocation(): void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) { setSharing('error'); return }
  if (watchId != null) return
  setSharing('starting')
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const now = Date.now()
      if (now - lastLocationSend < 20_000) return
      lastLocationSend = now
      void api.post('/admin/location', {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy_m: position.coords.accuracy,
      }).then(() => setSharing('live')).catch(() => setSharing('error'))
    },
    (error) => {
      setSharing('error')
      console.error('[location] watchPosition failed', error?.message || error)
    },
    { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
  )
}

export async function stopLiveLocation(): Promise<void> {
  if (watchId != null) navigator.geolocation.clearWatch(watchId)
  watchId = null
  lastLocationSend = 0
  try {
    await api.post('/admin/location/stop')
    setSharing('idle')
  } catch (err) {
    setSharing('idle')
    console.error('[location] stop failed', err instanceof ApiError ? err.message : err)
  }
}

export function useLiveLocationShare({ onChanged }: { onChanged?: () => void } = {}): {
  sharing: SharingState
  start: () => void
  stop: () => Promise<void>
} {
  const [state, setState] = useState<SharingState>(sharing)
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  useEffect(() => {
    const listener = () => { setState(sharing); onChangedRef.current?.() }
    listeners.add(listener)
    setState(sharing) // sync any change that landed before this subscribe
    return () => { listeners.delete(listener) }
  }, [])

  return { sharing: state, start: startLiveLocation, stop: stopLiveLocation }
}
