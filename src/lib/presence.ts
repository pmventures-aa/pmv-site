import { useEffect, useState } from 'react'
import { api } from './api'

// Shared client hook for the green/yellow/red presence dot on both HQ and
// portal surfaces. Pass a list of user ids and the hook batches them into
// a single request, then polls every 30s while the tab is visible. Works
// against /admin/presence or /portal/presence depending on which surface
// is asking - both routes return the same shape.

export type PresenceStatus = 'green' | 'yellow' | 'red'
export interface PresenceEntry { status: PresenceStatus; last_seen_at: string | null }

const POLL_MS = 30_000

export function usePresence(userIds: string[], scope: 'admin' | 'portal' = 'admin'): Record<string, PresenceEntry> {
  const [statuses, setStatuses] = useState<Record<string, PresenceEntry>>({})
  const key = userIds.slice().sort().join(',')

  useEffect(() => {
    if (!key) { setStatuses({}); return }
    let cancelled = false
    async function pull() {
      try {
        const res = await api.get<{ statuses: Record<string, PresenceEntry> }>(`/${scope}/presence?ids=${encodeURIComponent(key)}`)
        if (!cancelled) setStatuses(res.statuses)
      } catch {
        // Presence is nice-to-have. On failure just keep whatever we had.
      }
    }
    void pull()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void pull()
    }, POLL_MS)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [key, scope])

  return statuses
}

export function humanizePresence(status: PresenceStatus | undefined): string {
  switch (status) {
    case 'green': return 'Online now'
    case 'yellow': return 'Recently active'
    case 'red': return 'Away'
    default: return 'Status unknown'
  }
}

export function humanizeLastSeen(lastSeen: string | null | undefined): string {
  if (!lastSeen) return 'Never signed in'
  const raw = lastSeen.includes('T') ? lastSeen : lastSeen.replace(' ', 'T') + 'Z'
  const ms = Date.now() - Date.parse(raw)
  if (Number.isNaN(ms)) return 'Never signed in'
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'active just now'
  if (mins < 60) return `active ${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `active ${hours}h ago`
  const days = Math.floor(hours / 24)
  return `active ${days}d ago`
}
