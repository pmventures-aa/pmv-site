import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldAlert, User, Receipt, MessageSquare, Layers, Activity as ActivityIcon } from 'lucide-react'
import { api } from '../../lib/api'
import { PageIntro, Panel, EmptyState, btnOutline, inputCls } from '../../components/admin/ui'
import { categorizeActivity, describeActivity, timeAgo, type ActivityCategory, type ActivityEvent } from '../../lib/activity'
import { useAppPath } from '../../lib/basePath'

const POLL_MS = 60_000

type CategoryFilter = 'all' | ActivityCategory

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: 'All',
  security: 'Security',
  client: 'Clients',
  money: 'Billing',
  operations: 'Operations',
  communications: 'Communications',
  other: 'Other',
}

// Icon + tone per category — security is red so sign-ins, permission changes,
// deletions and other sensitive events pop out of a normal activity stream.
const CATEGORY_TONE: Record<ActivityCategory, { row: string; icon: JSX.Element; badge: string }> = {
  security: {
    row: 'border-l-2 border-l-rose-500/70 bg-rose-500/[.04]',
    icon: <ShieldAlert size={14} className="text-rose-400" />,
    badge: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  },
  client: {
    row: 'border-l-2 border-l-sky-500/40',
    icon: <User size={14} className="text-sky-400" />,
    badge: 'bg-sky-500/10 text-sky-300 border-sky-500/25',
  },
  money: {
    row: 'border-l-2 border-l-emerald-500/40',
    icon: <Receipt size={14} className="text-emerald-400" />,
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  },
  operations: {
    row: 'border-l-2 border-l-gold/30',
    icon: <Layers size={14} className="text-gold" />,
    badge: 'bg-gold/10 text-gold border-gold/25',
  },
  communications: {
    row: 'border-l-2 border-l-violet-500/40',
    icon: <MessageSquare size={14} className="text-violet-400" />,
    badge: 'bg-violet-500/10 text-violet-300 border-violet-500/25',
  },
  other: {
    row: 'border-l-2 border-l-white/10',
    icon: <ActivityIcon size={14} className="text-slate-400" />,
    badge: 'bg-white/5 text-slate-300 border-white/15',
  },
}

// Cross-links: many activity kinds have a natural target beyond the client
// profile — an invoice, a report, an audit page. Keep this map small and
// map to the specific admin path segment; the client-profile link is
// rendered separately when client_user_id is present.
function crossLinks(kind: string, p: (path: string) => string): { label: string; to: string }[] {
  const links: { label: string; to: string }[] = []
  if (kind.startsWith('invoice')) links.push({ label: 'Invoices', to: p('invoices') })
  if (kind.startsWith('inquiry') || kind.startsWith('lead_')) links.push({ label: 'Leads & Prospects', to: p('inquiries') })
  if (kind.startsWith('comms_')) links.push({ label: 'Communications', to: p('communications') })
  if (kind.startsWith('service_application') || kind === 'service_assigned_by_staff') links.push({ label: 'Service Assignments', to: p('service-assignments') })
  if (kind.startsWith('matter') || kind.startsWith('task') || kind.startsWith('ticket') || kind.startsWith('call') || kind.startsWith('appointment')) {
    links.push({ label: 'Open Items', to: p('open-items') })
  }
  if (kind === 'message_received' || kind === 'message_sent' || kind === 'message_attachment_added') links.push({ label: 'Messages', to: p('messages') })
  if (categorizeActivity(kind) === 'security') links.push({ label: 'Audit log', to: p('audit-log') })
  return links
}

export default function ActivityAdmin() {
  const p = useAppPath()
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ events: ActivityEvent[] }>('/admin/activity')
      setEvents(r.events)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    api.post('/admin/activity/mark-seen').catch(() => {})
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return events.filter((e) => {
      if (category !== 'all' && categorizeActivity(e.kind) !== category) return false
      if (!term) return true
      const hay = [
        e.kind,
        e.actor_name,
        e.actor_email,
        e.client_name,
        e.client_email,
        e.detail || '',
        describeActivity(e),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(term)
    })
  }, [events, category, search])

  const counts = useMemo(() => {
    const acc: Record<CategoryFilter, number> = { all: events.length, security: 0, client: 0, money: 0, operations: 0, communications: 0, other: 0 }
    for (const e of events) acc[categorizeActivity(e.kind)] += 1
    return acc
  }, [events])

  const securityCount = counts.security

  return (
    <div>
      <PageIntro
        kicker="Firm-wide"
        title="Activity"
        subtitle="Everything happening across your clients and team. Security events highlighted in red."
        action={
          securityCount > 0 ? (
            <button type="button" onClick={() => setCategory('security')} className={`${btnOutline} !border-rose-500/40 !text-rose-300`}>
              <ShieldAlert size={14} /> {securityCount} security event{securityCount === 1 ? '' : 's'}
            </button>
          ) : undefined
        }
      />

      <Panel className="mb-5 !p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(CATEGORY_LABELS) as CategoryFilter[]).map((key) => {
            const active = category === key
            const isSecurity = key === 'security'
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? isSecurity
                      ? 'border-rose-500/60 bg-rose-500/15 text-rose-200'
                      : 'border-gold/50 bg-gold/10 text-gold'
                    : isSecurity && counts[key] > 0
                      ? 'border-rose-500/30 text-rose-300 hover:border-rose-500/60'
                      : 'border-white/10 text-slate-300 hover:border-white/25'
                }`}
              >
                {isSecurity && <ShieldAlert size={12} />}
                {CATEGORY_LABELS[key]}
                <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${active ? 'bg-black/20' : 'bg-white/5 text-slate-400'}`}>{counts[key]}</span>
              </button>
            )
          })}
        </div>
        <div className="mt-3">
          <input
            className={inputCls}
            type="search"
            placeholder="Search actor, client, or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </Panel>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <Panel>
          <EmptyState label={events.length === 0 ? 'No activity yet.' : 'No events match this filter.'} />
        </Panel>
      ) : (
        <Panel className="divide-y divide-white/5 !p-0">
          {filtered.map((e) => {
            const cat = categorizeActivity(e.kind)
            const tone = CATEGORY_TONE[cat]
            const extras = crossLinks(e.kind, p)
            return (
              <div key={e.id} className={`flex items-start justify-between gap-4 px-5 py-4 text-sm ${tone.row}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">{tone.icon}</span>
                    <div className="min-w-0">
                      <p className={`text-slate-200 ${cat === 'security' ? 'font-medium text-rose-100' : ''}`}>{describeActivity(e)}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.badge}`}>
                          {cat}
                        </span>
                        {e.client_user_id && (
                          <Link to={p(`clients/${e.client_user_id}`)} className="text-gold hover:underline">
                            View client →
                          </Link>
                        )}
                        {extras.map((link) => (
                          <Link key={link.to} to={link.to} className="text-slate-400 hover:text-gold hover:underline">
                            {link.label} →
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">{timeAgo(e.created_at)}</span>
              </div>
            )
          })}
        </Panel>
      )}
    </div>
  )
}
