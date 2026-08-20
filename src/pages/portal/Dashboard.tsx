import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  ArrowRight, Building2, Calendar, DoorOpen, FileText, Gauge, MessageSquare, Receipt, ShieldCheck, Users,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import { SlaClock } from '../../components/kit/SlaClock'
import { GetStartedPrompt } from '../../components/portal/GetStartedPrompt'
import { JourneyProgress } from '../../components/portal/JourneyProgress'
import { pmvFadeUp, pmvStagger } from '../../lib/motionTheme'
import { clientWorkspace } from '../../lib/workspace'
import { nextActionHref, responsibilityBanner, matterPresentation } from '../../../shared/matterWorkspace'
import { AddToCalendarButton } from '../../components/kit/AddToCalendar'
import { DashboardWelcome } from '../../components/DashboardWelcome'

interface DashboardData {
  stats: {
    open_matters: number
    open_tasks: number
    pending_documents: number
    open_invoices: number
    open_tickets: number
    pending_calls: number
    pending_quotes?: number
  }
  upcoming_appointments: { id: string; title: string; starts_at: string }[]
  recent_messages: { id: string; body: string; sender_user_id: string; created_at: string }[]
  enabled_services: { service_key: string; name: string; status: string }[]
  properties: { id: string; address: string; property_type: string; status: string }[]
  active_cases: { id: string; subject: string; priority: string; status: string; response_due_at: string | null; resolution_due_at: string | null; waiting_on: string }[]
  active_matters?: {
    id: string
    title: string
    status: string
    client_stage: string | null
    responsibility_state: string | null
    next_action_type: string | null
    next_action_label: string | null
    next_action_due_at: string | null
    due_date: string | null
    blocked_reason_client_safe: string | null
    last_client_update_at: string | null
    owner_name: string | null
  }[]
  turnover_actions?: {
    id: string
    status: string
    client_status: string
    client_description: string
    turnover_date: string
    required_complete_at: string | null
    property_address: string
    property_nickname: string | null
    bedrooms: number | null
    bathrooms: number | null
    max_guests: number | null
    href: string
  }[]
}

interface CatalogItem { key: string; name: string; category: string }

function waitingOnYou(waitingOn: string) {
  return waitingOn === 'you' || waitingOn === 'client'
}

export default function Dashboard() {
  const { user, workspace } = useAuth()
  const p = useAppPath()
  const copy = clientWorkspace(workspace.service_keys)
  const [data, setData] = useState<DashboardData | null>(null)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get<DashboardData>('/portal/dashboard').then(setData).catch(() => setData(null)),
      api.get<{ services: CatalogItem[] }>('/portal/services-catalog').then((r) => setCatalog(r.services)).catch(() => {}),
    ]).finally(() => setLoaded(true))
  }, [])

  const enabledKeys = useMemo(() => new Set((data?.enabled_services ?? []).map((service) => service.service_key)), [data])
  const undiscoveredServices = useMemo(() => {
    if (!catalog.length) return [] as CatalogItem[]
    return catalog.filter((item) => !enabledKeys.has(item.key)).slice(0, 4)
  }, [catalog, enabledKeys])

  const stats = data?.stats
  const cases = data?.active_cases ?? []
  const matters = data?.active_matters ?? []
  const turnovers = data?.turnover_actions ?? []
  const needsYou = cases.filter((item) => waitingOnYou(item.waiting_on))
  const waitingOnClient = matters.filter((item) => matterPresentation(item.responsibility_state, item.status).state === 'client')
  const pinnacleWorking = matters.filter((item) => matterPresentation(item.responsibility_state, item.status).state === 'pinnacle')
  const nextAppointment = data?.upcoming_appointments?.[0]
  const turnoverAttention = turnovers.filter((t) => t.status === 'at_risk' || t.status === 'issue_reported')
  const clientActions = (stats?.pending_documents ?? 0) + (stats?.open_invoices ?? 0) + (stats?.open_tasks ?? 0) + (stats?.pending_quotes ?? 0) + needsYou.length + waitingOnClient.length + turnoverAttention.length

  const nextMove = useMemo(() => {
    if (!loaded) return null
    if (waitingOnClient[0]) {
      const item = waitingOnClient[0]
      return {
        eyebrow: 'Waiting on you',
        title: item.next_action_label || item.title,
        body: item.next_action_label ? item.title : 'Pinnacle cannot move this work forward until you complete the next step.',
        to: p(nextActionHref(item.next_action_type, item.id)),
        label: 'Open this work',
      }
    }
    if (needsYou[0]) {
      return {
        eyebrow: 'Waiting on you',
        title: needsYou[0].subject,
        body: 'Pinnacle cannot move this request forward until you respond or send what was asked for.',
        to: p('support'),
        label: 'Open request',
      }
    }
    if (turnoverAttention[0]) {
      const t = turnoverAttention[0]
      return {
        eyebrow: 'Turnover needs attention',
        title: `${t.property_nickname || t.property_address} – ${t.client_status}`,
        body: t.client_description,
        to: p(`str/turnovers/${t.id}`),
        label: 'View turnover',
      }
    }
    if ((stats?.pending_quotes ?? 0) > 0) {
      return {
        eyebrow: 'Waiting on you',
        title: stats!.pending_quotes === 1 ? 'A quote needs your reply' : `${stats!.pending_quotes} quotes need your reply`,
        body: 'Accept or decline with optional notes. Nothing is charged on the quote page.',
        to: p('billing'),
        label: 'Review quotes',
      }
    }
    if ((stats?.pending_documents ?? 0) > 0) {
      return {
        eyebrow: 'Your next step',
        title: 'A document needs attention',
        body: `${stats!.pending_documents} ${stats!.pending_documents === 1 ? 'file is' : 'files are'} waiting in Documents.`,
        to: p('documents'),
        label: 'Open documents',
      }
    }
    if ((stats?.open_invoices ?? 0) > 0) {
      return {
        eyebrow: 'Billing',
        title: 'You have an open invoice',
        body: 'Review the amount, due date, and payment methods listed by your Pinnacle team.',
        to: p('billing'),
        label: 'Review billing',
      }
    }
    if (nextAppointment) {
      return {
        eyebrow: 'Coming up',
        title: nextAppointment.title,
        body: new Date(nextAppointment.starts_at).toLocaleString(),
        to: p('calendar'),
        label: 'View calendar',
      }
    }
    if ((stats?.open_tickets ?? 0) > 0) {
      return {
        eyebrow: 'In motion',
        title: 'Pinnacle is working with you',
        body: 'Follow status, add context, or send a message from Requests.',
        to: p('support'),
        label: 'View requests',
      }
    }
    return {
      eyebrow: 'Ready when you are',
      title: 'Nothing is currently required from you.',
      body: 'Pinnacle will update this page when something needs your attention. Start a request if something new comes up.',
      to: p('support'),
      label: 'Start a request',
    }
  }, [loaded, waitingOnClient, needsYou, turnoverAttention, stats, nextAppointment, p])

  const shortcutCatalog = {
    work: { label: 'Work', to: p('matters'), icon: Gauge, note: stats?.open_matters },
    properties: { label: 'Properties', to: p('property-management'), icon: Building2, note: data?.properties.length },
    turnovers: { label: 'Turnovers', to: p('str/turnovers'), icon: DoorOpen, note: turnovers.length || undefined },
    documents: { label: 'Documents', to: p('documents'), icon: FileText, note: stats?.pending_documents },
    messages: { label: 'Messages', to: p('messages'), icon: MessageSquare, note: undefined as number | undefined },
    billing: { label: 'Billing', to: p('billing'), icon: Receipt, note: (stats?.pending_quotes || 0) + (stats?.open_invoices || 0) || undefined },
    calendar: { label: 'Calendar', to: p('calendar'), icon: Calendar, note: undefined as number | undefined },
    team: { label: 'My Team', to: p('my-team'), icon: Users, note: undefined as number | undefined },
    account: { label: 'Account', to: p('business-profile'), icon: ShieldCheck, note: undefined as number | undefined },
    funding: { label: 'Funding', to: p('funding'), icon: Gauge, note: undefined as number | undefined },
  }
  const shortcuts = copy.shortcutKeys.map((key) => shortcutCatalog[key])

  return (
    <motion.div className="pb-4" initial="hidden" animate="show" variants={pmvStagger}>
      <GetStartedPrompt className="mb-3" />

      <motion.header variants={pmvFadeUp} className="pb-1">
        <DashboardWelcome name={user?.first_name || user?.full_name} userId={user?.id} variant="portal" subtitle={copy.homeSubtitle} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={p(copy.primaryCta.to)} className="btn-gold">{copy.primaryCta.label}</Link>
          <Link to={p(copy.secondaryCta.to)} className="btn-outline">{copy.secondaryCta.label}</Link>
        </div>
      </motion.header>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(240px,300px)]">
        <div className="min-w-0 space-y-5">
          <motion.div variants={pmvFadeUp}>
            <JourneyProgress
              startTo={copy.primaryCta.to}
              jobs={[
                ...(data?.active_matters ?? []).map((m) => ({ id: `m-${m.id}`, label: m.title, status: m.client_stage || m.status || 'open', to: 'matters' })),
                ...(data?.enabled_services ?? []).map((s) => ({ id: `s-${s.service_key}`, label: s.name, status: s.status || 'active', to: 'services' })),
              ].slice(0, 6)}
            />
          </motion.div>
          {nextMove && (
            <motion.section variants={pmvFadeUp} className="rounded-md border border-gold/20 bg-gold/[.04] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-gold/80">{nextMove.eyebrow}</p>
              <h2 className="mt-1 font-display text-lg font-medium text-white">{nextMove.title}</h2>
              <p className="mt-1 max-w-xl text-sm text-slate-400">{nextMove.body}</p>
              <Link to={nextMove.to} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-gold hover:underline">
                {nextMove.label} <ArrowRight size={13} />
              </Link>
            </motion.section>
          )}

          <motion.section variants={pmvFadeUp}>
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500">Needs your attention</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{copy.workHeading}</h2>
              </div>
              <Link to={p('matters')} className="text-xs font-semibold text-gold hover:underline">View all work</Link>
            </div>
            {!loaded ? (
              <div className="h-16 animate-pulse rounded-md border border-white/[.06] bg-white/[.02]" />
            ) : matters.length === 0 && cases.length === 0 ? (
              <div className="rounded-md border border-emerald-400/20 bg-emerald-400/[.04] px-3 py-2.5">
                <p className="text-sm font-medium text-white">Nothing is currently required from you.</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">Something come up? <Link to={p('support')} className="font-semibold text-gold hover:underline">Start a request</Link></p>
              </div>
            ) : (
              <ul className="divide-y divide-white/[.08] border-y border-white/[.08]">
                {[...waitingOnClient, ...pinnacleWorking, ...matters.filter((item) => !waitingOnClient.includes(item) && !pinnacleWorking.includes(item))].slice(0, 4).map((item) => {
                  const pres = matterPresentation(item.responsibility_state, item.status, item.blocked_reason_client_safe)
                  return (
                    <li key={item.id}>
                      <Link to={p(`matters/${item.id}`)} className="grid gap-2 py-3 sm:grid-cols-1 sm:items-start">
                        <span>
                          <strong className="block text-sm font-semibold text-white">{item.title}</strong>
                          <span className="mt-1 block text-xs text-slate-500">
                            {pres.banner.label}{item.owner_name ? ` · ${item.owner_name}` : ''}{item.next_action_label ? ` · ${item.next_action_label}` : ''}
                          </span>
                        </span>
                        <span className={`text-xs ${pres.banner.state === 'client' ? 'font-semibold text-gold' : 'text-slate-400'}`}>
                          {pres.banner.state === 'client' ? 'Action needed' : pres.banner.label}
                        </span>
                      </Link>
                    </li>
                  )
                })}
                {matters.length === 0 && cases.slice(0, 3).map((item) => {
                  const yours = waitingOnYou(item.waiting_on)
                  return (
                    <li key={item.id}>
                      <Link to={p('support')} className="grid gap-2 py-2.5 sm:grid-cols-[1fr_150px_auto] sm:items-center">
                        <span>
                          <strong className="block text-sm font-semibold text-white">{item.subject}</strong>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {item.status.replace('_', ' ')} · waiting on {yours ? 'you' : 'Pinnacle'}
                          </span>
                        </span>
                        <span className={`text-xs ${yours ? 'font-semibold text-gold' : 'text-slate-400'}`}>
                          {yours ? 'Action needed' : 'Pinnacle owns this'}
                        </span>
                        <SlaClock due={item.response_due_at} complete={item.status !== 'open'} />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </motion.section>

          {turnovers.length > 0 && (
            <motion.section variants={pmvFadeUp}>
              <div className="mb-3 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500">STR Turnovers</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Upcoming & in progress</h2>
                </div>
                <Link to={p('str/turnovers')} className="text-xs font-semibold text-gold hover:underline">View all</Link>
              </div>
              <ul className="divide-y divide-white/[.08] border-y border-white/[.08]">
                {turnovers.slice(0, 4).map((t) => (
                  <li key={t.id}>
                    <Link to={p(`str/turnovers/${t.id}`)} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-medium text-white">
                          <DoorOpen size={14} className="shrink-0 text-gold/80" />
                          <span className="truncate">{t.property_nickname || t.property_address}</span>
                        </span>
                        <span className="mt-0.5 block pl-6 text-xs text-slate-500">{t.turnover_date} · {t.client_description}</span>
                      </span>
                      <span className={`shrink-0 text-xs ${t.status === 'at_risk' || t.status === 'issue_reported' ? 'font-semibold text-gold' : 'text-slate-400'}`}>
                        {t.client_status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {!!data?.properties?.length && (
            <motion.section variants={pmvFadeUp}>
              <div className="mb-3 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500">Properties</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Your properties</h2>
                </div>
                <Link to={p('property-management')} className="text-xs font-semibold text-gold hover:underline">View all</Link>
              </div>
              <ul className="divide-y divide-white/[.08] border-y border-white/[.08]">
                {data.properties.slice(0, 4).map((property) => (
                  <li key={property.id}>
                    <Link to={p(`property-management/${property.id}`)} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-medium text-white">
                          <Building2 size={14} className="shrink-0 text-gold/80" />
                          <span className="truncate">{property.address}</span>
                        </span>
                        <span className="mt-0.5 block pl-6 text-xs text-slate-500">{property.property_type || 'Property'} · {property.status.replace('_', ' ')}</span>
                      </span>
                      <ArrowRight size={14} className="shrink-0 text-slate-600" />
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}
        </div>

        <aside className="space-y-4">
          <motion.section variants={pmvFadeUp} className="rounded-md border border-white/[.08] bg-white/[.02] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Relationship pulse</p>
            <dl className="mt-3 divide-y divide-white/[.08] border-y border-white/[.08]">
              {[
                [copy.pulseOpenLabel, loaded ? `${stats?.open_tickets ?? 0} request${(stats?.open_tickets ?? 0) === 1 ? '' : 's'}` : '…'],
                ['Needs you', loaded ? `${clientActions} item${clientActions === 1 ? '' : 's'}` : '…'],
                ['Next visit', nextAppointment ? new Date(nextAppointment.starts_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Nothing scheduled'],
                ['Quotes to review', loaded ? String(stats?.pending_quotes ?? 0) : '…'],
                ['Open invoices', loaded ? String(stats?.open_invoices ?? 0) : '…'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-right font-medium text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>
          </motion.section>

          {nextAppointment ? (
            <motion.section variants={pmvFadeUp} className="rounded-md border border-white/[.08] bg-white/[.02] p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Coming up</p>
                <Link to={p('calendar')} className="text-xs font-semibold text-gold hover:underline">Calendar</Link>
              </div>
              <ul className="space-y-3">
                {(data?.upcoming_appointments ?? []).slice(0, 3).map((appointment) => (
                  <li key={appointment.id} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{appointment.title}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{new Date(appointment.starts_at).toLocaleString()}</p>
                    </div>
                    <AddToCalendarButton event={{ id: appointment.id, title: appointment.title, startsAt: appointment.starts_at }} />
                  </li>
                ))}
              </ul>
            </motion.section>
          ) : null}

          {!!data?.enabled_services?.length && (
            <motion.section variants={pmvFadeUp} className="rounded-md border border-white/[.08] bg-white/[.02] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Connected services</p>
              <ul className="mt-3 space-y-2">
                {data.enabled_services.slice(0, 5).map((service) => (
                  <li key={service.service_key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-slate-200">{service.name}</span>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-300/80">{service.status.replace('_', ' ')}</span>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}
        </aside>
      </div>

      <motion.section variants={pmvFadeUp} className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500">Jump to</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {shortcuts.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[.08] bg-white/[.02] px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-gold/30 hover:bg-gold/[.04] hover:text-white"
            >
              <item.icon size={13} className="text-gold/80" />
              {item.label}
              {item.note ? <span className="rounded-sm bg-gold px-1 text-[10px] font-bold text-navy-950">{item.note}</span> : null}
            </Link>
          ))}
        </div>
      </motion.section>

      {undiscoveredServices.length > 0 && (
        <motion.section variants={pmvFadeUp} className="mt-6 border-t border-white/[.06] pt-5">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500">More from Pinnacle</p>
              <h2 className="mt-0.5 font-display text-base font-medium text-white">{copy.discoveryTitle}</h2>
              <p className="mt-0.5 max-w-xl text-xs text-slate-500">{copy.discoveryBody}</p>
            </div>
            <Link to={p('services')} className="text-xs font-semibold text-gold hover:underline">See everything</Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {undiscoveredServices.map((service) => (
              <Link
                key={service.key}
                to={p(`services/${service.key}/apply`)}
                className="group flex items-center justify-between gap-3 rounded-md border border-white/[.06] bg-white/[.015] px-3 py-2.5 transition hover:border-gold/25 hover:bg-white/[.03]"
              >
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{service.category || 'Service'}</span>
                  <span className="mt-1 block truncate text-sm font-semibold text-white">{service.name}</span>
                </span>
                <ArrowRight size={14} className="shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-gold" />
              </Link>
            ))}
          </div>
        </motion.section>
      )}
    </motion.div>
  )
}
