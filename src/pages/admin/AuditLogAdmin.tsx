import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldAlert, Monitor, Globe, MapPin } from 'lucide-react'
import { api } from '../../lib/api'
import { PageIntro, Panel, EmptyState, NoAccess, inputCls, btnOutline, SkeletonTable } from '../../components/admin/ui'
import { useCapabilities } from '../../lib/capabilities'
import { timeAgo, isSecurityKind } from '../../lib/activity'
import { useAppPath } from '../../lib/basePath'

interface AuditEntry {
  id: string
  actor_user_id: string | null
  actor_name: string | null
  actor_email: string | null
  actor_ip: string | null
  actor_user_agent: string | null
  actor_city: string | null
  actor_region: string | null
  actor_country: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  created_at: string
}

const PAGE_SIZE = 50

// Actions the app considers security-sensitive. Kept aligned with the
// activity-side categorization so both pages agree on what turns red.
const SECURITY_ACTIONS = new Set<string>([
  'login',
  'logout',
  'login_failed',
  'password_changed',
  'password_reset',
  'permission_changed',
  'user_created',
  'record_archived',
  'record_restored',
  'record_permanently_deleted',
])

function isSecurityAction(action: string): boolean {
  return SECURITY_ACTIONS.has(action) || isSecurityKind(action)
}

function describeAction(entry: AuditEntry): string {
  const who = entry.actor_name || entry.actor_email || 'System'
  const what = entry.entity_type ? entry.entity_type.replace(/_/g, ' ') : 'a record'
  switch (entry.action) {
    case 'login':
      return `${who} signed in`
    case 'logout':
      return `${who} signed out`
    case 'login_failed':
      return `Failed sign-in attempt (${entry.actor_email || 'unknown user'})`
    case 'password_changed':
      return `${who} changed their password`
    case 'password_reset':
      return `${who} triggered a password reset`
    case 'record_created':
      return `${who} created ${what}`
    case 'record_updated':
      return `${who} updated ${what}`
    case 'record_archived':
      return `${who} archived ${what}`
    case 'record_restored':
      return `${who} restored ${what}`
    case 'record_permanently_deleted':
      return `${who} permanently deleted ${what}`
    case 'status_changed':
      return `${who} changed status on ${what}`
    case 'permission_changed':
      return `${who} changed permissions`
    case 'client_converted':
      return `${who} converted a lead to a client`
    case 'file_uploaded':
      return `${who} uploaded a file`
    case 'email_sent':
      return `${who} sent an email`
    default:
      return `${who} — ${entry.action.replace(/_/g, ' ')} (${what})`
  }
}

function formatLocation(entry: AuditEntry): string {
  const parts = [entry.actor_city, entry.actor_region, entry.actor_country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : ''
}

// Compress a raw User-Agent header down to just "Browser · OS" for the
// audit row. Full UA still available on hover via title attribute.
function browserAndOs(ua: string | null): string {
  if (!ua) return ''
  let browser = 'Unknown browser'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari'
  let os = ''
  if (/Windows NT/.test(ua)) os = 'Windows'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/iPhone|iPad|iOS/.test(ua)) os = 'iOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Linux/.test(ua)) os = 'Linux'
  return os ? `${browser} · ${os}` : browser
}

export default function AuditLogAdmin() {
  const caps = useCapabilities()
  const p = useAppPath()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [actions, setActions] = useState<string[]>([])
  const [filters, setFilters] = useState({ action: '', entity_type: '', from: '', to: '', security_only: false, search: '' })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const query = useCallback(
    (before?: string) => {
      const params = new URLSearchParams()
      if (filters.action) params.set('action', filters.action)
      if (filters.entity_type) params.set('entity_type', filters.entity_type)
      // created_at is stored as "YYYY-MM-DD HH:MM:SS" (UTC) — pin the date
      // inputs to the start/end of day so "to" includes the whole day
      // instead of only rows at exactly midnight.
      if (filters.from) params.set('from', `${filters.from} 00:00:00`)
      if (filters.to) params.set('to', `${filters.to} 23:59:59`)
      if (before) params.set('before', before)
      params.set('limit', String(PAGE_SIZE))
      return params.toString()
    },
    [filters.action, filters.entity_type, filters.from, filters.to],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ entries: AuditEntry[] }>(`/admin/audit-log?${query()}`)
      setEntries(res.entries)
      setHasMore(res.entries.length === PAGE_SIZE)
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    load()
    api.get<{ actions: string[] }>('/admin/audit-log/actions').then((r) => setActions(r.actions)).catch(() => {})
  }, [load])

  async function loadMore() {
    if (entries.length === 0) return
    setLoadingMore(true)
    try {
      const res = await api.get<{ entries: AuditEntry[] }>(`/admin/audit-log?${query(entries[entries.length - 1].created_at)}`)
      setEntries((cur) => [...cur, ...res.entries])
      setHasMore(res.entries.length === PAGE_SIZE)
    } finally {
      setLoadingMore(false)
    }
  }

  function exportUrl(): string {
    return `/api/admin/audit-log/export.csv?${query()}`
  }

  const visible = useMemo(() => {
    const term = filters.search.trim().toLowerCase()
    return entries.filter((entry) => {
      if (filters.security_only && !isSecurityAction(entry.action)) return false
      if (!term) return true
      const hay = [
        entry.action,
        entry.actor_name,
        entry.actor_email,
        entry.entity_type,
        entry.entity_id,
        entry.actor_ip,
        formatLocation(entry),
        entry.actor_user_agent,
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(term)
    })
  }, [entries, filters.search, filters.security_only])

  const securityCount = useMemo(() => entries.filter((e) => isSecurityAction(e.action)).length, [entries])

  if (!caps.loading && !caps.can_view_audit_log) {
    return (
      <div>
        <PageIntro kicker="Compliance" title="Audit Log" />
        <NoAccess label="the Audit Log" />
      </div>
    )
  }

  return (
    <div>
      <PageIntro
        kicker="Compliance"
        title="Audit Log"
        subtitle="Every sign-in, record change, and permission grant. Security-sensitive events highlighted in red."
        action={
          <a href={exportUrl()} className={btnOutline} download>
            Export CSV
          </a>
        }
      />

      <Panel className="mb-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Action</span>
            <select className={inputCls} value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}>
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Entity type</span>
            <input
              className={inputCls}
              placeholder="e.g. matters"
              value={filters.entity_type}
              onChange={(e) => setFilters((f) => ({ ...f, entity_type: e.target.value }))}
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">From</span>
            <input className={inputCls} type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">To</span>
            <input className={inputCls} type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            className={`${inputCls} flex-1 min-w-[200px]`}
            type="search"
            placeholder="Search actor, email, IP, city…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, security_only: !f.security_only }))}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition ${
              filters.security_only
                ? 'border-rose-500/60 bg-rose-500/15 text-rose-200'
                : 'border-rose-500/30 text-rose-300 hover:border-rose-500/60'
            }`}
          >
            <ShieldAlert size={13} /> Security only {securityCount > 0 && <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px]">{securityCount}</span>}
          </button>
        </div>
      </Panel>

      {loading ? (
        <Panel>
          <SkeletonTable rows={6} cols={1} />
        </Panel>
      ) : loadError ? (
        <div className="space-y-2 text-sm text-slate-400">
          <p>Couldn't load the audit log.</p>
          <button onClick={load} className="text-gold hover:underline">
            Try again
          </button>
        </div>
      ) : visible.length === 0 ? (
        <Panel>
          <EmptyState label="No audit events match these filters." />
        </Panel>
      ) : (
        <>
          <Panel className="divide-y divide-white/5 !p-0">
            {visible.map((entry) => {
              const security = isSecurityAction(entry.action)
              const location = formatLocation(entry)
              const ua = browserAndOs(entry.actor_user_agent)
              return (
                <div
                  key={entry.id}
                  className={`flex flex-wrap items-start justify-between gap-3 px-5 py-3 ${
                    security ? 'border-l-2 border-l-rose-500/70 bg-rose-500/[.04]' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      {security && <ShieldAlert size={14} className="mt-1 shrink-0 text-rose-400" />}
                      <div className="min-w-0">
                        <p className={`text-sm ${security ? 'font-medium text-rose-100' : 'text-slate-200'}`}>{describeAction(entry)}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span>{timeAgo(entry.created_at)}</span>
                          {location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={11} /> {location}
                            </span>
                          )}
                          {entry.actor_ip && (
                            <span className="inline-flex items-center gap-1">
                              <Globe size={11} /> {entry.actor_ip}
                            </span>
                          )}
                          {ua && (
                            <span className="inline-flex items-center gap-1" title={entry.actor_user_agent ?? undefined}>
                              <Monitor size={11} /> {ua}
                            </span>
                          )}
                          {entry.actor_user_id && (
                            <Link to={p(`users`)} className="text-slate-400 hover:text-gold hover:underline">
                              Actor profile →
                            </Link>
                          )}
                          {entry.entity_id && entry.entity_type === 'client' && (
                            <Link to={p(`clients/${entry.entity_id}`)} className="text-gold hover:underline">
                              Client →
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </Panel>
          {hasMore && (
            <div className="mt-4 text-center">
              <button onClick={loadMore} disabled={loadingMore} className={`${btnOutline} disabled:opacity-60`}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
