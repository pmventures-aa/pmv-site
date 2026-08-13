import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Filter, Search, Settings, RefreshCw, Loader2 } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, inputCls, btnOutline, btnPrimary, SkeletonTable } from '../../components/admin/ui'
import { SlaClock } from '../../components/kit/SlaClock'
import { useAppPath } from '../../lib/basePath'
import { useAuth } from '../../lib/auth'
import { toast } from '../../components/kit/toast'
import { RecentListShell, RecentWindowBar, useRecentWindow } from '../../components/admin/RecentWindow'

interface CaseRow {
  id: string
  client_user_id: string
  subject: string
  category: string | null
  priority: string
  status: string
  service_key: string | null
  waiting_on: string
  response_due_at: string | null
  resolution_due_at: string | null
  first_response_at: string | null
  resolved_at: string | null
  assigned_staff_user_id: string | null
  created_at: string
  client_name: string | null
  client_email: string | null
  assignee_name: string | null
  assignee_email: string | null
}

interface SlaPolicy { priority: string; response_minutes: number; resolution_minutes: number; updated_at: string }

const STATUS_TONE: Record<string, 'gold' | 'blue' | 'green' | 'slate'> = {
  open: 'gold',
  in_progress: 'blue',
  closed: 'green',
}
const PRIORITY_LABEL: Record<string, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' }

function isOverSla(row: CaseRow, now: number): boolean {
  if (row.status === 'closed' && row.resolved_at) return false
  if (!row.first_response_at && row.response_due_at && Date.parse(row.response_due_at) < now) return true
  if (!row.resolved_at && row.resolution_due_at && Date.parse(row.resolution_due_at) < now) return true
  return false
}

// Auto-refresh interval - SLA status can flip at any second, so re-pull
// the list every 30s in addition to the per-row 1s clock tick. Cheap
// (single SELECT) and keeps HQ honest without a WebSocket.
const REFRESH_MS = 30_000

export default function CasesAdmin() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const p = useAppPath()
  const [cases, setCases] = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: 'open,in_progress', priority: '', waiting_on: '', over_sla: false, search: '' })
  const [showSlaEditor, setShowSlaEditor] = useState(false)

  const load = useCallback(async (silent = false) => {
    // Server does the coarse filter; we do search + over_sla client-side so
    // the free-text and live SLA state don't need a round-trip per keystroke.
    const params = new URLSearchParams()
    if (filters.priority) params.set('priority', filters.priority)
    if (filters.waiting_on) params.set('waiting_on', filters.waiting_on)
    if (!silent) setLoading(true)
    try {
      const res = await api.get<{ cases: CaseRow[] }>(`/admin/cases?${params.toString()}`)
      setCases(res.cases)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load cases.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [filters.priority, filters.waiting_on])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => { void load(true) }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const visible = useMemo(() => {
    const statusSet = new Set(filters.status.split(',').filter(Boolean))
    const term = filters.search.trim().toLowerCase()
    return cases.filter((row) => {
      if (statusSet.size > 0 && !statusSet.has(row.status)) return false
      if (filters.over_sla && !isOverSla(row, now)) return false
      if (term) {
        const hay = [row.subject, row.client_name, row.client_email, row.assignee_name, row.category, row.priority].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [cases, filters, now])

  const overCount = useMemo(() => cases.filter((row) => isOverSla(row, now)).length, [cases, now])

  return (
    <div>
      <PageIntro
        kicker="Live workload"
        title="Cases & SLAs"
        subtitle="Every open client request across your team. Timers turn amber inside the last hour and red once a case goes past its SLA."
        action={
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowSlaEditor((v) => !v)} className={btnOutline}>
              <Settings size={14} /> SLA policies
            </button>
            <button type="button" onClick={() => void load()} className={btnOutline} title="Refresh now">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        }
      />

      {overCount > 0 && (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-rose-400/40 bg-rose-500/[.08] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-500/20 text-rose-300 pmv-sla-overdue-pulse">
              <AlertTriangle size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-rose-100">
                Cases over SLA: {overCount}
              </p>
              <p className="text-xs text-rose-200/80">Address these first. Timers show how far past the SLA each case is.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, over_sla: !f.over_sla, status: 'open,in_progress' }))}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-400/60 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/25"
          >
            {filters.over_sla ? 'Show all cases' : `Filter to over-SLA (${overCount})`}
          </button>
        </div>
      )}

      {showSlaEditor && (
        <SlaPolicyEditor readOnly={!isAdmin} onClose={() => setShowSlaEditor(false)} />
      )}

      <Panel className="mb-5 !p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500"><Filter size={11} /> Filters</span>
          <FilterChip label="Open" active={filters.status === 'open'} onClick={() => setFilters((f) => ({ ...f, status: 'open' }))} />
          <FilterChip label="Active (open + in progress)" active={filters.status === 'open,in_progress'} onClick={() => setFilters((f) => ({ ...f, status: 'open,in_progress' }))} />
          <FilterChip label="All" active={filters.status === ''} onClick={() => setFilters((f) => ({ ...f, status: '' }))} />
          <span className="mx-1 h-4 w-px bg-white/10" />
          {['', 'urgent', 'high', 'normal', 'low'].map((p) => (
            <FilterChip
              key={p || 'anypri'}
              label={p ? PRIORITY_LABEL[p] : 'Any priority'}
              active={filters.priority === p}
              tone={p === 'urgent' ? 'red' : p === 'high' ? 'gold' : 'slate'}
              onClick={() => setFilters((f) => ({ ...f, priority: p }))}
            />
          ))}
          <span className="mx-1 h-4 w-px bg-white/10" />
          {['', 'pinnacle', 'client', 'vendor'].map((w) => (
            <FilterChip
              key={w || 'anywait'}
              label={w ? `Waiting on ${w}` : 'Any owner'}
              active={filters.waiting_on === w}
              onClick={() => setFilters((f) => ({ ...f, waiting_on: w }))}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 text-slate-500"><Search size={14} /></span>
          <input
            className={`${inputCls} flex-1`}
            placeholder="Search subject, client, assignee…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>
      </Panel>

      {loading && cases.length === 0 ? (
        <Panel><SkeletonTable rows={6} cols={1} /></Panel>
      ) : visible.length === 0 ? (
        <Panel><EmptyState label="No cases match these filters." /></Panel>
      ) : (
        <CaseRows rows={visible} now={now} p={p} />
      )}
    </div>
  )
}

function CaseRows({ rows, now, p }: { rows: CaseRow[]; now: number; p: (path: string) => string }) {
  const windowed = useRecentWindow(rows)
  return (
    <RecentListShell footer={<RecentWindowBar extra={windowed.extra} expanded={windowed.expanded} onToggle={() => windowed.setExpanded((v) => !v)} showing={windowed.showing} total={windowed.total} noun="cases" />}>
      {windowed.visible.map((row) => {
        const overdue = isOverSla(row, now)
        return (
          <div key={row.id} className={`flex flex-wrap items-start justify-between gap-3 border-b border-white/5 px-5 py-4 last:border-0 ${overdue ? 'border-l-2 border-l-rose-500/70 bg-rose-500/[.03]' : ''}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone={STATUS_TONE[row.status] ?? 'slate'}>{row.status.replace(/_/g, ' ')}</Tag>
                <Tag tone={row.priority === 'urgent' ? 'red' : row.priority === 'high' ? 'gold' : 'slate'}>
                  {PRIORITY_LABEL[row.priority] || row.priority}
                </Tag>
                <span className="text-[11px] text-slate-500">Waiting on {row.waiting_on === 'pinnacle' ? 'Pinnacle' : row.waiting_on}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-white">{row.subject}</p>
              <p className="mt-1 text-xs text-slate-400">
                <Link to={p(`clients/${row.client_user_id}`)} className="text-slate-300 hover:text-gold hover:underline">
                  {row.client_name || row.client_email || 'Unknown client'}
                </Link>
                {' · '}
                {row.category || 'General'}
                {row.assignee_name ? <> {' · '} <span className="text-slate-400">Assigned to {row.assignee_name}</span></> : <> {' · '} <span className="text-amber-300">Unassigned</span></>}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5 text-xs">
              <SlaClock due={row.response_due_at} complete={!!row.first_response_at} label="Response" />
              <SlaClock due={row.resolution_due_at} complete={row.status === 'closed'} label="Resolution" />
              <span className="text-[10px] text-slate-500">Opened {new Date(row.created_at).toLocaleString()}</span>
            </div>
          </div>
        )
      })}
    </RecentListShell>
  )
}

// ------------ Filter chip -------------

function FilterChip({ label, active, onClick, tone = 'slate' }: { label: string; active: boolean; onClick: () => void; tone?: 'red' | 'gold' | 'slate' }) {
  const activeCls = tone === 'red' ? 'border-rose-500/50 bg-rose-500/10 text-rose-200'
    : tone === 'gold' ? 'border-gold/50 bg-gold/10 text-gold'
      : 'border-white/20 bg-white/[.05] text-white'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${active ? activeCls : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200'}`}
    >
      {label}
    </button>
  )
}

// ------------ SLA policy editor (inline drawer) -------------

function SlaPolicyEditor({ readOnly, onClose }: { readOnly: boolean; onClose: () => void }) {
  const [policies, setPolicies] = useState<SlaPolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<{ policies: SlaPolicy[] }>('/admin/sla-policies')
      .then((r) => setPolicies(r.policies))
      .catch(() => toast.error('Could not load SLA policies.'))
      .finally(() => setLoading(false))
  }, [])

  function update(priority: string, key: 'response_minutes' | 'resolution_minutes', value: number) {
    setPolicies((cur) => cur.map((row) => (row.priority === priority ? { ...row, [key]: value } : row)))
  }

  async function save() {
    setSaving(true)
    try {
      await api.patch('/admin/sla-policies', { policies: policies.map((row) => ({ priority: row.priority, response_minutes: row.response_minutes, resolution_minutes: row.resolution_minutes })) })
      toast.success('SLA policies updated.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save SLA policies.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel className="mb-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">Response &amp; resolution targets</p>
          <h3 className="mt-1 text-base font-semibold text-white">SLA policies</h3>
          <p className="mt-1 text-xs text-slate-400">Minutes from case creation until a first response is due, and until the case must be resolved. Applies to cases created after each save.</p>
          {readOnly && <p className="mt-2 text-[11px] text-amber-300">Only admins can edit SLA policies. Read-only for other staff.</p>}
        </div>
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-white">Close</button>
      </div>
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {policies.map((row) => (
              <div key={row.priority} className="rounded-lg border border-white/10 bg-white/[.02] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <Tag tone={row.priority === 'urgent' ? 'red' : row.priority === 'high' ? 'gold' : 'slate'}>{PRIORITY_LABEL[row.priority] || row.priority}</Tag>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">Response (minutes)</span>
                  <input
                    type="number"
                    min={1}
                    className={inputCls}
                    value={row.response_minutes}
                    disabled={readOnly}
                    onChange={(e) => update(row.priority, 'response_minutes', Math.max(1, parseInt(e.target.value || '0', 10) || 0))}
                  />
                  <span className="mt-1 block text-[10px] text-slate-500">= {humanize(row.response_minutes)}</span>
                </label>
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs text-slate-400">Resolution (minutes)</span>
                  <input
                    type="number"
                    min={1}
                    className={inputCls}
                    value={row.resolution_minutes}
                    disabled={readOnly}
                    onChange={(e) => update(row.priority, 'resolution_minutes', Math.max(1, parseInt(e.target.value || '0', 10) || 0))}
                  />
                  <span className="mt-1 block text-[10px] text-slate-500">= {humanize(row.resolution_minutes)}</span>
                </label>
              </div>
            ))}
          </div>
          {!readOnly && (
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => void save()} disabled={saving} className={`${btnPrimary} disabled:opacity-60`}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Save policies
              </button>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

function humanize(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours ? `${days}d ${restHours}h` : `${days}d`
}
