import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Card, EmptyState } from '../../components/ui'
import { useAppPath } from '../../lib/basePath'
import { DashboardWelcome } from '../../components/DashboardWelcome'
import { ClientJourney } from '../../components/portal/ClientJourney'
import { PortalTour } from '../../components/portal/PortalTour'

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
    ['Active projects & matters', data?.stats.open_matters ?? '—', p('matters'), 'Work currently in progress'],
    ['Open tasks', data?.stats.open_tasks ?? '—', p('tasks'), 'Items that still need action'],
    ['Documents pending', data?.stats.pending_documents ?? '—', p('documents'), 'Uploads, review, or signatures'],
    ['Open invoices', data?.stats.open_invoices ?? '—', p('billing'), 'Billing items not yet closed'],
  ] as const

  const nextAction = useMemo(() => {
    if (!data) return null
    if (data.stats.pending_documents > 0) return { label: 'Review pending documents', to: p('documents'), detail: `${data.stats.pending_documents} document${data.stats.pending_documents === 1 ? '' : 's'} may need attention.` }
    if (data.stats.open_tasks > 0) return { label: 'Review open tasks', to: p('tasks'), detail: `${data.stats.open_tasks} task${data.stats.open_tasks === 1 ? '' : 's'} remain open.` }
    if (data.stats.open_invoices > 0) return { label: 'Review billing', to: p('billing'), detail: `${data.stats.open_invoices} invoice${data.stats.open_invoices === 1 ? '' : 's'} remain open.` }
    if (data.stats.open_tickets > 0) return { label: 'Check support requests', to: p('support'), detail: `${data.stats.open_tickets} support request${data.stats.open_tickets === 1 ? '' : 's'} remain open.` }
    return { label: 'Explore available services', to: p('services'), detail: 'Your account is current. You can start a new request whenever something needs attention.' }
  }, [data, p])

  return (
    <div>
      <PortalTour />
      <DashboardWelcome
        name={user?.first_name || user?.full_name}
        userId={user?.id}
        variant="portal"
        subtitle="Your portal keeps the work, documents, messages, billing, and next steps connected in one place."
        className="mb-5"
      />

      {nextAction && (
        <Link to={nextAction.to} className="mb-6 block rounded-xl border border-gold/20 bg-gold/[.045] p-4 transition hover:border-gold/40 hover:bg-gold/[.07]">
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-gold/80">Recommended next action</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-sm font-semibold text-white">{nextAction.label}</p><p className="mt-1 text-xs text-slate-400">{nextAction.detail}</p></div>
            <span className="text-sm font-semibold text-gold">Open →</span>
          </div>
        </Link>
      )}

      <ClientJourney stats={data?.stats} className="mb-8" />

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div><p className="eyebrow">Account overview</p><h2 className="mt-1 text-lg font-semibold text-white">Current workload and outstanding items</h2></div>
          <Link to={p('services')} className="text-xs font-medium text-gold hover:underline">Start another request →</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pulse.map(([label, value, to, detail]) => (
            <Link key={label} to={to} className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-4 transition hover:-translate-y-px hover:border-gold/25 hover:bg-white/[0.035]">
              <p className="text-xs font-medium text-slate-300">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-white tabular-nums">{value}</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">{detail}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">Schedule</p><h2 className="mt-1 text-base font-semibold text-white">Upcoming appointments</h2></div><Link to={p('calendar')} className="text-xs font-medium text-gold hover:underline">View calendar →</Link></div>
          {!data || data.upcoming_appointments.length === 0 ? (
            <EmptyState label="No appointments are currently scheduled." />
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
          <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">Secure communication</p><h2 className="mt-1 text-base font-semibold text-white">Recent messages</h2></div><Link to={p('messages')} className="text-xs font-medium text-gold hover:underline">Open inbox →</Link></div>
          {!data || data.recent_messages.length === 0 ? (
            <div className="py-2"><p className="text-sm text-slate-300">No recent messages.</p><p className="mt-1 text-xs leading-5 text-slate-500">Use Messages whenever you need to ask a question, provide context, or keep a project conversation attached to your account.</p></div>
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
