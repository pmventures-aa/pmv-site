import type { PresenceStatus, PresenceEntry } from '../../lib/presence'
import { humanizePresence, humanizeLastSeen } from '../../lib/presence'

// Small colored dot rendered next to a user's name to show whether they
// are actively signed in (green), idle (yellow), or away (red). Pair with
// the usePresence hook - callers pass the map entry they already fetched
// so the dot component itself stays presentational. Renders as a subtle
// slate dot when no entry is available (unknown status).

interface Props {
  entry?: PresenceEntry | undefined
  /** Force a specific status without an entry - useful for storybook /
   *  self-view where we already know the user is online. */
  status?: PresenceStatus
  size?: number
  /** Add "Online now" / "active 5m ago" tooltip on hover. */
  label?: boolean
  className?: string
}

const COLOR: Record<PresenceStatus, string> = {
  green: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.65)]',
  yellow: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,.55)]',
  red: 'bg-rose-400 shadow-[0_0_8px_rgba(248,113,113,.45)]',
}

export function PresenceDot({ entry, status, size = 8, label = true, className = '' }: Props) {
  const resolved = status ?? entry?.status
  const color = resolved ? COLOR[resolved] : 'bg-slate-500'
  const title = label
    ? `${humanizePresence(resolved)}${entry?.last_seen_at ? ` - ${humanizeLastSeen(entry.last_seen_at)}` : ''}`
    : undefined
  return (
    <span
      role={label ? 'img' : 'presentation'}
      aria-label={label ? humanizePresence(resolved) : undefined}
      title={title}
      className={`inline-block shrink-0 rounded-full ${color} ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
