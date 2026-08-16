import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'

// Live location sharing for staff/vendor dispatch surfaces. Encapsulates the
// watchPosition loop that posts a ping to /admin/location (throttled) plus the
// /admin/location/stop teardown, so the Network & Dispatch page and the HQ
// mobile auto-start surface share one implementation. The caller is
// responsible for deciding WHEN to share (permission gate, mobile-only rules,
// "not on an active assignment"); this hook only owns HOW.
//
// Start is safe to call repeatedly: it no-ops while a watch is already running.
export type SharingState = 'idle' | 'starting' | 'live' | 'error'

export function useLiveLocationShare({ onChanged }: { onChanged?: () => void } = {}): {
  sharing: SharingState
  start: () => void
  stop: () => Promise<void>
} {
  const [sharing, setSharing] = useState<SharingState>('idle')
  const watchId = useRef<number | null>(null)
  const lastLocationSend = useRef(0)
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setSharing('error')
      return
    }
    if (watchId.current != null) return
    setSharing('starting')
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now()
        if (now - lastLocationSend.current < 20_000) return
        lastLocationSend.current = now
        void api.post('/admin/location', {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy_m: position.coords.accuracy,
        }).then(() => {
          setSharing('live')
          onChangedRef.current?.()
        }).catch(() => {
          setSharing('error')
          // Page owners get a toast via onChanged; keep the hook silent.
          onChangedRef.current?.()
        })
      },
      (error) => {
        setSharing('error')
        console.error('[location] watchPosition failed', error?.message || error)
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    )
  }, [])

  const stop = useCallback(async () => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    lastLocationSend.current = 0
    try {
      await api.post('/admin/location/stop')
      setSharing('idle')
      onChangedRef.current?.()
    } catch (err) {
      setSharing('idle')
      console.error('[location] stop failed', err instanceof ApiError ? err.message : err)
    }
  }, [])

  useEffect(() => () => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
  }, [])

  return { sharing, start, stop }
}
