import { useEffect, useState } from 'react'
import { Clock, Compass, Flag, MapPin, ShieldOff, StopCircle } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { EmptyState } from './ui'

// Assignment location history for the staff/admin view of a field
// assignment. Consumes GET /admin/field-location/assignment/:id/history
// (see functions/_lib/routes/fieldLocation.ts, gated by
// field.location.view_history). The endpoint records
// FIELD_LOCATION_HISTORY_VIEWED on every successful read, so a
// viewer's access to the trail is itself audited.
//
// A viewer whose role does not grant the granular permission gets a
// 403 from the endpoint; we render an "access-restricted" empty state
// rather than an error, matching how the rest of HQ treats permission
// denials.

interface HistorySession {
  id: string
  assignment_id: string
  provider_id: string
  status: string
  started_at: string
  ended_at: string | null
  ended_reason: string | null
  start_latitude: number | null
  start_longitude: number | null
  last_latitude: number | null
  last_longitude: number | null
  last_accuracy_m: number | null
  last_seen_at: string | null
  point_count: number
}

interface HistoryPoint {
  id: string
  session_id: string
  latitude: number
  longitude: number
  accuracy_meters: number | null
  altitude_meters: number | null
  heading_degrees: number | null
  speed_mps: number | null
  source: string
  captured_at: string
}

interface HistoryResponse {
  assignment_id: string
  sessions: HistorySession[]
  points: HistoryPoint[]
  truncated: boolean
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return 'Not recorded'
  const ts = new Date(`${iso.replace(' ', 'T')}Z`)
  if (Number.isNaN(ts.getTime())) return iso
  return ts.toLocaleString()
}

function formatDuration(startIso: string, endIso: string | null): string {
  const start = new Date(`${startIso.replace(' ', 'T')}Z`).getTime()
  const end = endIso ? new Date(`${endIso.replace(' ', 'T')}Z`).getTime() : Date.now()
  const secs = Math.max(0, Math.round((end - start) / 1000))
  if (secs < 60) return `${secs}s`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  return rem ? `${hours}h ${rem}m` : `${hours}h`
}

const ENDED_REASON_COPY: Record<string, string> = {
  assignment_completed: 'Assignment completed',
  assignment_cancelled: 'Assignment cancelled',
  assignment_failed: 'Assignment failed',
  operator_stopped: 'Stopped by operator',
  timeout: 'Timed out (no heartbeat)',
  permission_revoked: 'Location permission revoked mid-visit',
}

export function FieldLocationHistory({ assignmentId, className }: { assignmentId: string; className?: string }) {
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    setErrorMessage(null)
    api.get<HistoryResponse>(`/admin/field-location/assignment/${assignmentId}/history`)
      .then((response) => {
        if (cancelled) return
        setData(response)
        setState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 403) {
          setState('forbidden')
          return
        }
        setErrorMessage(err instanceof ApiError ? err.message : 'Could not load location history.')
        setState('error')
      })
    return () => { cancelled = true }
  }, [assignmentId])

  if (state === 'loading') {
    return (
      <section className={`rounded-xl border border-white/10 bg-white/[.015] p-4 ${className ?? ''}`}>
        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Location trail</p>
        <p className="mt-2 text-sm text-slate-500">Loading location history…</p>
      </section>
    )
  }

  if (state === 'forbidden') {
    return (
      <section className={`rounded-xl border border-white/10 bg-white/[.015] p-4 ${className ?? ''}`}>
        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Location trail</p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-400">
          <ShieldOff size={13} /> Your role does not include field.location.view_history.
        </p>
      </section>
    )
  }

  if (state === 'error') {
    return (
      <section className={`rounded-xl border border-rose-400/20 bg-rose-400/[.04] p-4 ${className ?? ''}`}>
        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-rose-200">Location trail</p>
        <p className="mt-2 text-sm text-rose-200">{errorMessage}</p>
      </section>
    )
  }

  const sessions = data?.sessions ?? []
  if (!sessions.length) {
    return (
      <section className={`rounded-xl border border-white/10 bg-white/[.015] p-4 ${className ?? ''}`}>
        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Location trail</p>
        <div className="mt-2"><EmptyState label="No location sessions recorded for this assignment." /></div>
      </section>
    )
  }

  const totalPoints = data?.points.length ?? 0
  const activeSession = sessions.find((s) => s.status === 'active')

  return (
    <section className={`rounded-xl border border-white/10 bg-white/[.015] p-4 ${className ?? ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-gold/85">Location trail</p>
          <p className="mt-1 text-xs text-slate-500">
            {sessions.length} session{sessions.length === 1 ? '' : 's'} · {totalPoints} point{totalPoints === 1 ? '' : 's'}
            {data?.truncated && <span className="ml-1 text-amber-300">(truncated)</span>}
          </p>
        </div>
        {activeSession && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/[.07] px-2.5 py-0.5 text-[10px] font-semibold text-emerald-200">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
            Live session in progress
          </span>
        )}
      </div>

      <ol className="mt-4 space-y-3">
        {sessions.map((session) => {
          const endedReason = session.ended_reason ? ENDED_REASON_COPY[session.ended_reason] ?? session.ended_reason : null
          return (
            <li key={session.id} className="rounded-lg border border-white/[.07] bg-navy-950/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <Compass size={13} className="text-gold shrink-0" />
                    <span className="font-semibold text-white">Session</span>
                    <span className="text-slate-500 font-mono">{session.id.slice(0, 10)}</span>
                    {session.status === 'active' ? (
                      <span className="rounded-full border border-emerald-400/40 bg-emerald-400/[.07] px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-200">Active</span>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-white/[.03] px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400">Ended</span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{session.point_count} coordinate{session.point_count === 1 ? '' : 's'} · Duration {formatDuration(session.started_at, session.ended_at)}</p>
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
                <div className="flex items-start gap-1.5">
                  <Flag size={11} className="mt-0.5 text-slate-500 shrink-0" />
                  <div>
                    <dt className="font-semibold text-slate-300">Tracking started</dt>
                    <dd className="text-slate-500">{formatWhen(session.started_at)}</dd>
                    {session.start_latitude != null && session.start_longitude != null && (
                      <dd className="text-slate-600 font-mono text-[10px]">
                        {session.start_latitude.toFixed(5)}, {session.start_longitude.toFixed(5)}
                      </dd>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-1.5">
                  <MapPin size={11} className="mt-0.5 text-slate-500 shrink-0" />
                  <div>
                    <dt className="font-semibold text-slate-300">Last known</dt>
                    <dd className="text-slate-500">{formatWhen(session.last_seen_at)}</dd>
                    {session.last_latitude != null && session.last_longitude != null && (
                      <dd className="text-slate-600 font-mono text-[10px]">
                        {session.last_latitude.toFixed(5)}, {session.last_longitude.toFixed(5)}
                        {session.last_accuracy_m != null && ` · ±${Math.round(session.last_accuracy_m)}m`}
                      </dd>
                    )}
                  </div>
                </div>
                {session.ended_at && (
                  <div className="flex items-start gap-1.5 sm:col-span-2">
                    <StopCircle size={11} className="mt-0.5 text-slate-500 shrink-0" />
                    <div>
                      <dt className="font-semibold text-slate-300">Tracking ended</dt>
                      <dd className="text-slate-500">{formatWhen(session.ended_at)}</dd>
                      {endedReason && <dd className="text-slate-600">{endedReason}</dd>}
                    </div>
                  </div>
                )}
                {!session.ended_at && (
                  <div className="flex items-start gap-1.5 sm:col-span-2">
                    <Clock size={11} className="mt-0.5 text-amber-300 shrink-0" />
                    <div>
                      <dt className="font-semibold text-slate-300">Still tracking</dt>
                      <dd className="text-amber-200/80">This session has not been closed.</dd>
                    </div>
                  </div>
                )}
              </dl>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
