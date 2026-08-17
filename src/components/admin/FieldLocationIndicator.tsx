import { Radio } from 'lucide-react'
import type { FieldLocationTrackingState } from '../../lib/useFieldLocationSession'

// Subtle "Location Active" indicator used while a field session is
// running. Deliberately not the big setup banner - per the spec,
// during active field work the operator should see a small persistent
// affordance that explains why location is being collected and what
// assignment it is tied to, not a prompt to re-enable it.
//
// Renders nothing when tracking is idle so surfaces can drop it in
// unconditionally and let the hook state decide visibility.

export interface FieldLocationIndicatorProps {
  state: FieldLocationTrackingState
  lastSentAt: number | null
  assignmentLabel?: string
  pointsSent?: number
  onStop?: () => void
  className?: string
}

function relativeSeconds(ts: number | null): string | null {
  if (!ts) return null
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

export function FieldLocationIndicator({
  state,
  lastSentAt,
  assignmentLabel,
  pointsSent,
  onStop,
  className,
}: FieldLocationIndicatorProps) {
  if (state === 'idle') return null

  const tone =
    state === 'active' ? 'border-emerald-400/40 bg-emerald-400/[.07] text-emerald-200'
      : state === 'paused' ? 'border-amber-400/40 bg-amber-400/[.07] text-amber-200'
      : state === 'error' ? 'border-rose-400/40 bg-rose-400/[.07] text-rose-200'
      : 'border-slate-400/30 bg-slate-400/[.05] text-slate-300'

  const label =
    state === 'active' ? 'Location Active'
      : state === 'starting' ? 'Starting location'
      : state === 'paused' ? 'Location paused'
      : state === 'error' ? 'Location error'
      : ''

  const relative = state === 'active' ? relativeSeconds(lastSentAt) : null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${label}${assignmentLabel ? ` for ${assignmentLabel}` : ''}`}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold ${tone} ${className ?? ''}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${state === 'active' ? 'bg-emerald-400 animate-pulse' : state === 'paused' ? 'bg-amber-400' : state === 'error' ? 'bg-rose-400' : 'bg-slate-400'}`}
        aria-hidden="true"
      />
      <span>{label}</span>
      {assignmentLabel && (
        <>
          <span aria-hidden="true" className="text-white/30">·</span>
          <span className="max-w-[18ch] truncate">{assignmentLabel}</span>
        </>
      )}
      {relative && (
        <>
          <span aria-hidden="true" className="text-white/30">·</span>
          <span className="text-[10px] font-medium opacity-80">Last update {relative}</span>
        </>
      )}
      {pointsSent != null && pointsSent > 0 && state === 'active' && (
        <>
          <span aria-hidden="true" className="text-white/30">·</span>
          <span className="text-[10px] font-medium opacity-70">{pointsSent} pings</span>
        </>
      )}
      {onStop && (
        <button
          type="button"
          onClick={onStop}
          className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          {state === 'active' ? 'Stop' : 'End'}
        </button>
      )}
    </div>
  )
}

// Small helper for the dispatch live-map row: renders "Live" / "Last
// updated Ns ago" / "Location unavailable" so a stale pin is never
// presented as though it is currently live.
export interface FieldLocationStalenessProps {
  lastSeenAt: string | null | undefined
  sharingActive?: boolean | null
  className?: string
}

const STALE_MS = 90_000  // >90s without a heartbeat is stale
const OFFLINE_MS = 6 * 60_000  // >6 min is offline; no longer "last known live"

export function FieldLocationStaleness({ lastSeenAt, sharingActive, className }: FieldLocationStalenessProps) {
  if (!lastSeenAt) {
    return <span className={`text-[10px] font-medium text-slate-500 ${className ?? ''}`}>Location unavailable</span>
  }
  const ts = new Date(`${lastSeenAt.replace(' ', 'T')}Z`).getTime()
  if (!Number.isFinite(ts)) {
    return <span className={`text-[10px] font-medium text-slate-500 ${className ?? ''}`}>Location unavailable</span>
  }
  const elapsedMs = Date.now() - ts
  if (elapsedMs > OFFLINE_MS || sharingActive === false) {
    return (
      <span className={`text-[10px] font-medium text-slate-500 ${className ?? ''}`}>
        Last known · {relativeSeconds(ts)}
      </span>
    )
  }
  if (elapsedMs > STALE_MS) {
    return (
      <span className={`text-[10px] font-medium text-amber-300 ${className ?? ''}`}>
        Stale · updated {relativeSeconds(ts)}
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium text-emerald-300 ${className ?? ''}`}>
      <Radio size={9} className="opacity-90" aria-hidden="true" /> Live · updated {relativeSeconds(ts)}
    </span>
  )
}
