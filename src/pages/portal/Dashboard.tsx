import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Card, PageHeader, StatCard, EmptyState } from '../../components/ui'
import { useAppPath } from '../../lib/basePath'
import { QuoteOfTheDay } from '../../components/portal/QuoteOfTheDay'
import { GetStartedPrompt } from '../../components/portal/GetStartedPrompt'

interface DashboardData {
  stats: {
    open_matters: number
    open_tasks: number
    pending_documents: number
    open_invoices: number
    open_tickets: number
    pending_calls: number
  }
  upcoming_appointments: { id: string; title: string; starts_at: string }[]
  recent_messages: { id: string; body: string; sender_user_id: string; created_at: string }[]
}

export default function Dashboard() {
  const { user } = useAuth()
  const p = useAppPath()
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    api.get<DashboardData>('/portal/dashboard').then(setData).catch(() => setData(null))
  }, [])

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back${user?.first_name ? `, ${user.first_name}` : ''}! :)`}
        subtitle="Here's what's happening across your account."
      />

      <GetStartedPrompt className="mb-8" />
      <QuoteOfTheDay className="mb-8" />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Open Matters" value={data?.stats.open_matters ?? '—'} />
        <StatCard label="Open Tasks" value={data?.stats.open_tasks ?? '—'} />
        <StatCard label="Pending Docs" value={data?.stats.pending_documents ?? '—'} />
        <StatCard label="Open Invoices" value={data?.stats.open_invoices ?? '—'} />
        <StatCard label="Open Tickets" value={data?.stats.open_tickets ?? '—'} />
        <StatCard label="Calls Pending" value={data?.stats.pending_calls ?? '—'} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-white">Upcoming appointments</h2>
          {!data || data.upcoming_appointments.length === 0 ? (
            <EmptyState label="Nothing on the calendar yet." />
          ) : (
            <ul className="space-y-3">
              {data.upcoming_appointments.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3">
                  <span className="text-sm font-medium text-white">{a.title}</span>
                  <span className="text-xs text-slate-400">{new Date(a.starts_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to={p('calendar')} className="mt-4 inline-block text-sm font-medium text-gold hover:underline">
            View calendar →
          </Link>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-white">Recent messages</h2>
          {!data || data.recent_messages.length === 0 ? (
            <EmptyState label="No messages yet." />
          ) : (
            <ul className="space-y-3">
              {data.recent_messages.map((m) => (
                <li key={m.id} className="rounded-xl border border-white/10 px-4 py-3">
                  <p className="line-clamp-2 text-sm text-slate-200">{m.body}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(m.created_at).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
          <Link to={p('messages')} className="mt-4 inline-block text-sm font-medium text-gold hover:underline">
            Open messages →
          </Link>
        </Card>
      </div>
    </div>
  )
}
