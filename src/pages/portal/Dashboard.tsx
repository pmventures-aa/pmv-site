import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Card, EmptyState } from '../../components/ui'
import { useAppPath } from '../../lib/basePath'
import { DashboardWelcome } from '../../components/DashboardWelcome'
import { ClientJourney } from '../../components/portal/ClientJourney'

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

  const pulse = [
    ['Projects & matters', data?.stats.open_matters ?? '—', p('matters')],
    ['Tasks', data?.stats.open_tasks ?? '—', p('tasks')],
    ['Documents waiting', data?.stats.pending_documents ?? '—', p('documents')],
    ['Open invoices', data?.stats.open_invoices ?? '—', p('billing')],
  ] as const

  return (
    <div>
      <DashboardWelcome
        name={user?.first_name || user?.full_name}
        userId={user?.id}
        variant="portal"
        subtitle="You don’t need to learn the whole portal today. We’ll keep the next useful step visible and let the rest unfold as you need it."
        className="mb-5"
      />

      <ClientJourney stats={data?.stats} className="mb-8" />

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div><p className="eyebrow">At a glance</p><h2 className="mt-1 text-lg font-semibold text-white">Your account right now</h2></div>
          <Link to={p('services')} className="text-xs font-medium text-gold hover:underline">Discover services →</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pulse.map(([label, value, to]) => (
            <Link key={label} to={to} className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-4 transition hover:border-gold/25 hover:bg-white/[0.035]">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-white tabular-nums">{value}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-white">Coming up</h2><Link to={p('calendar')} className="text-xs font-medium text-gold hover:underline">Calendar →</Link></div>
          {!data || data.upcoming_appointments.length === 0 ? (
            <EmptyState label="Nothing is scheduled right now." />
          ) : (
            <ul className="divide-y divide-white/10">
              {data.upcoming_appointments.map((appointment) => (
                <li key={appointment.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <span className="text-sm font-medium text-white">{appointment.title}</span>
                  <span className="text-xs text-slate-400">{new Date(appointment.starts_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-white">Conversation</h2><Link to={p('messages')} className="text-xs font-medium text-gold hover:underline">Messages →</Link></div>
          {!data || data.recent_messages.length === 0 ? (
            <div className="py-2"><p className="text-sm text-slate-400">No messages yet.</p><p className="mt-1 text-xs leading-5 text-slate-500">When you need context, a question, or follow-up, Messages keeps it attached to your Pinnacle relationship.</p></div>
          ) : (
            <ul className="divide-y divide-white/10">
              {data.recent_messages.map((message) => (
                <li key={message.id} className="py-3 first:pt-0 last:pb-0"><p className="line-clamp-2 text-sm text-slate-200">{message.body}</p><p className="mt-1 text-xs text-slate-500">{new Date(message.created_at).toLocaleString()}</p></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {(data?.stats.open_tickets || data?.stats.pending_calls) ? (
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-xs text-slate-500">
          {data.stats.open_tickets > 0 && <Link to={p('support')} className="hover:text-gold">{data.stats.open_tickets} open support {data.stats.open_tickets === 1 ? 'request' : 'requests'} →</Link>}
          {data.stats.pending_calls > 0 && <Link to={p('planned-calls')} className="hover:text-gold">{data.stats.pending_calls} pending {data.stats.pending_calls === 1 ? 'call' : 'calls'} →</Link>}
        </div>
      ) : null}
    </div>
  )
}
