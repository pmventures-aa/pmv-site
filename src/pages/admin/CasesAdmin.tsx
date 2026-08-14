import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRightLeft, Filter, Search, Settings, RefreshCw, Loader2, UserCheck } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, inputCls, btnOutline, btnPrimary, SkeletonTable } from '../../components/admin/ui'
import { SlaClock } from '../../components/kit/SlaClock'
import { useAppPath } from '../../lib/basePath'
import { clientEmailHref } from '../../lib/engagements'
import { useAuth } from '../../lib/auth'
import { toast } from '../../components/kit/toast'
import { RecentListShell, RecentWindowBar, useRecentWindow } from '../../components/admin/RecentWindow'
import { CASE_CONVERSION_TARGETS, caseConversionLabel, type CaseConversionTarget } from '../../../shared/operations'

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
  details?: string | null
  conversion_count?: number
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
  const navigate = useNavigate()
  const [cases, setCases] = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: 'open,in_progress', priority: '', waiting_on: '', over_sla: false, search: '' })
  const [showSlaEditor, setShowSlaEditor] = useState(false)
  const [convertCase, setConvertCase] = useState<CaseRow | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)

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

  async function assignToMe(row: CaseRow) {
    if (!user) return
    setAssigningId(row.id)
    try {
      await api.post(`/admin/work-assignments/ticket/${row.id}/assign-self`)
      setCases((current) => current.map((item) => item.id === row.id
        ? { ...item, assigned_staff_user_id: user.id, assignee_name: user.full_name, assignee_email: user.email }
        : item))
      toast.success('Case assigned to you.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not assign this case.')
    } finally {
      setAssigningId(null)
    }
  }

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
        <CaseRows rows={visible} now={now} p={p} userId={user?.id || ''} assigningId={assigningId} onAssignSelf={assignToMe} onConvert={setConvertCase} />
      )}
      {convertCase && user && (
        <CaseConversionDialog
          row={convertCase}
          currentUserId={user.id}
          onClose={() => setConvertCase(null)}
          onConverted={(href) => {
            setConvertCase(null)
            void load(true)
            navigate(p(href))
          }}
        />
      )}
    </div>
  )
}

function CaseRows({
  rows, now, p, userId, assigningId, onAssignSelf, onConvert,
}: {
  rows: CaseRow[]
  now: number
  p: (path: string) => string
  userId: string
  assigningId: string | null
  onAssignSelf: (row: CaseRow) => void
  onConvert: (row: CaseRow) => void
}) {
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
              <div className="flex flex-wrap justify-end gap-2">
                {row.assigned_staff_user_id !== userId && (
                  <button type="button" disabled={assigningId === row.id} onClick={() => onAssignSelf(row)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-gold disabled:opacity-50">
                    <UserCheck size={12} /> Assign to me
                  </button>
                )}
                <button type="button" onClick={() => onConvert(row)} className="inline-flex items-center gap-1 text-xs font-semibold text-gold hover:underline">
                  <ArrowRightLeft size={12} /> Convert
                </button>
                <Link to={clientEmailHref(p, { id: row.client_user_id, email: row.client_email, name: row.client_name })} className="text-xs font-semibold text-gold hover:underline">Email</Link>
              </div>
              <SlaClock due={row.response_due_at} complete={!!row.first_response_at} label="Response" />
              <SlaClock due={row.resolution_due_at} complete={row.status === 'closed'} label="Resolution" />
              {!!row.conversion_count && <span className="text-[10px] text-emerald-300">{row.conversion_count} linked record{row.conversion_count === 1 ? '' : 's'}</span>}
              <span className="text-[10px] text-slate-500">Opened {new Date(row.created_at).toLocaleString()}</span>
            </div>
          </div>
        )
      })}
    </RecentListShell>
  )
}

function CaseConversionDialog({
  row, currentUserId, onClose, onConverted,
}: {
  row: CaseRow
  currentUserId: string
  onClose: () => void
  onConverted: (href: string) => void
}) {
  const [target, setTarget] = useState<CaseConversionTarget>('matter')
  const [providers, setProviders] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
  const [form, setForm] = useState({
    title: row.subject,
    notes: row.details || '',
    due_date: '',
    matter_type: row.category || 'other',
    kind: 'field',
    service_key: row.service_key || row.category || 'general',
    provider_user_id: currentUserId,
    scheduled_at: '',
    amount_dollars: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<{ staff: Array<{ id: string; full_name: string | null; email: string }> }>('/admin/staff-directory')
      .then((result) => setProviders(result.staff || []))
      .catch(() => setProviders([]))
  }, [])

  async function submit() {
    if (!form.title.trim()) {
      toast.error('Add a title for the new record.')
      return
    }
    setSaving(true)
    try {
      const result = await api.post<{ href: string }>(`/admin/cases/${row.id}/convert`, {
        target_type: target,
        title: form.title.trim(),
        notes: form.notes.trim() || undefined,
        due_date: form.due_date || undefined,
        matter_type: form.matter_type || undefined,
        kind: form.kind,
        service_key: form.service_key || undefined,
        provider_user_id: form.provider_user_id || currentUserId,
        scheduled_at: form.scheduled_at || undefined,
        amount_cents: Math.max(0, Math.round(Number(form.amount_dollars || 0) * 100)),
      })
      toast.success(`${caseConversionLabel(target)} created and linked to the case.`)
      onConverted(result.href)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not convert this case.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-navy-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="case-conversion-title">
      <Panel className="max-h-[90vh] w-full max-w-2xl overflow-y-auto !p-0">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-gold/80">Client request conversion</p>
            <h2 id="case-conversion-title" className="mt-1 text-lg font-semibold text-white">{row.subject}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">The original case stays intact. The new operational record is linked back to it for audit and follow-through.</p>
          </div>
          <button type="button" onClick={onClose} className="text-xs font-semibold text-slate-400 hover:text-white">Close</button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-400">Convert into</span>
            <select className={inputCls} value={target} onChange={(event) => setTarget(event.target.value as CaseConversionTarget)}>
              {CASE_CONVERSION_TARGETS.map((item) => <option key={item} value={item}>{caseConversionLabel(item)}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-400">Title</span>
            <input className={inputCls} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>

          {(target === 'matter' || target === 'task') && (
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-400">Due date</span>
              <input className={inputCls} type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} />
            </label>
          )}
          {target === 'matter' && (
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-400">Work type</span>
              <input className={inputCls} value={form.matter_type} onChange={(event) => setForm({ ...form, matter_type: event.target.value })} placeholder="property_work, document_prep, other" />
            </label>
          )}
          {target === 'field_assignment' && (
            <>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-400">Job kind</span>
                <select className={inputCls} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
                  <option value="field">Field job</option>
                  <option value="ron">RON session</option>
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-400">Provider</span>
                <select className={inputCls} value={form.provider_user_id} onChange={(event) => setForm({ ...form, provider_user_id: event.target.value })}>
                  {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.full_name || provider.email}{provider.id === currentUserId ? ' (me)' : ''}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-400">Service</span>
                <input className={inputCls} value={form.service_key} onChange={(event) => setForm({ ...form, service_key: event.target.value })} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-400">Scheduled for</span>
                <input className={inputCls} type="datetime-local" value={form.scheduled_at} onChange={(event) => setForm({ ...form, scheduled_at: event.target.value })} />
              </label>
            </>
          )}
          {target === 'quote' && (
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-400">Draft estimate</span>
              <div className="relative"><span className="absolute inset-y-0 left-3 grid place-items-center text-sm text-slate-500">$</span><input className={`${inputCls} pl-7`} min="0" step="0.01" type="number" value={form.amount_dollars} onChange={(event) => setForm({ ...form, amount_dollars: event.target.value })} placeholder="0.00" /></div>
              <span className="mt-1 block text-[10px] text-slate-500">Creates a draft only. Review scope, line items, terms, and pricing before sending.</span>
            </label>
          )}
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-slate-400">Carry into the new record</span>
            <textarea className={`${inputCls} min-h-24`} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Client details, access instructions, scope, and context" />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button type="button" onClick={onClose} className={btnOutline}>Cancel</button>
          <button type="button" disabled={saving} onClick={() => void submit()} className={`${btnPrimary} disabled:opacity-50`}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />} Create {caseConversionLabel(target).toLowerCase()}
          </button>
        </div>
      </Panel>
    </div>
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
