import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { PageIntro, Panel, EmptyState, StatCard } from '../../components/admin/ui'
import { describeActivity, timeAgo, type ActivityEvent } from '../../lib/activity'
import { useAppPath } from '../../lib/basePath'

interface Stats {
  clients: number
  open_tickets: number
  open_matters: number
  pending_tasks: number
  pending_calls: number
  open_invoices: number
}
interface Appointment {
  id: string
  title: string | null
  starts_at: string
  client_name: string | null
  client_email: string
  client_user_id: string
}
interface OverdueTask {
  id: string
  title: string
  due_date: string
  client_user_id: string
  client_name: string | null
  client_email: string
}
interface OverdueInvoice {
  id: string
  amount_cents: number
  due_date: string
  client_user_id: string
  client_name: string | null
  client_email: string
}
interface StaleTicket {
  id: string
  subject: string
  created_at: string
  client_user_id: string
  client_name: string | null
  client_email: string
}
interface StaleInquiry {
  id: string
  name: string
  email: string
  created_at: string
}
interface NeedsAttention {
  overdue_tasks: OverdueTask[]
  overdue_invoices: OverdueInvoice[]
  stale_tickets: StaleTicket[]
  stale_inquiries: StaleInquiry[]
}
interface DashboardResponse {
  stats: Stats
  upcoming_appointments: Appointment[]
  recent_activity: ActivityEvent[]
  needs_attention: NeedsAttention
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function StatLink({ label, value, to }: { label: string; value: number | string; to?: string }) {
  const content = <StatCard label={label} value={value} />
  return to ? (
    <Link to={to} className="block transition hover:border-gold/40 [&>div]:hover:border-gold/40">
      {content}
    </Link>
  ) : (
    content
  )
}

const POLL_MS = 60_000

export default function AdminDashboard() {
  const { user } = useAuth()
  const p = useAppPath()
  const [data, setData] = useState<DashboardResponse | null>(null)

  useEffect(() => {
    const load = () => api.get<DashboardResponse>('/admin/dashboard').then(setData).catch(() => {})
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [])

  const stats = data?.stats
  const na = data?.needs_attention
  const attentionCount = na ? na.overdue_tasks.length + na.overdue_invoices.length + na.stale_tickets.length + na.stale_inquiries.length : 0

  return (
    <div>
      <PageIntro
        kicker="Staff console"
        title={`Welcome, ${user?.first_name || user?.full_name || 'team'}`}
        subtitle={user?.role === 'admin' ? 'Full access across all clients.' : 'Showing clients assigned to you.'}
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatLink label="Clients" value={stats?.clients ?? '—'} to={p('clients')} />
        <StatLink label="Open Tickets" value={stats?.open_tickets ?? '—'} to={p('open-items/tickets')} />
        <StatLink label="Open Matters" value={stats?.open_matters ?? '—'} to={p('open-items/matters')} />
        <StatLink label="Pending Tasks" value={stats?.pending_tasks ?? '—'} to={p('open-items/tasks')} />
        <StatLink label="Calls Pending" value={stats?.pending_calls ?? '—'} to={p('open-items/calls')} />
        <StatLink label="Open Invoices" value={stats?.open_invoices ?? '—'} to={p('open-items/invoices')} />
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link to={p('inquiries')} className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-gold/40 hover:text-gold">
          + Add a lead
        </Link>
        <Link to={p('clients')} className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-gold/40 hover:text-gold">
          View clients
        </Link>
        <Link to={p('assignments')} className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-gold/40 hover:text-gold">
          Assign staff
        </Link>
        <Link to={p('reports')} className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-gold/40 hover:text-gold">
          Reporting Center
        </Link>
      </div>

      {data && attentionCount > 0 && (
        <Panel className="mt-8 !p-0 !border-gold/25">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <h2 className="text-sm font-semibold text-white">Needs attention</h2>
            <span className="rounded-full bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold">{attentionCount}</span>
          </div>
          <ul className="divide-y divide-white/5">
            {na!.overdue_tasks.map((t) => (
              <li key={`task-${t.id}`} className="px-5 py-3 text-sm">
                <Link to={p(`clients/${t.client_user_id}`)} className="font-medium text-white hover:text-gold">
                  Overdue task: {t.title}
                </Link>
                <p className="mt-1 text-xs text-slate-400">
                  {t.client_name || t.client_email} · due {new Date(t.due_date).toLocaleDateString()}
                </p>
              </li>
            ))}
            {na!.overdue_invoices.map((inv) => (
              <li key={`inv-${inv.id}`} className="px-5 py-3 text-sm">
                <Link to={p(`clients/${inv.client_user_id}`)} className="font-medium text-white hover:text-gold">
                  Overdue invoice: {money(inv.amount_cents)}
                </Link>
                <p className="mt-1 text-xs text-slate-400">
                  {inv.client_name || inv.client_email} · due {new Date(inv.due_date).toLocaleDateString()}
                </p>
              </li>
            ))}
            {na!.stale_tickets.map((tk) => (
              <li key={`tk-${tk.id}`} className="px-5 py-3 text-sm">
                <Link to={p(`clients/${tk.client_user_id}`)} className="font-medium text-white hover:text-gold">
                  No response yet: {tk.subject}
                </Link>
                <p className="mt-1 text-xs text-slate-400">
                  {tk.client_name || tk.client_email} · opened {timeAgo(tk.created_at)}
                </p>
              </li>
            ))}
            {na!.stale_inquiries.map((i) => (
              <li key={`inq-${i.id}`} className="px-5 py-3 text-sm">
                <Link to={p('inquiries')} className="font-medium text-white hover:text-gold">
                  Uncontacted lead: {i.name}
                </Link>
                <p className="mt-1 text-xs text-slate-400">
                  {i.email} · submitted {timeAgo(i.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Panel className="!p-0">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <h2 className="text-sm font-semibold text-white">Upcoming appointments</h2>
          </div>
          {!data ? (
            <p className="px-5 py-6 text-sm text-slate-400">Loading…</p>
          ) : data.upcoming_appointments.length === 0 ? (
            <div className="p-5">
              <EmptyState label="Nothing scheduled." />
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {data.upcoming_appointments.map((a) => (
                <li key={a.id} className="px-5 py-3 text-sm">
                  <Link to={p(`clients/${a.client_user_id}`)} className="font-medium text-white hover:text-gold">
                    {a.title || 'Appointment'}
                  </Link>
                  <p className="mt-1 text-xs text-slate-400">
                    {a.client_name || a.client_email} · {new Date(a.starts_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="!p-0">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <h2 className="text-sm font-semibold text-white">Recent activity</h2>
            <Link to={p('activity')} className="text-xs font-medium text-gold hover:underline">
              View all
            </Link>
          </div>
          {!data ? (
            <p className="px-5 py-6 text-sm text-slate-400">Loading…</p>
          ) : data.recent_activity.length === 0 ? (
            <div className="p-5">
              <EmptyState label="No activity yet." />
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {data.recent_activity.slice(0, 8).map((e) => (
                <li key={e.id} className="px-5 py-3 text-sm">
                  <p className="text-slate-200">{describeActivity(e)}</p>
                  <p className="mt-1 text-xs text-slate-500">{timeAgo(e.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
