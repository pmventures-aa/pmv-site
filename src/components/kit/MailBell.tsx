import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'

// Unread-message badge for the top bar, shared by both the client portal
// (Shell.tsx) and the staff console (AdminLayout.tsx) — both read the same
// /portal/message-threads/unread-count endpoint (scoped per role: a
// client's own threads, a staff member's assigned clients, or everything
// for admin). Deliberately simpler than NotificationBell (no dropdown
// preview) — clicking goes straight to the Messages page, which already
// shows the full unread state per thread.
const POLL_MS = 30_000

export function MailBell() {
  const p = useAppPath()
  const [count, setCount] = useState(0)

  const loadCount = useCallback(async () => {
    try {
      const r = await api.get<{ count: number }>('/portal/message-threads/unread-count')
      setCount(r.count)
    } catch {
      // transient network error — next poll will retry
    }
  }, [])

  useEffect(() => {
    loadCount()
    const t = setInterval(loadCount, POLL_MS)
    return () => clearInterval(t)
  }, [loadCount])

  return (
    <Link
      to={p('messages')}
      className="relative grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-300 transition hover:border-gold/40 hover:text-gold"
      aria-label="Messages"
    >
      <span aria-hidden>✉</span>
      {count > 0 && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-navy-950">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
