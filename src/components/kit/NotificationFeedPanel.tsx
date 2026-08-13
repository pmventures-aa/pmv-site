import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AtSign, Bell, Check, Mail, MessageSquare, X } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'

type FeedItem = {
  id: string; kind: string; subject_type: string | null; subject_id: string | null
  title: string; body: string | null; deep_link_path: string | null
  actor_user_id: string | null; actor_name: string | null
  read_at: string | null; dismissed_at: string | null; created_at: string
}

const POLL_MS = 4000

export function resolveHqDeepLink(path: string, p: (s: string) => string): string {
  const raw = String(path || '').trim()
  if (!raw || /^https?:/i.test(raw)) return raw
  const qIndex = raw.indexOf('?')
  const pathname = qIndex >= 0 ? raw.slice(0, qIndex) : raw
  const search = qIndex >= 0 ? raw.slice(qIndex + 1) : ''
  let stripped = pathname.replace(/^\/hq\/?/i, '').replace(/^\//, '')
  const params = new URLSearchParams(search)
  if (stripped === 'communications') {
    stripped = 'messages'
    if (!params.get('tab')) params.set('tab', 'email')
  }
  if (params.get('tab') === 'threads') params.set('tab', 'staff')
  const qs = params.toString()
  return qs ? `${p(stripped)}?${qs}` : p(stripped)
}

export function NotificationFeedPanel({ surface = 'admin' }: { surface?: 'admin' | 'portal' }) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(false)
  const base = surface === 'portal' ? '/portal' : '/admin'
  const p = useAppPath()

  const loadCount = useCallback(async () => {
    try {
      const r = await api.get<{ unread_count: number }>(`${base}/notifications/feed?limit=1`)
      setUnread(r.unread_count)
    } catch {}
  }, [base])

  const loadFull = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ notifications: FeedItem[]; unread_count: number }>(`${base}/notifications/feed?limit=40`)
      setItems(r.notifications)
      setUnread(r.unread_count)
    } catch (err) { if (err instanceof ApiError) console.error(err) }
    finally { setLoading(false) }
  }, [base])

  useEffect(() => { void loadCount() }, [loadCount])
  useEffect(() => {
    const timer = window.setInterval(() => void loadCount(), POLL_MS)
    const onFocus = () => void loadCount()
    const onVisibility = () => { if (document.visibilityState === 'visible') void loadCount() }
    const onRefresh = () => void loadCount()
    const onActivity = () => void loadCount()
    window.addEventListener('focus', onFocus)
    window.addEventListener('pmv:refresh', onRefresh)
    window.addEventListener('pmv:activity', onActivity)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pmv:refresh', onRefresh)
      window.removeEventListener('pmv:activity', onActivity)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loadCount])
  useEffect(() => { if (open) void loadFull() }, [open, loadFull])

  async function markAllRead() {
    try { await api.post(`${base}/notifications/mark-read`, { all: true }); setUnread(0); await loadFull() } catch {}
  }
  async function dismiss(id: string) {
    try { await api.post(`${base}/notifications/dismiss`, { ids: [id] }); setItems((c) => c.filter((n) => n.id !== id)) } catch {}
  }
  async function markRead(id: string) {
    try { await api.post(`${base}/notifications/mark-read`, { ids: [id] }); setItems((c) => c.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)); setUnread((n) => Math.max(0, n - 1)) } catch {}
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="relative grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-300 transition hover:border-gold/40 hover:bg-gold/5 hover:text-gold" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
        <Bell size={16}/>
        {unread > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}/>
          <div className="absolute right-0 top-11 z-50 w-[380px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-white/10 bg-navy-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-3">
              <p className="text-sm font-extrabold text-white">Notifications</p>
              <div className="flex items-center gap-2">
                {unread > 0 && <button className="text-[11px] font-semibold text-slate-400 hover:text-gold" onClick={() => void markAllRead()}><Check size={11} className="mr-1 inline"/>Mark all read</button>}
                <button className="text-slate-500 hover:text-white" onClick={() => setOpen(false)}><X size={14}/></button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {loading && !items.length && <p className="p-4 text-xs text-slate-500">Loading…</p>}
              {!loading && !items.length && <p className="p-4 text-xs text-slate-500">Nothing new. When there is, it'll show up here.</p>}
              {items.map((n) => (
                <div key={n.id} className={`group relative flex items-start gap-3 border-b border-white/[.05] px-3 py-3 ${n.read_at ? '' : 'bg-rose-500/[.06]'}`}>
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/[.03] text-gold">{iconFor(n.kind)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-slate-400">{n.body}</p>}
                    <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-500">
                      <span>{new Date(n.created_at).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}</span>
                      {n.deep_link_path && (
                        <Link to={resolveHqDeepLink(n.deep_link_path, p)} onClick={() => { void markRead(n.id); setOpen(false) }} className="font-semibold text-gold hover:underline">Open</Link>
                      )}
                      {!n.read_at && <button onClick={() => void markRead(n.id)} className="text-slate-500 hover:text-gold">Mark read</button>}
                    </div>
                  </div>
                  <button onClick={() => void dismiss(n.id)} className="opacity-0 transition group-hover:opacity-100" aria-label="Dismiss"><X size={12} className="text-slate-500 hover:text-white"/></button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function iconFor(kind: string) {
  if (kind.startsWith('email.')) return <Mail size={12}/>
  if (kind === 'conversation.mention') return <AtSign size={12}/>
  if (kind.startsWith('conversation.')) return <MessageSquare size={12}/>
  return <Bell size={12}/>
}
