import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { PageIntro, Panel, EmptyState, NoAccess, inputCls, btnOutline } from '../../components/admin/ui'
import { useCapabilities } from '../../lib/capabilities'
import { timeAgo } from '../../lib/activity'

interface AuditEntry {
  id: string
  actor_user_id: string | null
  actor_name: string | null
  actor_email: string | null
  actor_ip: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  created_at: string
}

const PAGE_SIZE = 50

function describeAction(entry: AuditEntry): string {
  const who = entry.actor_name || entry.actor_email || 'System'
  const what = entry.entity_type ? entry.entity_type.replace(/_/g, ' ') : 'a record'
  switch (entry.action) {
    case 'login':
      return `${who} logged in`
    case 'logout':
      return `${who} logged out`
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

export default function AuditLogAdmin() {
  const caps = useCapabilities()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [actions, setActions] = useState<string[]>([])
  const [filters, setFilters] = useState({ action: '', entity_type: '', from: '', to: '' })
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
    [filters],
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
        subtitle="Every login, record change, and permission grant — read-only, never edited or pruned."
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
      </Panel>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : loadError ? (
        <div className="space-y-2 text-sm text-slate-400">
          <p>Couldn't load the audit log.</p>
          <button onClick={load} className="text-gold hover:underline">
            Try again
          </button>
        </div>
      ) : entries.length === 0 ? (
        <Panel>
          <EmptyState label="No audit events match these filters." />
        </Panel>
      ) : (
        <>
          <Panel className="divide-y divide-white/5 !p-0">
            {entries.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm text-slate-200">{describeAction(e)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {timeAgo(e.created_at)}
                    {e.actor_ip ? ` · ${e.actor_ip}` : ''}
                  </p>
                </div>
              </div>
            ))}
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
