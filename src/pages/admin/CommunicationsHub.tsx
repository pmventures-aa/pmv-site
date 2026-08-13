import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Mail, MessageSquare, Send, Timer, TrendingUp, Users } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { Panel, Tag, inputCls } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { useAppPath } from '../../lib/basePath'

type Overview = {
  unread_threads: number
  active_threads_7d: number
  aging_threads: number
  campaigns_sent_7d: number
  emails_sent_7d: number
  avg_response_minutes: number | null
  generated_at: string
}

type ReportingResponse = {
  range_days: number
  daily_thread_volume: Array<{ day: string; n: number }>
  daily_email_volume: Array<{ day: string; n: number }>
  top_responders: Array<{ id: string; full_name: string; email: string; reply_count: number }>
  aging_threads: Array<{ id: string; subject: string; client_name: string; client_email: string; last_message_at: string }>
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

export function OverviewTab({ overview, loading }: { overview: Overview | null; loading: boolean }) {
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
        <div className="mt-0 grid gap-2 md:grid-cols-3">
          <Link to={`${p('messages')}?tab=inbox`} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[.02] p-4 transition hover:border-gold/40 hover:bg-white/[.04]">
            <div><p className="text-sm font-bold text-white">Client inbox</p><p className="mt-1 text-xs text-slate-400">Secure threads with clients.</p></div>
            <ArrowRight size={16} className="text-gold"/>
          </Link>
          <Link to={`${p('messages')}?tab=campaigns`} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[.02] p-4 transition hover:border-gold/40 hover:bg-white/[.04]">
            <div><p className="text-sm font-bold text-white">Campaigns</p><p className="mt-1 text-xs text-slate-400">Audience email and scheduled outreach.</p></div>
            <ArrowRight size={16} className="text-gold"/>
          </Link>
          <Link to={p('cases')} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[.02] p-4 transition hover:border-gold/40 hover:bg-white/[.04]">
            <div><p className="text-sm font-bold text-white">Cases</p><p className="mt-1 text-xs text-slate-400">Tracked requests with SLA timers.</p></div>
            <ArrowRight size={16} className="text-gold"/>
          </Link>
        </div>
      </Panel>

      <p className="text-[11px] text-slate-600">Data as of {new Date(overview.generated_at).toLocaleString()}</p>
    </div>
  )
}

export function ReportingTab() {
  const p = useAppPath()
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
                <Link to={`${p('messages')}?tab=inbox&inbox=${encodeURIComponent(t.id)}`} className="text-xs font-semibold text-gold hover:underline">Open</Link>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
