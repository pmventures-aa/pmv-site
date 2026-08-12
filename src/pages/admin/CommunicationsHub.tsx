import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, BellRing, Inbox, Mail, MessageSquare, RefreshCw, Send, Timer, TrendingUp, Users } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag, btnSecondary, btnPrimary, inputCls } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { useAppPath } from '../../lib/basePath'
import { ConversationsPanel } from './ConversationsPanel'

type Overview = {
  unread_threads: number
  active_threads_7d: number
  aging_threads: number
  campaigns_sent_7d: number
  emails_sent_7d: number
  avg_response_minutes: number | null
  generated_at: string
}

type NotificationEvent = {
  event_key: string
  label: string
  category: string
  audience: string
  description: string | null
  in_app_enabled: 0 | 1
  email_enabled: 0 | 1
  desktop_enabled: 0 | 1
  sound_enabled: 0 | 1
}

type ReportingResponse = {
  range_days: number
  daily_thread_volume: Array<{ day: string; n: number }>
  daily_email_volume: Array<{ day: string; n: number }>
  top_responders: Array<{ id: string; full_name: string; email: string; reply_count: number }>
  aging_threads: Array<{ id: string; subject: string; client_name: string; client_email: string; last_message_at: string }>
}

type Tab = 'overview' | 'threads' | 'notifications' | 'reporting'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'threads', label: 'Threads' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'reporting', label: 'Reporting' },
]

export default function CommunicationsHub() {
  const p = useAppPath()
  const [tab, setTab] = useState<Tab>('overview')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  const loadOverview = useCallback(async () => {
    setLoading(true)
    try {
      setOverview(await api.get<Overview>('/admin/communications/overview'))
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadOverview() }, [loadOverview])

  return (
    <div className="space-y-6">
      <PageIntro kicker="Communications Hub" title="One view. Every channel." subtitle="Client threads, staff DMs, outbound email, and per-user notification settings in one place. Deep-link into the Email Center or Inbox for their full toolset." />

      <div className="border-b border-white/10">
        <div className="flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`relative shrink-0 px-4 py-2.5 text-sm font-semibold transition ${tab === t.id ? 'text-gold' : 'text-slate-400 hover:text-white'}`}>
              {t.label}
              {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-t-full bg-gold"/>}
            </button>
          ))}
          <div className="ml-auto hidden shrink-0 items-center gap-2 sm:flex">
            <Link to={p('communications/email')} className={btnSecondary}><Send size={14}/>Email Center</Link>
            <Link to={p('messages')} className={btnSecondary}><Inbox size={14}/>Inbox</Link>
            <button className={btnSecondary} onClick={() => void loadOverview()}><RefreshCw size={14}/>Refresh</button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 pb-2 sm:hidden">
          <Link to={p('communications/email')} className={btnSecondary}><Send size={14}/>Email Center</Link>
          <Link to={p('messages')} className={btnSecondary}><Inbox size={14}/>Inbox</Link>
          <button className={btnSecondary} onClick={() => void loadOverview()}><RefreshCw size={14}/>Refresh</button>
        </div>
      </div>

      {tab === 'overview' && <OverviewTab overview={overview} loading={loading}/>}
      {tab === 'threads' && <ConversationsPanel/>}
      {tab === 'notifications' && <NotificationsTab/>}
      {tab === 'reporting' && <ReportingTab/>}
    </div>
  )
}

function StatTile({ label, value, hint, icon: Icon, tone = 'slate' }: { label: string; value: string | number; hint?: string; icon: any; tone?: 'slate' | 'gold' | 'amber' | 'green' }) {
  const toneCls = tone === 'gold' ? 'text-gold' : tone === 'amber' ? 'text-amber-300' : tone === 'green' ? 'text-emerald-300' : 'text-slate-300'
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[.02] ${toneCls}`}><Icon size={16}/></span>
        {hint && <Tag>{hint}</Tag>}
      </div>
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[.14em] text-slate-500">{label}</p>
      <p className="mt-2 font-display text-3xl font-extrabold text-white">{value}</p>
    </Panel>
  )
}

function OverviewTab({ overview, loading }: { overview: Overview | null; loading: boolean }) {
  const p = useAppPath()
  if (loading && !overview) return <Panel><p className="text-sm text-slate-400">Loading overview…</p></Panel>
  if (!overview) return <Panel><p className="text-sm text-slate-400">Overview data is not available right now.</p></Panel>

  const responseLabel = overview.avg_response_minutes == null ? '-' : overview.avg_response_minutes < 60 ? `${overview.avg_response_minutes}m` : `${(overview.avg_response_minutes / 60).toFixed(1)}h`

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile label="Unread threads (yours)" value={overview.unread_threads} icon={MessageSquare} tone={overview.unread_threads > 0 ? 'gold' : 'slate'} hint="Real-time"/>
        <StatTile label="Aging conversations" value={overview.aging_threads} icon={AlertTriangle} tone={overview.aging_threads > 0 ? 'amber' : 'slate'} hint="No staff reply in 24h+"/>
        <StatTile label="Avg staff response" value={responseLabel} icon={Timer} tone="green" hint="7-day rolling"/>
        <StatTile label="Active threads" value={overview.active_threads_7d} icon={Users} hint="Last 7 days"/>
        <StatTile label="Campaigns sent" value={overview.campaigns_sent_7d} icon={Send} hint="Last 7 days"/>
        <StatTile label="Emails delivered" value={overview.emails_sent_7d} icon={Mail} hint="Last 7 days"/>
      </div>

      <Panel>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-extrabold text-white">Where things stand</p>
            <p className="mt-1 text-xs text-slate-500">Fast jumps into the specialized workspaces.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <Link to={p('messages')} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[.02] p-4 transition hover:border-gold/40 hover:bg-white/[.04]">
            <div><p className="text-sm font-bold text-white">Client & vendor threads</p><p className="mt-1 text-xs text-slate-400">Two-way conversations with clients, coworkers, and vendors.</p></div>
            <ArrowRight size={16} className="text-gold"/>
          </Link>
          <Link to={p('communications/email')} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[.02] p-4 transition hover:border-gold/40 hover:bg-white/[.04]">
            <div><p className="text-sm font-bold text-white">Email Center</p><p className="mt-1 text-xs text-slate-400">Compose, schedule, template, and audience-target outbound.</p></div>
            <ArrowRight size={16} className="text-gold"/>
          </Link>
          <Link to={p('cases')} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[.02] p-4 transition hover:border-gold/40 hover:bg-white/[.04]">
            <div><p className="text-sm font-bold text-white">Cases & SLA</p><p className="mt-1 text-xs text-slate-400">Live case timers when a thread escalates to a tracked request.</p></div>
            <ArrowRight size={16} className="text-gold"/>
          </Link>
        </div>
      </Panel>

      <p className="text-[11px] text-slate-600">Data as of {new Date(overview.generated_at).toLocaleString()}</p>
    </div>
  )
}

function NotificationsTab() {
  const [events, setEvents] = useState<NotificationEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState<Record<string, Partial<NotificationEvent>>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ events: NotificationEvent[] }>('/admin/notification-center')
      setEvents(r.events)
      setDirty({})
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const byCategory = useMemo(() => {
    const groups: Record<string, NotificationEvent[]> = {}
    for (const e of events) (groups[e.category] = groups[e.category] || []).push(e)
    return groups
  }, [events])

  function toggle(eventKey: string, field: 'in_app_enabled' | 'email_enabled' | 'desktop_enabled' | 'sound_enabled', next: boolean) {
    setEvents((current) => current.map((e) => e.event_key === eventKey ? { ...e, [field]: next ? 1 : 0 } : e))
    setDirty((d) => ({ ...d, [eventKey]: { ...(d[eventKey] || {}), [field]: next } }))
  }

  async function save() {
    const preferences = Object.entries(dirty).map(([event_key, changes]) => {
      const source = events.find((e) => e.event_key === event_key)
      return {
        event_key,
        in_app_enabled: (changes.in_app_enabled ?? source?.in_app_enabled === 1) as boolean,
        email_enabled: (changes.email_enabled ?? source?.email_enabled === 1) as boolean,
        desktop_enabled: (changes.desktop_enabled ?? source?.desktop_enabled === 1) as boolean,
        sound_enabled: (changes.sound_enabled ?? source?.sound_enabled === 1) as boolean,
      }
    })
    if (!preferences.length) return
    setSaving(true)
    try {
      await api.patch('/admin/notification-center/preferences', { preferences })
      toast.success('Notification preferences saved')
      setDirty({})
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save preferences')
    } finally { setSaving(false) }
  }

  if (loading) return <Panel><p className="text-sm text-slate-400">Loading your notification preferences…</p></Panel>

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><BellRing size={16} className="text-gold"/><p className="text-sm font-extrabold text-white">Your notification preferences</p></div>
            <p className="mt-1 text-xs text-slate-500">These settings apply only to you. Owners can change the org-wide defaults from Settings.</p>
          </div>
          {Object.keys(dirty).length > 0 && <button className={btnPrimary} disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : `Save ${Object.keys(dirty).length} change${Object.keys(dirty).length === 1 ? '' : 's'}`}</button>}
        </div>
      </Panel>

      {Object.entries(byCategory).map(([category, list]) => (
        <Panel key={category}>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold/80">{category}</p>
          <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {list.map((event) => (
              <div key={event.event_key} className="grid gap-3 py-4 lg:grid-cols-[1.6fr_repeat(4,minmax(90px,1fr))] lg:items-center">
                <div>
                  <p className="text-sm font-bold text-white">{event.label}</p>
                  {event.description && <p className="mt-1 text-xs leading-5 text-slate-500">{event.description}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:contents">
                  {(['in_app_enabled', 'email_enabled', 'desktop_enabled', 'sound_enabled'] as const).map((field) => (
                    <label key={field} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[.02] px-3 py-2 text-xs font-semibold text-slate-300 lg:justify-center">
                      <span className="lg:hidden">{fieldLabel(field)}</span>
                      <input type="checkbox" className="accent-gold" checked={event[field] === 1} onChange={(e) => toggle(event.event_key, field, e.target.checked)}/>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 hidden text-[10px] font-bold uppercase tracking-[.14em] text-slate-500 lg:grid lg:grid-cols-[1.6fr_repeat(4,minmax(90px,1fr))]">
            <span/><span className="text-center">In-app</span><span className="text-center">Email</span><span className="text-center">Desktop push</span><span className="text-center">Sound</span>
          </div>
        </Panel>
      ))}
    </div>
  )
}

function fieldLabel(field: string) {
  if (field === 'in_app_enabled') return 'In-app'
  if (field === 'email_enabled') return 'Email'
  if (field === 'desktop_enabled') return 'Desktop push'
  return 'Sound'
}

function ReportingTab() {
  const [range, setRange] = useState<'7d' | '14d' | '30d'>('7d')
  const [data, setData] = useState<ReportingResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api.get<ReportingResponse>(`/admin/communications/reporting?range=${range}`))
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally { setLoading(false) }
  }, [range])
  useEffect(() => { void load() }, [load])

  if (loading && !data) return <Panel><p className="text-sm text-slate-400">Loading reporting…</p></Panel>
  if (!data) return <Panel><p className="text-sm text-slate-400">Reporting data is not available right now.</p></Panel>

  const maxThread = Math.max(1, ...data.daily_thread_volume.map((r) => r.n))
  const maxEmail = Math.max(1, ...data.daily_email_volume.map((r) => r.n))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Rolling window - inbound + outbound activity across every communication channel.</p>
        <select className={`${inputCls} max-w-[140px]`} value={range} onChange={(e) => setRange(e.target.value as any)}>
          <option value="7d">Last 7 days</option>
          <option value="14d">Last 14 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <div className="flex items-center gap-2"><MessageSquare size={16} className="text-gold"/><p className="text-sm font-extrabold text-white">Thread messages / day</p></div>
          <div className="mt-4 flex items-end gap-1 h-40">
            {data.daily_thread_volume.length === 0 && <p className="text-xs text-slate-500">No thread traffic in this window.</p>}
            {data.daily_thread_volume.map((row) => (
              <div key={row.day} className="flex flex-1 flex-col items-center justify-end gap-1">
                <div className="w-full rounded-t bg-gold/60" style={{ height: `${(row.n / maxThread) * 100}%` }} title={`${row.day}: ${row.n}`}/>
                <span className="text-[9px] text-slate-500">{row.day.slice(5)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center gap-2"><Mail size={16} className="text-gold"/><p className="text-sm font-extrabold text-white">Emails delivered / day</p></div>
          <div className="mt-4 flex items-end gap-1 h-40">
            {data.daily_email_volume.length === 0 && <p className="text-xs text-slate-500">No email volume in this window.</p>}
            {data.daily_email_volume.map((row) => (
              <div key={row.day} className="flex flex-1 flex-col items-center justify-end gap-1">
                <div className="w-full rounded-t bg-sky-400/60" style={{ height: `${(row.n / maxEmail) * 100}%` }} title={`${row.day}: ${row.n}`}/>
                <span className="text-[9px] text-slate-500">{row.day.slice(5)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center gap-2"><TrendingUp size={16} className="text-gold"/><p className="text-sm font-extrabold text-white">Top responders</p></div>
          <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {data.top_responders.length === 0 && <p className="py-3 text-xs text-slate-500">No staff replies in this window.</p>}
            {data.top_responders.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{r.full_name || r.email}</p><p className="truncate text-[11px] text-slate-500">{r.email}</p></div>
                <span className="font-display text-lg font-bold text-gold">{r.reply_count}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center gap-2"><AlertTriangle size={16} className="text-amber-300"/><p className="text-sm font-extrabold text-white">Aging conversations</p></div>
          <p className="mt-1 text-xs text-slate-500">Client-inbound with no staff response for over 24 hours.</p>
          <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {data.aging_threads.length === 0 && <p className="py-3 text-xs text-slate-500">Nothing aging - responses are keeping up.</p>}
            {data.aging_threads.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{t.subject}</p><p className="truncate text-[11px] text-slate-500">{t.client_name || t.client_email} · last {new Date(t.last_message_at).toLocaleString()}</p></div>
                <Link to={`../messages?thread=${t.id}`} className="text-xs font-semibold text-gold hover:underline">Open →</Link>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
