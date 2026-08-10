import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Check, ShieldAlert, MapPin } from 'lucide-react'
import { api } from '../../lib/api'
import { categorizeActivity, describeActivity, timeAgo, type ActivityEvent } from '../../lib/activity'
import { useAppPath } from '../../lib/basePath'
import { playNotificationSound, soundKindFor } from '../../lib/sound'

const POLL_MS = 3_000
const DISMISSED_KEY = 'pmv_hq_notifications_dismissed'
const DISMISSED_MAX = 200

function readDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.slice(-DISMISSED_MAX) : [])
  } catch {
    return new Set()
  }
}

function writeDismissed(set: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    const arr = Array.from(set).slice(-DISMISSED_MAX)
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(arr))
  } catch {
    /* best effort */
  }
}

function eventDetailLine(event: ActivityEvent): string | null {
  if (!event.detail) return null
  let d: Record<string, unknown> = {}
  try { d = JSON.parse(event.detail) } catch { return null }
  const parts: string[] = []
  if (typeof d.location === 'string' && d.location) parts.push(d.location)
  if (typeof d.ip === 'string' && d.ip) parts.push(d.ip)
  if (typeof d.browser === 'string' && d.browser) parts.push(d.browser)
  return parts.length > 0 ? parts.join(' · ') : null
}

export function NotificationBell() {
  const p = useAppPath()
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed)
  const boxRef = useRef<HTMLDivElement>(null)
  const soundEnabledRef = useRef(true)
  const prevCountRef = useRef(0)

  useEffect(() => {
    api.get<{ sound_enabled: boolean }>('/admin/notification-prefs').then((r) => { soundEnabledRef.current = r.sound_enabled }).catch(() => {})
  }, [])

  const loadCount = useCallback(async () => {
    try {
      const r = await api.get<{ count: number }>('/admin/activity/unread-count')
      if (r.count > prevCountRef.current && soundEnabledRef.current) {
        try {
          const latest = await api.get<{ events: ActivityEvent[] }>('/admin/activity')
          playNotificationSound(latest.events[0] ? soundKindFor(latest.events[0].kind) : 'default')
        } catch { playNotificationSound('default') }
      }
      prevCountRef.current = r.count
      setCount(r.count)
    } catch {
      // retry on next poll
    }
  }, [])

  useEffect(() => {
    loadCount()
    const timer = window.setInterval(loadCount, POLL_MS)
    const onFocus = () => void loadCount()
    const onVisibility = () => { if (document.visibilityState === 'visible') void loadCount() }
    const onActivity = () => void loadCount()
    const onRefresh = () => void loadCount()
    window.addEventListener('focus', onFocus)
    window.addEventListener('pmv:activity', onActivity)
    window.addEventListener('pmv:refresh', onRefresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pmv:activity', onActivity)
      window.removeEventListener('pmv:refresh', onRefresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loadCount])

  useEffect(() => {
    function onClickAway(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
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
      } finally { setLoading(false) }
    }
  }

  function dismissOne(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(id)
      writeDismissed(next)
      return next
    })
  }

  async function acknowledgeAll() {
    try { await api.post('/admin/activity/mark-seen') } catch { /* retry later */ }
    setDismissed((prev) => {
      const next = new Set(prev)
      for (const event of events) next.add(event.id)
      writeDismissed(next)
      return next
    })
    prevCountRef.current = 0
    setCount(0)
  }

  async function openRecord(event: ActivityEvent) {
    dismissOne(event.id)
    // Keep the global server watermark conservative. A record-specific click
    // acknowledges what the employee actually opened without clearing the
    // rest of the notification tray locally.
    window.setTimeout(() => void loadCount(), 250)
  }

  const visibleEvents = events.filter((event) => !dismissed.has(event.id))

  return (
    <div className="relative" ref={boxRef}>
      <button onClick={toggle} className="relative grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-300 transition hover:border-gold/40 hover:text-gold" aria-label={count ? `Notifications, ${count} unread` : 'Notifications'} title="HQ notifications">
        <Bell size={16} strokeWidth={1.75} aria-hidden />
        {count > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-navy-950">{count > 99 ? '99+' : count}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-80 rounded-md border border-white/10 bg-navy-900 shadow-lg sm:w-96">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div><p className="text-sm font-semibold text-white">Notifications</p><p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">Updates remain until opened or cleared</p></div>
            <div className="flex items-center gap-3">
              {visibleEvents.length > 0 && <button type="button" onClick={acknowledgeAll} className="text-[11px] font-medium text-slate-400 hover:text-white">Clear all</button>}
              <Link to={p('activity')} onClick={() => setOpen(false)} className="text-xs font-medium text-gold hover:underline">View all</Link>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? <p className="px-4 py-6 text-center text-sm text-slate-400">Loading…</p> : visibleEvents.length === 0 ? <p className="px-4 py-6 text-center text-sm text-slate-400">{events.length === 0 ? 'No activity yet.' : 'All caught up.'}</p> : (
              <ul className="divide-y divide-white/5">
                {visibleEvents.map((event) => {
                  const category = categorizeActivity(event.kind)
                  const security = category === 'security'
                  const detail = eventDetailLine(event)
                  return (
                    <li key={event.id} className={`group px-4 py-3 text-sm ${security ? 'border-l-2 border-l-rose-500/70 bg-rose-500/[.05]' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            {security && <ShieldAlert size={13} className="mt-0.5 shrink-0 text-rose-400" />}
                            <div className="min-w-0">
                              <p className={security ? 'text-rose-100' : 'text-slate-200'}>{describeActivity(event)}</p>
                              {detail && <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400"><MapPin size={11} /> {detail}</p>}
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span>{timeAgo(event.created_at)}</span>
                                {event.client_user_id && <Link to={p(`clients/${event.client_user_id}`)} onClick={() => { void openRecord(event); setOpen(false) }} className="text-gold hover:underline">Open record</Link>}
                              </div>
                            </div>
                          </div>
                        </div>
                        <button type="button" onClick={() => dismissOne(event.id)} className="shrink-0 rounded p-1 text-slate-500 opacity-0 transition hover:bg-white/5 hover:text-white group-hover:opacity-100" title="Dismiss" aria-label="Dismiss"><Check size={13} /></button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
