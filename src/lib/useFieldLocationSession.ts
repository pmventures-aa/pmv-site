import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import { useGeolocationPermission } from './useGeolocationPermission'

// Per-assignment field-location session hook. Pairs with the server
// endpoints under /admin/field-location (see functions/_lib/routes/
// fieldLocation.ts) and the schema in migration 0080.
//
// Lifecycle:
//
//   1. Caller passes an assignmentId when the provider enters an active
//      field status (EN_ROUTE / ON_SITE / WORK_IN_PROGRESS). Pass null
//      to disable and end any active session cleanly.
//   2. On mount, GET /session/active - if there is already an active
//      session for this user and this assignment, we resume it. If
//      there is one for a different assignment, we do not disturb it
//      (another surface owns it). If there is one that is stale, the
//      server's `stale` flag causes us to end it and open a fresh one.
//   3. Wait for useGeolocationPermission to report 'granted'. We never
//      trigger the browser dialog from this hook - the caller surfaces
//      its own consent UI and only mounts us once permission is real.
//   4. Open a session via POST /session/start, then watchPosition().
//   5. Client-side throttle mirrors the server: never send a point
//      within CLIENT_MIN_INTERVAL_MS AND CLIENT_MIN_DISTANCE_METERS
//      of the last accepted send. The server has its own guard so a
//      buggy client cannot flood, but throttling here saves battery
//      and bandwidth before the request even leaves the device.
//   6. On unmount, or when assignmentId flips to null, POST /session/
//      :id/end with the caller-supplied reason and stop the watch.
//
// The hook is deliberately narrow: it does NOT manage the setup banner,
// does NOT render UI, does NOT decide when to enter/leave active
// tracking. That is the caller's job. This module owns only the
// session/point machinery.

const CLIENT_MIN_INTERVAL_MS = 15_000
const CLIENT_MIN_DISTANCE_METERS = 15

export type FieldLocationEndedReason =
  | 'assignment_completed'
  | 'assignment_cancelled'
  | 'assignment_failed'
  | 'operator_stopped'
  | 'timeout'
  | 'permission_revoked'

export type FieldLocationTrackingState =
  | 'idle'          // hook is dormant (no assignment / no permission)
  | 'starting'      // acquiring the session, before the first successful post
  | 'active'        // watching and sending points
  | 'paused'        // permission was revoked mid-session; session ended, waiting to resume
  | 'error'         // unrecoverable API error; caller can retry by remounting

export interface UseFieldLocationSessionResult {
  state: FieldLocationTrackingState
  sessionId: string | null
  lastCoords: { latitude: number; longitude: number; accuracyMeters: number | null } | null
  lastSentAt: number | null
  pointsSent: number
  pointsThrottled: number
  error: string | null
  // Explicit end - callers use this on a "Stop sharing" affordance
  // rather than relying on unmount. On unmount we always end too.
  stop: (reason?: FieldLocationEndedReason) => Promise<void>
}

interface HookOptions {
  // When null the hook stays idle. Passing an assignmentId that
  // matches an existing active session on the server just resumes it.
  assignmentId: string | null
  // Point source, mirrors the CHECK constraint on
  // field_location_points.source. Defaults to 'browser'.
  source?: 'browser' | 'pwa' | 'native' | 'manual' | 'geofence'
  // Reason to pass to /session/end when the hook unmounts (e.g. the
  // assignment completed vs the operator stopped). Defaults to
  // 'operator_stopped' since the most common way for this hook to
  // end is the user leaving the field-work screen.
  endReasonOnUnmount?: FieldLocationEndedReason
}

interface ActiveSessionResponse {
  session: {
    id: string
    assignment_id: string
    provider_id: string
    status: string
    started_at: string
    ended_at: string | null
    last_latitude: number | null
    last_longitude: number | null
    last_seen_at: string | null
    point_count: number
  } | null
  stale?: boolean
}

interface StartSessionResponse {
  session: { id: string; assignment_id: string; started_at: string; last_latitude: number | null; last_longitude: number | null; point_count: number }
}

interface PointResponse { accepted: boolean; reason?: string; session_id?: string; point_id?: string }

// Haversine distance in meters. Mirrors the server helper so the
// client's throttle math cannot drift from the server's.
function distanceMeters(latA: number, lngA: number, latB: number, lngB: number): number {
  const R = 6_371_000
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRad(latB - latA)
  const dLng = toRad(lngB - lngA)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function useFieldLocationSession(options: HookOptions): UseFieldLocationSessionResult {
  const { assignmentId } = options
  const source = options.source ?? 'browser'
  const geoPerm = useGeolocationPermission()

  const [state, setState] = useState<FieldLocationTrackingState>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [lastCoords, setLastCoords] = useState<UseFieldLocationSessionResult['lastCoords']>(null)
  const [lastSentAt, setLastSentAt] = useState<number | null>(null)
  const [pointsSent, setPointsSent] = useState(0)
  const [pointsThrottled, setPointsThrottled] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const watchIdRef = useRef<number | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const assignmentIdRef = useRef<string | null>(assignmentId)
  const lastSentRef = useRef<{ latitude: number; longitude: number; ts: number } | null>(null)
  const stoppingRef = useRef(false)
  assignmentIdRef.current = assignmentId

  const clearWatch = useCallback(() => {
    if (watchIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }
    watchIdRef.current = null
  }, [])

  const endSession = useCallback(async (reason: FieldLocationEndedReason) => {
    const id = sessionIdRef.current
    sessionIdRef.current = null
    setSessionId(null)
    clearWatch()
    lastSentRef.current = null
    if (!id) return
    try {
      await api.post(`/admin/field-location/session/${id}/end`, { ended_reason: reason })
    } catch {
      // Session was likely already closed by another tab or the server -
      // this is a cleanup-shaped call, do not surface as an error to
      // the caller.
    }
  }, [clearWatch])

  const stop = useCallback(async (reason: FieldLocationEndedReason = 'operator_stopped') => {
    stoppingRef.current = true
    await endSession(reason)
    setState('idle')
  }, [endSession])

  // Send one point, respecting the client-side throttle. Returns true
  // if we sent, false if we throttled locally.
  const sendPoint = useCallback(async (position: GeolocationPosition, currentSessionId: string): Promise<boolean> => {
    const now = Date.now()
    const last = lastSentRef.current
    if (last) {
      const elapsed = now - last.ts
      const moved = distanceMeters(last.latitude, last.longitude, position.coords.latitude, position.coords.longitude)
      if (elapsed < CLIENT_MIN_INTERVAL_MS && moved < CLIENT_MIN_DISTANCE_METERS) {
        setPointsThrottled((count) => count + 1)
        return false
      }
    }
    try {
      const response = await api.post<PointResponse>(`/admin/field-location/session/${currentSessionId}/point`, {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy_meters: position.coords.accuracy ?? null,
        altitude_meters: position.coords.altitude ?? null,
        heading_degrees: position.coords.heading ?? null,
        speed_mps: position.coords.speed ?? null,
        source,
        captured_at: new Date(position.timestamp).toISOString(),
      })
      if (response.accepted) {
        lastSentRef.current = { latitude: position.coords.latitude, longitude: position.coords.longitude, ts: now }
        setLastCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy ?? null })
        setLastSentAt(now)
        setPointsSent((count) => count + 1)
        setState('active')
      } else {
        // Server throttled us anyway. Do not surface as an error, just
        // count it so the caller can display stats if desired.
        setPointsThrottled((count) => count + 1)
      }
      return true
    } catch (err) {
      // A single failed post should not tear down the whole session -
      // we might just be offline. watchPosition keeps firing and the
      // next one will retry.
      setError(err instanceof ApiError ? err.message : 'Could not send location update.')
      return false
    }
  }, [source])

  // Main effect: bring up / tear down the session as inputs change.
  useEffect(() => {
    if (!assignmentId) {
      // Caller has disabled tracking. End the session if we have one.
      if (sessionIdRef.current) void endSession('operator_stopped')
      setState('idle')
      return
    }
    if (geoPerm.permission === 'denied' || geoPerm.permission === 'revoked' || geoPerm.permission === 'unsupported') {
      // If we had an active session, end it as permission_revoked and
      // pause. The caller's setup surface will re-prompt.
      if (sessionIdRef.current) {
        void endSession('permission_revoked')
        setState('paused')
      } else {
        setState('idle')
      }
      return
    }
    if (geoPerm.permission !== 'granted') {
      // Still resolving or waiting for a first-time prompt. Do NOT
      // trigger the browser dialog here - the caller owns that flow.
      setState('idle')
      return
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('error')
      setError('This device cannot report location.')
      return
    }

    let cancelled = false
    stoppingRef.current = false
    setState('starting')
    setError(null)

    async function bootstrap() {
      try {
        // 1. Resume an existing active session for this assignment,
        //    otherwise open a new one.
        const active = await api.get<ActiveSessionResponse>('/admin/field-location/session/active')
        let currentId: string | null = null
        if (active.session && active.session.assignment_id === assignmentIdRef.current && !active.stale) {
          currentId = active.session.id
        } else {
          if (active.session && (active.stale || active.session.assignment_id !== assignmentIdRef.current)) {
            // Clean up the stale/wrong-assignment session before starting fresh.
            try { await api.post(`/admin/field-location/session/${active.session.id}/end`, { ended_reason: active.stale ? 'timeout' : 'operator_stopped' }) } catch { /* fine */ }
          }
          const started = await api.post<StartSessionResponse>('/admin/field-location/session/start', {
            assignment_id: assignmentIdRef.current,
            source,
          })
          currentId = started.session.id
        }
        if (cancelled || !currentId) return
        sessionIdRef.current = currentId
        setSessionId(currentId)

        // 2. Start watching. First success flips state to 'active'
        //    inside sendPoint().
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            if (cancelled || stoppingRef.current) return
            const id = sessionIdRef.current
            if (!id) return
            void sendPoint(position, id)
          },
          (err) => {
            if (cancelled) return
            // Permission revoked mid-watch surfaces as a
            // PERMISSION_DENIED error (code 1). End cleanly.
            if (err.code === 1) {
              void endSession('permission_revoked')
              setState('paused')
            }
            setError(err.message || 'Location watch failed.')
          },
          { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
        )
      } catch (err) {
        if (cancelled) return
        setState('error')
        setError(err instanceof ApiError ? err.message : 'Could not start the location session.')
      }
    }
    void bootstrap()

    return () => {
      cancelled = true
      clearWatch()
      // On teardown (assignmentId changed / unmount) end the server-
      // side session too, with the caller-supplied reason. If the
      // caller already called stop() explicitly, endSession is a no-op
      // because sessionIdRef was cleared.
      if (sessionIdRef.current && !stoppingRef.current) {
        void endSession(options.endReasonOnUnmount ?? 'operator_stopped')
      }
    }
    // We only want this effect to re-run when the assignment or the
    // permission state materially changes - sendPoint / endSession are
    // stable via useCallback but are excluded here to avoid churn on
    // every state tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, geoPerm.permission, source])

  return {
    state,
    sessionId,
    lastCoords,
    lastSentAt,
    pointsSent,
    pointsThrottled,
    error,
    stop,
  }
}
