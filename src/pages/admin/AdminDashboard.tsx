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
interface DashboardResponse {
  stats: Stats
  upcoming_appointments: Appointment[]
  recent_activity: ActivityEvent[]
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

export default function AdminDashboard() {
  const { user } = useAuth()
  const p = useAppPath()
  const [data, setData] = useState<DashboardResponse | null>(null)

  useEffect(() => {
    api.get<DashboardResponse>('/admin/dashboard').then(setData).catch(() => setData(null))
  }, [])

  const stats = data?.stats

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
