import { useState, type ReactNode } from 'react'
import { btnOutline } from './ui'

export const HQ_RECENT_WINDOW = 3

export function useRecentWindow<T>(items: T[], size = HQ_RECENT_WINDOW) {
  const [expanded, setExpanded] = useState(false)
  const extra = Math.max(0, items.length - size)
  const visible = expanded ? items : items.slice(0, size)
  return {
    visible,
    extra,
    expanded,
    setExpanded,
    showing: visible.length,
    total: items.length,
    size,
  }
}

export function RecentWindowBar({
  extra,
  expanded,
  onToggle,
  noun = 'records',
  showing,
  total,
}: {
  extra: number
  expanded: boolean
  onToggle: () => void
  noun?: string
  showing: number
  total: number
}) {
  if (total === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
      <p className="text-xs text-slate-500">
        Showing {showing} of {total} {noun}, most recent first.
        {!expanded && extra > 0 ? ` ${extra} more available.` : ''}
      </p>
      {extra > 0 && (
        <button type="button" className={`${btnOutline} !px-3 !py-1.5 text-xs`} onClick={onToggle}>
          {expanded ? 'Show most recent + 3' : `Show ${extra} more`}
        </button>
      )}
    </div>
  )
}

export function RecentListShell({
  children,
  footer,
}: {
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[.015]">
      {children}
      {footer}
    </div>
  )
}

export function filterByNeedle<T>(items: T[], needle: string, haystack: (item: T) => string) {
  const term = needle.trim().toLowerCase()
  if (!term) return items
  return items.filter((item) => haystack(item).toLowerCase().includes(term))
}
