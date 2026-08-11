import { useEffect, useState } from 'react'
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'

// Live SLA countdown chip. Ticks every second, changes color as the
// deadline approaches, then flips to a red "over SLA by Nh Nm" chip
// once the deadline has passed. Same component is reused on the client
// portal (Dashboard active-cases list) and in HQ (CasesAdmin), so the
// timer + colors + labels stay in sync everywhere.
//
// States:
//   - complete=true or due=null  → green "Response logged"
//   - remaining > 1h             → slate neutral
//   - 0 < remaining <= 1h        → amber "warning"
//   - remaining <= 0             → red pulsing "Overdue Nh Nm"

interface Props {
  due: string | null
  /** When true the timer stops and shows the resolved state. */
  complete?: boolean
  /** Optional prefix, e.g. "Response due", "Resolution due". */
  label?: string
  /** Compact = no icon, no prefix. Useful in dense tables. */
  compact?: boolean
}

function partsFromMs(ms: number) {
  const total = Math.floor(Math.abs(ms) / 1000)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return { days, hours, mins, secs, isNegative: ms < 0 }
}

function fmt({ days, hours, mins, secs }: ReturnType<typeof partsFromMs>): string {
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

export function SlaClock({ due, complete, label, compact }: Props) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (complete || !due) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [complete, due])

  if (complete) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
        {!compact && <CheckCircle2 size={12} />} Response logged
      </span>
    )
  }
  if (!due) return <span className="text-xs text-slate-500">No SLA set</span>

  const remaining = new Date(due).getTime() - now
  const parts = partsFromMs(remaining)
  const overdue = remaining < 0
  const warning = !overdue && remaining < 60 * 60 * 1000

  const tone = overdue
    ? 'text-rose-300 font-semibold pmv-sla-overdue-pulse'
    : warning
      ? 'text-amber-300 font-medium'
      : 'text-slate-400'
  const icon = overdue ? <AlertTriangle size={12} /> : <Clock size={12} />
  const prefix = compact ? '' : overdue ? 'Over SLA by ' : (label ? `${label} ` : '')
  const suffix = overdue ? '' : ''

  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs tabular-nums ${tone}`} title={overdue ? 'This case is past its SLA' : `Due ${new Date(due).toLocaleString()}`}>
      {!compact && icon}
      {overdue && !compact ? '-' : ''}{prefix}{fmt(parts)}{suffix}
    </span>
  )
}
