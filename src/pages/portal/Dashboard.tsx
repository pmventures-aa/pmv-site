import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2, FileText, MessageSquare, Receipt, Calendar, HelpCircle,
  Scale, Layers, ShieldCheck, Users, ArrowRight, Sparkles, Clock,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import { PortalOrb } from '../../components/portal/PortalOrb'

// -----------------------------------------------------------------------------
// Command Center dashboard - the "courtyard" landing page. The Portal is
// intentionally tile-first here: the sidebar keeps only Home / Requests /
// Documents (see components/layout/nav.ts), so the tile grid on this page IS
// the client's real navigation. Each tile shows whether the service is
// active, discoverable, or "coming soon" so the client can feel the breadth
// of the platform without being overwhelmed by a huge sidebar.
// -----------------------------------------------------------------------------

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
  enabled_services: { service_key: string; name: string; status: string }[]
  properties: { id: string; address: string; property_type: string; status: string }[]
  active_cases: { id: string; subject: string; priority: string; status: string; response_due_at: string | null; resolution_due_at: string | null; waiting_on: string }[]
}

interface CatalogItem { key: string; name: string; category: string }

type TileState = 'active' | 'discover' | 'soon'

interface Tile {
  key: string
  label: string
  hint: string
  icon: typeof Building2
  to: string
  state: TileState
  badgeCount?: number
}

// Static catalog of tiles we render regardless of what the account has
// enabled. State (`active` | `discover` | `soon`) is decided at render time
// based on `enabled_services` from the dashboard API. Order here IS the
// tile order on screen - highest-value / most-used first.
const TILE_BLUEPRINT: { key: string; label: string; hint: string; icon: typeof Building2; to: string; soon?: boolean; serviceKeys?: string[] }[] = [
  { key: 'requests', label: 'Requests & Cases', hint: 'Submit a new request or track open work', icon: HelpCircle, to: 'support' },
  { key: 'documents', label: 'Documents', hint: 'Uploads, signatures, and shared files', icon: FileText, to: 'documents' },
  { key: 'properties', label: 'My Properties', hint: 'Field visits, inspections, maintenance', icon: Building2, to: 'property-management', serviceKeys: ['property_management', 'property_inspections'] },
  { key: 'matters', label: 'Projects & Matters', hint: 'Ongoing legal, admin, or advisory work', icon: Scale, to: 'matters' },
  { key: 'messages', label: 'Messages', hint: 'Secure back-and-forth with your team', icon: MessageSquare, to: 'messages' },
  { key: 'billing', label: 'Billing', hint: 'Invoices, receipts, and payment methods', icon: Receipt, to: 'billing' },
  { key: 'calendar', label: 'Calendar', hint: 'Appointments and site visits', icon: Calendar, to: 'calendar' },
  { key: 'team', label: 'My Team', hint: 'Your Pinnacle advisors and vendors', icon: Users, to: 'my-team' },
  { key: 'business-profile', label: 'Business Profile', hint: 'Company + practice details on file', icon: Layers, to: 'business-profile' },
  { key: 'security', label: 'Security', hint: 'Password, sessions, trusted devices', icon: ShieldCheck, to: 'security' },
]

function greeting(hour: number): string {
  if (hour < 5) return 'Good evening'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

// Rotating discovery pitches for the hero banner. Cycles every 8s so the
// client sees a different Pinnacle capability each time they land - the
// "have you tried this?" moment. Kept intentionally short and specific.
const DISCOVERY_PITCHES = [
  { title: 'Have you tried mobile notary?', body: 'A Pinnacle notary comes to you - home, office, or hospital - usually the same day.' },
  { title: 'Remote Online Notarization', body: 'Sign notarized documents from anywhere with a live licensed notary.' },
  { title: 'Property inspections on demand', body: 'Move-in, move-out, and periodic reports - photos + notes emailed within 24h.' },
  { title: 'A single admin partner', body: 'Delegate scheduling, filing, and follow-ups without hiring a new employee.' },
  { title: 'Certified audit trails', body: 'Every field visit produces a time-stamped, geo-located audit email you can save with your records.' },
]

function SlaClock({ due, complete }: { due: string | null; complete?: boolean }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  if (complete || !due) return <span className="text-emerald-300">Response logged</span>
  const remaining = new Date(due).getTime() - now
  const mins = Math.max(0, Math.floor(Math.abs(remaining) / 60000))
  const hours = Math.floor(mins / 60)
  const tone = remaining < 0 ? 'text-rose-300' : remaining < 3600000 ? 'text-amber-300' : 'text-slate-400'
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${tone}`}>
      <Clock size={11} />
      {remaining < 0 ? 'Overdue ' : ''}{hours ? `${hours}h ` : ''}{mins % 60}m
    </span>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const p = useAppPath()
  const [data, setData] = useState<DashboardData | null>(null)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [pitchIndex, setPitchIndex] = useState(0)

  useEffect(() => {
    api.get<DashboardData>('/portal/dashboard').then(setData).catch(() => setData(null))
    api.get<{ services: CatalogItem[] }>('/portal/services-catalog').then((r) => setCatalog(r.services)).catch(() => {})
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setPitchIndex((current) => (current + 1) % DISCOVERY_PITCHES.length), 8000)
    return () => window.clearInterval(timer)
  }, [])

  const enabledKeys = useMemo(() => new Set((data?.enabled_services ?? []).map((service) => service.service_key)), [data])

  const tiles = useMemo<Tile[]>(() => {
    return TILE_BLUEPRINT.map((blueprint) => {
      const state: TileState = blueprint.key === 'requests' || blueprint.key === 'documents' || blueprint.key === 'messages' || blueprint.key === 'billing' || blueprint.key === 'calendar' || blueprint.key === 'team' || blueprint.key === 'business-profile' || blueprint.key === 'security'
        ? 'active'
        : blueprint.serviceKeys?.some((key) => enabledKeys.has(key))
          ? 'active'
          : 'discover'
      let badge: number | undefined
      if (blueprint.key === 'requests') badge = data?.stats.open_tickets
      else if (blueprint.key === 'documents') badge = data?.stats.pending_documents
      else if (blueprint.key === 'billing') badge = data?.stats.open_invoices
      else if (blueprint.key === 'matters') badge = data?.stats.open_matters
      else if (blueprint.key === 'properties') badge = data?.properties.length
      return { key: blueprint.key, label: blueprint.label, hint: blueprint.hint, icon: blueprint.icon, to: p(blueprint.to), state, badgeCount: badge && badge > 0 ? badge : undefined }
    })
  }, [enabledKeys, data, p])

  const undiscoveredServices = useMemo(() => {
    if (!catalog.length) return [] as CatalogItem[]
    return catalog.filter((item) => !enabledKeys.has(item.key)).slice(0, 6)
  }, [catalog, enabledKeys])

  const firstName = (user?.first_name || user?.full_name || '').split(' ')[0] || 'there'
  const hour = new Date().getHours()
  const pitch = DISCOVERY_PITCHES[pitchIndex]

  return (
    <div className="pb-16">
      {/* Personalized greeting */}
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[.22em] text-gold/75">Command Center</p>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-[-.02em] text-white sm:text-4xl">
          {greeting(hour)}, {firstName}.
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Everything Pinnacle is handling for you lives here. Pick a tile to dive in - or explore new services in the panel to the right.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* LEFT: tile grid = the real nav */}
        <section aria-labelledby="tiles-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 id="tiles-heading" className="text-[11px] font-semibold uppercase tracking-[.18em] text-slate-500">Your workspace</h2>
              <p className="mt-1 text-sm text-slate-300">Tiles you can open right now</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tiles.map((tile) => (
              <TileCard key={tile.key} tile={tile} />
            ))}
          </div>
        </section>

        {/* RIGHT: hero orb + rotating discovery pitch + live activity */}
        <aside className="space-y-6">
          <div className="relative overflow-hidden rounded-2xl border border-white/[.08] bg-gradient-to-b from-white/[.045] to-white/[.01] p-6">
            <div className="absolute -right-8 -top-6 opacity-90">
              <PortalOrb size={220} decorative />
            </div>
            <div className="relative">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.14em] text-gold">
                <Sparkles size={11} /> Discover
              </div>
              <h3 key={pitchIndex} className="mt-4 max-w-[240px] font-display text-xl font-medium leading-snug text-white sm:text-2xl animate-[pmv-fade-in_.6s_ease-out]">
                {pitch.title}
              </h3>
              <p className="mt-2 max-w-[300px] text-sm leading-6 text-slate-300">
                {pitch.body}
              </p>
              <Link
                to={p('services')}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-navy-950 shadow-[0_10px_30px_rgba(0,0,0,.35)] transition hover:bg-white"
              >
                Explore Pinnacle services <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          {data?.active_cases?.length ? (
            <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Live work</p>
                  <h3 className="mt-1 text-sm font-semibold text-white">Active requests</h3>
                </div>
                <Link to={p('support')} className="text-xs font-semibold text-gold hover:underline">View all →</Link>
              </div>
              <ul className="divide-y divide-white/5">
                {data.active_cases.slice(0, 3).map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{item.subject}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Waiting on {item.waiting_on === 'pinnacle' ? 'Pinnacle' : 'you'} · {item.status.replace('_', ' ')}</p>
                    </div>
                    <SlaClock due={item.response_due_at} complete={item.status !== 'open'} />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.04] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-emerald-300/80">All clear</p>
              <p className="mt-1 text-sm font-medium text-white">No open cases right now.</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Something come up? <Link to={p('support')} className="font-semibold text-gold hover:underline">Start a request →</Link></p>
            </div>
          )}

          {data?.upcoming_appointments?.length ? (
            <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Next up</p>
                <Link to={p('calendar')} className="text-xs font-semibold text-gold hover:underline">Calendar →</Link>
              </div>
              <ul className="space-y-2">
                {data.upcoming_appointments.slice(0, 2).map((appointment) => (
                  <li key={appointment.id} className="text-sm">
                    <p className="font-medium text-white">{appointment.title}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{new Date(appointment.starts_at).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>

      {/* Full-width service discovery strip */}
      {undiscoveredServices.length > 0 && (
        <section className="mt-10 border-t border-white/[.06] pt-8">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-slate-500">Also available on your account</p>
              <h2 className="mt-1 font-display text-xl font-medium text-white">Services you haven't tried yet</h2>
            </div>
            <Link to={p('services')} className="text-xs font-semibold text-gold hover:underline">See everything →</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {undiscoveredServices.map((service) => (
              <Link
                key={service.key}
                to={p(`services/${service.key}/apply`)}
                className="group relative rounded-xl border border-white/[.06] bg-white/[.015] p-4 transition hover:-translate-y-px hover:border-gold/25 hover:bg-white/[.03]"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{service.category || 'Service'}</p>
                <p className="mt-1.5 text-sm font-semibold text-white">{service.name}</p>
                <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-gold opacity-0 transition group-hover:opacity-100">
                  Get started <ArrowRight size={11} />
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ---- Tile card ---------------------------------------------------------------

function TileCard({ tile }: { tile: Tile }) {
  const isActive = tile.state === 'active'
  const isDiscover = tile.state === 'discover'

  const stateBadge = isActive
    ? { label: 'Active', className: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/25' }
    : isDiscover
      ? { label: 'Explore', className: 'bg-white/5 text-slate-300 border-white/10' }
      : { label: 'Coming soon', className: 'bg-white/5 text-slate-500 border-white/10' }

  return (
    <Link
      to={tile.to}
      className="group relative overflow-hidden rounded-xl border border-white/[.06] bg-gradient-to-b from-white/[.03] to-white/[.008] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/25 hover:from-white/[.05] hover:shadow-[0_16px_36px_rgba(0,0,0,.18)]"
    >
      {/* Top gold accent that fades in on hover */}
      <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-gold/0 to-transparent transition group-hover:via-gold/50" />

      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${isActive ? 'bg-gold/10 text-gold' : 'bg-white/[.04] text-slate-500'} transition group-hover:text-gold group-hover:bg-gold/15`}>
          <tile.icon size={20} strokeWidth={1.75} />
        </span>
        <div className="flex items-center gap-2">
          {tile.badgeCount ? (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-bold text-navy-950">
              {tile.badgeCount > 99 ? '99+' : tile.badgeCount}
            </span>
          ) : null}
          {isActive && <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.7)]" aria-hidden />}
        </div>
      </div>

      <p className="mt-4 text-[15px] font-semibold text-white">{tile.label}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{tile.hint}</p>

      <div className="mt-4 flex items-center justify-between">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${stateBadge.className}`}>
          {stateBadge.label}
        </span>
        <ArrowRight size={13} className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-gold" />
      </div>
    </Link>
  )
}
