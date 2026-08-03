import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { describeActivity, timeAgo, type ActivityEvent } from '../../lib/activity'
import { useAppPath } from '../../lib/basePath'
import { playNotificationSound, soundKindFor } from '../../lib/sound'

// "Auto refresh every minute or so for new things" — 30s keeps the badge and
// activity feed feeling live without hammering the API.
const POLL_MS = 30_000

export function NotificationBell() {
  const p = useAppPath()
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const soundEnabledRef = useRef(true)
  const prevCountRef = useRef(0)

  useEffect(() => {
    api
      .get<{ sound_enabled: boolean }>('/admin/notification-prefs')
      .then((r) => {
        soundEnabledRef.current = r.sound_enabled
      })
      .catch(() => {})
  }, [])

  const loadCount = useCallback(async () => {
    try {
      const r = await api.get<{ count: number }>('/admin/activity/unread-count')
      if (r.count > prevCountRef.current && soundEnabledRef.current) {
        // Something new landed — peek at the latest event to pick a tone.
        try {
          const latest = await api.get<{ events: ActivityEvent[] }>('/admin/activity')
          playNotificationSound(latest.events[0] ? soundKindFor(latest.events[0].kind) : 'default')
        } catch {
          playNotificationSound('default')
        }
      }
      prevCountRef.current = r.count
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

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [])

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next) {
      setLoading(true)
      try {
        const r = await api.get<{ events: ActivityEvent[] }>('/admin/activity')
        setEvents(r.events.slice(0, 8))
        await api.post('/admin/activity/mark-seen')
        prevCountRef.current = 0
        setCount(0)
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={toggle}
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-300 transition hover:border-gold/40 hover:text-gold"
        aria-label="Notifications"
      >
        <span aria-hidden>🔔</span>
        {count > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-navy-950">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-80 rounded-md border border-white/10 bg-navy-900 shadow-lg sm:w-96">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-sm font-semibold text-white">Activity</p>
            <Link to={p('activity')} onClick={() => setOpen(false)} className="text-xs font-medium text-gold hover:underline">
              View all
            </Link>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">Loading…</p>
            ) : events.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No activity yet.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {events.map((e) => (
                  <li key={e.id} className="px-4 py-3 text-sm">
                    <p className="text-slate-200">{describeActivity(e)}</p>
                    <p className="mt-1 text-xs text-slate-500">{timeAgo(e.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
