import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, Check, Loader2, Plus } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, StatCard, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { useAppPath } from '../../lib/basePath'
import { useAuth } from '../../lib/auth'
import {
  CHECKLIST_CATEGORIES, isIssueType, issueSeverityLabel, issueStatusLabel, issueTypeLabel,
  money, payoutStatusLabel, strPackageLabel, turnoverStatusLabel, turnoverStatusTone,
  type IssueType, type IssueSeverity,
} from '../../../shared/strWorkspace'

interface Summary {
  today: number
  at_risk: number
  unassigned: number
  open_issues: number
  awaiting_verification: number
  by_status: { status: string; n: number }[]
}

interface TurnoverRow {
  id: string
  status: string
  turnover_date: string
  required_complete_at: string | null
  property_address: string
  property_nickname: string | null
  client_name: string | null
  client_business: string | null
  provider_name: string | null
  service_package_key: string
  package_name: string | null
  client_charge_cents: number | null
  provider_payout_cents: number | null
  payout_status: string
  guest_ready_override: number
}

interface PickerProperty { id: string; address: string; name: string | null; city: string | null; state: string | null; client_name: string | null; client_business: string | null; has_str_profile: number }
interface StaffOption { id: string; full_name: string | null; email: string }
interface PackageRow { key: string; name: string; active: number }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-navy-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-white/12 bg-[#0d1220] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md border border-white/10 text-slate-400 hover:text-white" aria-label="Close dialog">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function StrOperations() {
  const p = useAppPath()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [turnovers, setTurnovers] = useState<TurnoverRow[]>([])
  const [properties, setProperties] = useState<PickerProperty[]>([])
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [filters, setFilters] = useState({ status: '', from: '', to: '', property: '' })
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (filters.status) q.set('status', filters.status)
      if (filters.from) q.set('from', filters.from)
      if (filters.to) q.set('to', filters.to)
      if (filters.property) q.set('property', filters.property)
      const [summaryRes, opsRes, pickerRes, staffRes, pkgRes] = await Promise.all([
        api.get<{ summary: Summary }>('/admin/str/operations/summary'),
        api.get<{ turnovers: TurnoverRow[] }>(`/admin/str/operations${q.toString() ? `?${q}` : ''}`),
        api.get<{ properties: PickerProperty[] }>('/admin/str/property-picker'),
        api.get<{ staff: StaffOption[] }>('/admin/staff-directory'),
        api.get<{ packages: PackageRow[] }>('/admin/str/packages'),
      ])
      setSummary(summaryRes.summary)
      setTurnovers(opsRes.turnovers)
      setProperties(pickerRes.properties)
      setStaff(staffRes.staff)
      setPackages(pkgRes.packages)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load the turnover board.')
    } finally { setLoading(false) }
  }, [filters])

  useEffect(() => { void load() }, [load])

  const statusCount = (key: string) => summary?.by_status.find((s) => s.status === key)?.n ?? 0

  return (
    <div>
      <PageIntro
        kicker="STR Turnover & Property Support"
        title="Turnover Operations"
        subtitle="Schedule, dispatch, and verify property turnovers. Pricing is always computed server-side from the package tiers."
        action={<button type="button" className={btnPrimary} onClick={() => setCreateOpen(true)}><Plus size={14} /> New turnover</button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Today" value={summary?.today ?? '–'} accent="sea" />
        <StatCard label="At risk" value={summary?.at_risk ?? '–'} accent="coral" />
        <StatCard label="Unassigned" value={summary?.unassigned ?? '–'} accent="gold" />
        <StatCard label="Awaiting verification" value={summary?.awaiting_verification ?? '–'} accent="gold" />
        <StatCard label="Open issues" value={summary?.open_issues ?? '–'} accent="coral" />
        <StatCard label="Scheduled" value={statusCount('scheduled')} accent="sea" />
      </div>

      <Panel className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Status</span>
            <select className={inputCls} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All active</option>
              {['scheduled', 'offered', 'accepted', 'en_route', 'in_progress', 'issue_reported', 'at_risk', 'verification_needed', 'guest_ready', 'completed', 'cancelled'].map((s) => (
                <option key={s} value={s}>{turnoverStatusLabel(s)}</option>
              ))}
            </select>
          </label>
          <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">From</span>
            <input type="date" className={inputCls} value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          </label>
          <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">To</span>
            <input type="date" className={inputCls} value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          </label>
          <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Property</span>
            <select className={inputCls} value={filters.property} onChange={(e) => setFilters((f) => ({ ...f, property: e.target.value }))}>
              <option value="">All properties</option>
              {properties.map((pr) => <option key={pr.id} value={pr.id}>{pr.name || pr.address}</option>)}
            </select>
          </label>
        </div>
      </Panel>

      <Panel className="!p-0">
        {loading && turnovers.length === 0 ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-md bg-white/[.05]" />)}</div>
        ) : turnovers.length === 0 ? (
          <div className="p-4"><EmptyState label="No turnovers match these filters." /></div>
        ) : (
          <ul className="divide-y divide-white/[.07]">
            {turnovers.map((t) => (
              <li key={t.id}>
                <Link to={p(`str/turnovers/${t.id}`)} className="grid gap-2 px-4 py-3 hover:bg-white/[.025] sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{t.property_nickname || t.property_address}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span>{t.turnover_date}</span>
                      <span>·</span>
                      <span>{t.client_business || t.client_name || 'Client'}</span>
                      <span>·</span>
                      <span>{strPackageLabel(t.service_package_key)}</span>
                      {t.provider_name && <span>·</span>}
                      {t.provider_name && <span>{t.provider_name}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 justify-self-start sm:justify-self-end">
                    <Tag tone={turnoverStatusTone(t.status)}>{turnoverStatusLabel(t.status)}</Tag>
                    <span className="hidden text-xs tabular-nums text-slate-500 sm:inline">{money(t.client_charge_cents)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {createOpen && (
        <CreateTurnover
          properties={properties}
          staff={staff}
          packages={packages}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => { setCreateOpen(false); void load(); navigate(p(`str/turnovers/${id}`)) }}
        />
      )}
    </div>
  )
}

function CreateTurnover({ properties, staff, packages, onClose, onCreated }: {
  properties: PickerProperty[]
  staff: StaffOption[]
  packages: PackageRow[]
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({
    property_id: '', turnover_date: new Date().toISOString().slice(0, 10), checkout_time: '11:00',
    turnover_window_minutes: '180', service_package_key: 'guest_ready', assigned_provider_user_id: '',
  })

  const eligible = properties.filter((pr) => pr.has_str_profile === 1)

  async function submit() {
    if (!form.property_id || !form.turnover_date) return
    setBusy(true)
    try {
      const res = await api.post<{ ok: boolean; id: string }>('/admin/str/turnovers', {
        property_id: form.property_id,
        turnover_date: form.turnover_date,
        checkout_at: form.checkout_time ? `${form.turnover_date}T${form.checkout_time}` : undefined,
        turnover_window_minutes: form.turnover_window_minutes ? Number(form.turnover_window_minutes) : undefined,
        service_package_key: form.service_package_key || undefined,
        assigned_provider_user_id: form.assigned_provider_user_id || undefined,
      })
      toast.success('Turnover created and synced to the calendar.')
      onCreated(res.id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create the turnover.')
    } finally { setBusy(false) }
  }

  return (
    <Modal title="New turnover" onClose={onClose}>
      <div className="space-y-3">
        <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">STR property</span>
          <select className={inputCls} value={form.property_id} onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value }))}>
            <option value="">Select…</option>
            {eligible.map((pr) => <option key={pr.id} value={pr.id}>{pr.name || pr.address} – {pr.client_business || pr.client_name || 'Client'}</option>)}
          </select>
          {eligible.length === 0 && <span className="mt-1 block text-xs text-slate-500">No STR profiles yet. Set one up in STR Properties first.</span>}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Arrival date</span>
            <input type="date" className={inputCls} value={form.turnover_date} onChange={(e) => setForm((f) => ({ ...f, turnover_date: e.target.value }))} />
          </label>
          <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Checkout time</span>
            <input type="time" className={inputCls} value={form.checkout_time} onChange={(e) => setForm((f) => ({ ...f, checkout_time: e.target.value }))} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Window (minutes)</span>
            <input type="number" min={30} max={720} className={inputCls} value={form.turnover_window_minutes} onChange={(e) => setForm((f) => ({ ...f, turnover_window_minutes: e.target.value }))} />
          </label>
          <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Package</span>
            <select className={inputCls} value={form.service_package_key} onChange={(e) => setForm((f) => ({ ...f, service_package_key: e.target.value }))}>
              {packages.map((pk) => <option key={pk.key} value={pk.key}>{pk.name}</option>)}
            </select>
          </label>
        </div>
        <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Provider (optional, assign later)</span>
          <select className={inputCls} value={form.assigned_provider_user_id} onChange={(e) => setForm((f) => ({ ...f, assigned_provider_user_id: e.target.value }))}>
            <option value="">Unassigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
          </select>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnOutline} onClick={onClose}>Cancel</button>
          <button type="button" className={btnPrimary} disabled={busy || !form.property_id || !form.turnover_date} onClick={submit}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Create turnover
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Detail (deep-linkable at /admin/str/turnovers/:id)
// ---------------------------------------------------------------------------

interface ChecklistItem { id: string; category: string; label: string; instructions: string | null; required: number; status: string; not_applicable_reason: string | null }
interface IssueRow { id: string; issue_type: string; severity: string; description: string; client_summary: string | null; internal_notes: string | null; can_continue: number; affects_guest_readiness: number; excess_condition: number; requires_client_action: number; status: string; created_at: string | null }
interface AccessRow { id: string; label: string; entry_method: string | null; code_value: string | null; lockbox_location: string | null; instructions: string | null }

interface DetailData {
  turnover: any
  checklist: ChecklistItem[]
  photos: { id: string; label: string | null; url: string }[]
  issues: IssueRow[]
  supplies: { supply_name: string; observed_stock: number; flag: string; notes: string | null }[]
  access: AccessRow[]
  gate: { requiredItems: number; completedItems: number; notApplicableItems: number; missingRequiredPhotos: string[]; openIssuesAffectingReadiness: number }
}

export function TurnoverDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const p = useAppPath()
  const { user } = useAuth()
  const [data, setData] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [photoLabel, setPhotoLabel] = useState('')
  const [issueOpen, setIssueOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [packages, setPackages] = useState<PackageRow[]>([])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [res, staffRes, pkgRes] = await Promise.all([
        api.get<DetailData>(`/admin/str/turnovers/${id}`),
        api.get<{ staff: StaffOption[] }>('/admin/staff-directory'),
        api.get<{ packages: PackageRow[] }>('/admin/str/packages'),
      ])
      setData(res)
      setStaff(staffRes.staff)
      setPackages(pkgRes.packages)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load this turnover.')
      setData(null)
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function act(action: string, body?: unknown, message = 'Done.') {
    if (!id) return
    setBusy(action)
    try {
      await api.post(`/admin/str/turnovers/${id}${action}`, body)
      toast.success(message)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not complete that action.')
    } finally { setBusy(null) }
  }

  async function markItem(item: ChecklistItem, status: 'complete' | 'not_applicable') {
    if (!id) return
    const reason = status === 'not_applicable' && item.required === 1 ? window.prompt(`Why is "${item.label}" not applicable? (required)` ) : null
    if (status === 'not_applicable' && item.required === 1 && !reason) return
    setBusy(`item-${item.id}`)
    try {
      await api.post(`/admin/str/turnovers/${id}/checklist/${item.id}`, { status, not_applicable_reason: reason || undefined })
      toast.success(status === 'complete' ? 'Marked complete.' : 'Marked not applicable.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the checklist.')
    } finally { setBusy(null) }
  }

  async function uploadPhoto(file: File) {
    if (!id) return
    setBusy('photo')
    try {
      const label = photoLabel.trim() || file.name
      const res = await api.upload<{ ok: boolean }>(`/admin/str/turnovers/${id}/photos?label=${encodeURIComponent(label)}`, file)
      toast.success('Photo uploaded.')
      setPhotoLabel('')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not upload the photo.')
    } finally { setBusy(null) }
  }

  async function resolveIssue(issue: IssueRow, decision: 'approved' | 'declined') {
    if (!id) return
    let extra: Record<string, number> = {}
    if (decision === 'approved' && issue.excess_condition) {
      const payoutAdj = window.prompt('Provider payout adjustment in cents (e.g. 0):')
      const clientAdj = window.prompt('Client charge adjustment in cents (e.g. 5000):')
      if (payoutAdj == null || clientAdj == null) return
      extra = { excess_payout_adjustment_cents: Number(payoutAdj) || 0, excess_client_adjustment_cents: Number(clientAdj) || 0 }
    }
    setBusy(`issue-${issue.id}`)
    try {
      await api.post(`/admin/str/turnovers/${id}/issues/${issue.id}/resolve`, { status: decision, ...extra })
      toast.success(decision === 'approved' ? 'Issue approved.' : 'Issue declined.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not resolve the issue.')
    } finally { setBusy(null) }
  }

  if (loading) return <Panel><p className="text-sm text-slate-400">Loading turnover…</p></Panel>
  if (!data) return <Panel><EmptyState label="This turnover could not be loaded." /></Panel>

  const t = data.turnover
  const isAdmin = user?.role === 'admin'
  const isProvider = t.assigned_provider_user_id === user?.id
  const activeStatuses = new Set(['scheduled', 'offered', 'accepted', 'en_route', 'in_progress', 'issue_reported', 'at_risk', 'verification_needed'])

  return (
    <div>
      <button type="button" onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-gold"><ArrowLeft size={14} /> Back</button>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold/85">Turnover detail</p>
          <h1 className="mt-1 text-xl font-bold text-white">{t.property_nickname || t.property_address}</h1>
          <p className="mt-1 text-xs text-slate-400">{t.turnover_date} · {t.client_business || t.client_name || 'Client'} · {strPackageLabel(t.service_package_key)}</p>
        </div>
        <Tag tone={turnoverStatusTone(t.status)}>{turnoverStatusLabel(t.status)}</Tag>
      </div>

      <Panel className="mb-4">
        <div className="flex flex-wrap gap-2">
          {activeStatuses.has(t.status) && !['scheduled', 'offered'].includes(t.status) && t.status !== 'in_progress' && t.status !== 'en_route' && (
            <button className={btnOutline} disabled={busy !== null} onClick={() => act('/start', undefined, 'Marked en route.')}>Start (en route)</button>
          )}
          {(t.status === 'en_route' || t.status === 'accepted') && (
            <button className={btnOutline} disabled={busy !== null} onClick={() => act('/begin', undefined, 'Turnover in progress.')}>Begin work</button>
          )}
          {['in_progress', 'en_route', 'issue_reported', 'at_risk'].includes(t.status) && (
            <button className={btnPrimary} disabled={busy !== null} onClick={() => act('/submit', undefined, 'Submitted for verification.')}>Submit for verification</button>
          )}
          {['verification_needed', 'in_progress', 'issue_reported', 'at_risk'].includes(t.status) && (
            <button className={btnPrimary} disabled={busy !== null} onClick={() => act('/guest-ready', undefined, 'Marked guest ready.')}>Mark guest ready</button>
          )}
          {isAdmin && activeStatuses.has(t.status) && (
            <button className={btnOutline} disabled={busy !== null} onClick={() => setOverrideOpen(true)}>Override guest-ready</button>
          )}
          {['guest_ready', 'verification_needed'].includes(t.status) && (
            <button className={btnOutline} disabled={busy !== null} onClick={() => act('/complete', undefined, 'Turnover completed.')}>Complete</button>
          )}
          {activeStatuses.has(t.status) && (
            <button className={btnOutline} disabled={busy !== null} onClick={() => setCancelOpen(true)}>Cancel</button>
          )}
          {!isProvider && t.status === 'scheduled' && (
            <button className={btnPrimary} disabled={busy !== null} onClick={() => setAssignOpen(true)}>Assign provider</button>
          )}
          {!isProvider && (t.status === 'scheduled' || t.status === 'offered' || t.status === 'at_risk') && (
            <button className={btnOutline} disabled={busy !== null} onClick={() => setAssignOpen(true)}>Offer to provider</button>
          )}
          {!isProvider && t.status !== 'completed' && t.status !== 'cancelled' && (
            <button className={btnOutline} disabled={busy !== null} onClick={() => act('/invoice', {}, 'Invoice created.')}>Create invoice</button>
          )}
          {!isProvider && t.status === 'completed' && (
            <select className={`${inputCls} !w-auto`} value={t.payout_status || 'pending'} onChange={(e) => act('/payout', { status: e.target.value }, `Payout marked ${e.target.value}.`)}>
              {['pending', 'approved', 'paid', 'disputed'].map((s) => <option key={s} value={s}>{payoutStatusLabel(s)}</option>)}
            </select>
          )}
          {!isProvider && t.status === 'completed' && (
            <button className={btnOutline} disabled={busy !== null} onClick={() => act('/matter', {}, 'Support matter created.')}>Create matter</button>
          )}
        </div>
        {t.guest_ready_override === 1 && (
          <p className="mt-2 text-xs text-slate-500">Guest-ready gate was overridden{t.guest_ready_override_reason ? `: ${t.guest_ready_override_reason}` : ''}.</p>
        )}
      </Panel>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Client charge" value={money(t.client_charge_cents)} accent="gold" />
        <StatCard label="Provider payout" value={money(t.provider_payout_cents)} accent="sea" />
        <StatCard label="Payout status" value={payoutStatusLabel(t.payout_status)} accent="green" />
        <StatCard label="Ready by" value={t.required_complete_at ? new Date(t.required_complete_at.replace(' ', 'T')).toLocaleString() : '–'} accent="coral" />
      </div>

      {data.gate.requiredItems > 0 && (
        <Panel className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Guest-ready gate</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-300">
            <span>{data.gate.completedItems} / {data.gate.requiredItems} required items</span>
            <span>· {data.gate.notApplicableItems} N/A</span>
            <span>· {data.gate.missingRequiredPhotos.length} required photo{data.gate.missingRequiredPhotos.length === 1 ? '' : 's'} missing: {data.gate.missingRequiredPhotos.join(', ') || 'none'}</span>
            <span>· {data.gate.openIssuesAffectingReadiness} open issue{data.gate.openIssuesAffectingReadiness === 1 ? '' : 's'} affecting readiness</span>
          </div>
        </Panel>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Checklist</p>
            <Tag tone="slate">{data.checklist.filter((c) => c.status === 'complete' || c.status === 'not_applicable').length} / {data.checklist.length}</Tag>
          </div>
          {data.checklist.length === 0 ? (
            <EmptyState label="No checklist items." />
          ) : (
            <div className="max-h-[520px] space-y-4 overflow-y-auto pr-1">
              {CHECKLIST_CATEGORIES.filter((cat) => data.checklist.some((c) => c.category === cat)).map((cat) => (
                <div key={cat}>
                  <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">{cat}</p>
                  <ul className="mt-1 divide-y divide-white/[.06]">
                    {data.checklist.filter((c) => c.category === cat).map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="text-sm text-slate-200">
                          {item.status === 'complete' && <Check size={14} className="mr-1.5 inline text-emerald-400" />}
                          {item.label}
                          {item.required === 1 && <span className="ml-1.5 text-[10px] font-semibold uppercase text-slate-600">required</span>}
                          {item.instructions && <span className="block text-xs text-slate-500">{item.instructions}</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {item.status === 'complete' ? <Tag tone="green">Done</Tag> : item.status === 'not_applicable' ? <Tag tone="slate">N/A</Tag> : (
                            <>
                              <button type="button" disabled={busy !== null} onClick={() => markItem(item, 'complete')} className="rounded-md border border-white/10 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:border-gold/45 hover:text-gold disabled:opacity-50">✓</button>
                              <button type="button" disabled={busy !== null} onClick={() => markItem(item, 'not_applicable')} className="rounded-md border border-white/10 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:border-gold/45 hover:text-gold disabled:opacity-50">N/A</button>
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Photos</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input className={`${inputCls} !min-h-8 flex-1`} placeholder="Photo label (e.g. Kitchen)" value={photoLabel} onChange={(e) => setPhotoLabel(e.target.value)} aria-label="Photo label" />
              <label className={`${btnOutline} cursor-pointer`}>
                <Camera size={14} /> Upload
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy === 'photo'} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPhoto(f); e.target.value = '' }} />
              </label>
            </div>
            {data.photos.length === 0 ? (
              <div className="mt-3"><EmptyState label="No photos yet." /></div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {data.photos.map((photo) => (
                  <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-md border border-white/10">
                    <img src={photo.url} alt={photo.label || 'Photo'} loading="lazy" className="h-24 w-full object-cover" />
                    <p className="truncate px-2 py-1 text-[11px] text-slate-400">{photo.label || 'Photo'}</p>
                  </a>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Issues</p>
              {(isProvider || isAdmin) && activeStatuses.has(t.status) && (
                <button type="button" className={btnOutline} onClick={() => setIssueOpen(true)}>Report issue</button>
              )}
            </div>
            {data.issues.length === 0 ? <EmptyState label="No issues." /> : (
              <ul className="space-y-2">
                {data.issues.map((issue) => (
                  <li key={issue.id} className="rounded-md border border-white/10 bg-white/[.02] p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag tone={issue.severity === 'high' || issue.severity === 'critical' ? 'red' : issue.severity === 'medium' ? 'gold' : 'slate'}>{issueTypeLabel(issue.issue_type)}</Tag>
                      <span className="text-xs text-slate-500">{issueSeverityLabel(issue.severity)} · {issueStatusLabel(issue.status)}{issue.affects_guest_readiness === 1 ? ' · affects readiness' : ''}{issue.excess_condition === 1 ? ' · excess' : ''}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-200">{issue.description}</p>
                    {issue.client_summary && <p className="mt-1 text-xs text-slate-500">Client: {issue.client_summary}</p>}
                    {issue.status === 'open' && (isProvider || isAdmin) && (
                      <div className="mt-2 flex gap-2">
                        <button className="btnOutline" disabled={busy !== null} onClick={() => resolveIssue(issue, 'approved')}>Approve</button>
                        <button className="btnOutline" disabled={busy !== null} onClick={() => resolveIssue(issue, 'declined')}>Decline</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Supplies observed</p>
            {data.supplies.length === 0 ? <div className="mt-2"><EmptyState label="No supply observations." /></div> : (
              <ul className="mt-2 divide-y divide-white/[.06]">
                {data.supplies.map((s, idx) => (
                  <li key={idx} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span className="text-slate-200">{s.supply_name} – {s.observed_stock}</span>
                    <Tag tone={s.flag === 'out' ? 'red' : s.flag === 'low' ? 'gold' : 'green'}>{s.flag}</Tag>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {data.access.length > 0 && (
            <Panel>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Access (secure)</p>
              <ul className="mt-2 space-y-2">
                {data.access.map((a) => (
                  <li key={a.id} className="rounded-md border border-white/10 bg-white/[.02] p-2.5 text-sm text-slate-200">
                    <p className="font-semibold">{a.label}</p>
                    {(a.entry_method || a.code_value) && <p className="mt-0.5 text-xs text-slate-400">{a.entry_method} · {a.code_value}</p>}
                    {(a.lockbox_location || a.instructions) && <p className="mt-0.5 text-xs text-slate-500">{a.lockbox_location}{a.instructions ? ` – ${a.instructions}` : ''}</p>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      {assignOpen && (
        <AssignModal turnoverId={t.id} staff={staff} onClose={() => setAssignOpen(false)} onDone={() => { setAssignOpen(false); void load() }} />
      )}
      {issueOpen && (
        <IssueModal turnoverId={t.id} onClose={() => setIssueOpen(false)} onDone={() => { setIssueOpen(false); void load() }} />
      )}
      {overrideOpen && (
        <ReasonModal title="Override guest-ready gate" turnoverId={t.id} onClose={() => setOverrideOpen(false)} onDone={() => { setOverrideOpen(false); void load() }} action="/override-guest-ready" />
      )}
      {cancelOpen && (
        <ReasonModal title="Cancel this turnover" turnoverId={t.id} onClose={() => setCancelOpen(false)} onDone={() => { setCancelOpen(false); void load() }} action="/cancel" />
      )}
    </div>
  )
}

function AssignModal({ turnoverId, staff, onClose, onDone }: { turnoverId: string; staff: StaffOption[]; onClose: () => void; onDone: () => void }) {
  const [provider, setProvider] = useState('')
  const [mode, setMode] = useState<'assign' | 'offer'>('assign')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!provider) return
    setBusy(true)
    try {
      await api.post(`/admin/str/turnovers/${turnoverId}/${mode === 'assign' ? 'assign' : 'offer'}`, { provider_user_id: provider, reason: reason || undefined })
      toast.success(mode === 'assign' ? 'Provider assigned.' : 'Offer sent.')
      onDone()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the provider.')
    } finally { setBusy(false) }
  }
  return (
    <Modal title={mode === 'assign' ? 'Assign provider' : 'Offer to provider'} onClose={onClose}>
      <div className="space-y-3">
        <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Provider (staff)</span>
          <select className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">Select…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
          </select>
        </label>
        <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Reason / note (optional)</span>
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. primary provider is booked" />
        </label>
        <div className="flex gap-2">
          <button className={btnOutline} onClick={() => setMode('assign')}>Assign directly</button>
          <button className={btnOutline} onClick={() => setMode('offer')}>Send offer</button>
        </div>
        <div className="flex justify-end gap-2">
          <button className={btnOutline} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={busy || !provider} onClick={submit}>{busy ? <Loader2 size={14} className="animate-spin" /> : null} {mode === 'assign' ? 'Assign' : 'Send offer'}</button>
        </div>
      </div>
    </Modal>
  )
}

function IssueModal({ turnoverId, onClose, onDone }: { turnoverId: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({ issue_type: 'damage', severity: 'medium', description: '', client_summary: '', internal_notes: '' })
  const [excess, setExcess] = useState(false)
  const [affectsReadiness, setAffectsReadiness] = useState(false)
  const [canContinue, setCanContinue] = useState(true)
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!form.description) return
    if (excess && !form.client_summary) { toast.error('An excess condition needs a client summary.'); return }
    setBusy(true)
    try {
      await api.post(`/admin/str/turnovers/${turnoverId}/issues`, {
        issue_type: form.issue_type, severity: form.severity, description: form.description,
        client_summary: form.client_summary || undefined, internal_notes: form.internal_notes || undefined,
        excess_condition: excess, affects_guest_readiness: affectsReadiness, can_continue: canContinue,
        requires_client_action: excess,
      })
      toast.success('Issue reported. Client and staff notified.')
      onDone()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not report the issue.')
    } finally { setBusy(false) }
  }
  return (
    <Modal title="Report issue" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Type</span>
            <select className={inputCls} value={form.issue_type} onChange={(e) => setForm((f) => ({ ...f, issue_type: e.target.value }))}>
              {(['damage', 'missing_item', 'maintenance', 'supply_shortage', 'excess_condition', 'access_problem', 'safety_concern', 'other'] as IssueType[]).map((t) => <option key={t} value={t}>{issueTypeLabel(t)}</option>)}
            </select>
          </label>
          <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Severity</span>
            <select className={inputCls} value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
              {(['low', 'medium', 'high', 'critical'] as IssueSeverity[]).map((s) => <option key={s} value={s}>{issueSeverityLabel(s)}</option>)}
            </select>
          </label>
        </div>
        <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Description</span>
          <textarea className={`${inputCls} min-h-[72px]`} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </label>
        <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Client-safe summary (shown in the portal)</span>
          <input className={inputCls} value={form.client_summary} onChange={(e) => setForm((f) => ({ ...f, client_summary: e.target.value }))} />
        </label>
        <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Internal notes (never client-visible)</span>
          <input className={inputCls} value={form.internal_notes} onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={excess} onChange={(e) => { setExcess(e.target.checked); if (e.target.checked) setAffectsReadiness(false) }} /> Excess condition (extra work that needs client approval)</label>
        <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={affectsReadiness} onChange={(e) => setAffectsReadiness(e.target.checked)} disabled={excess} /> Affects guest readiness</label>
        <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={!canContinue} onChange={(e) => setCanContinue(!e.target.checked)} /> Work is blocked</label>
        <div className="flex justify-end gap-2">
          <button className={btnOutline} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={busy || !form.description} onClick={submit}>{busy ? <Loader2 size={14} className="animate-spin" /> : null} Report issue</button>
        </div>
      </div>
    </Modal>
  )
}

function ReasonModal({ title, turnoverId, onClose, onDone, action }: { title: string; turnoverId: string; onClose: () => void; onDone: () => void; action: '/override-guest-ready' | '/cancel' }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!reason) return
    setBusy(true)
    try {
      await api.post(`/admin/str/turnovers/${turnoverId}${action}`, { reason })
      toast.success(action === '/override-guest-ready' ? 'Guest-ready gate overridden.' : 'Turnover cancelled.')
      onDone()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not complete that action.')
    } finally { setBusy(false) }
  }
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Reason (audit trail)</span>
          <textarea className={`${inputCls} min-h-[72px]`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being changed?" />
        </label>
        <div className="flex justify-end gap-2">
          <button className={btnOutline} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={busy || !reason} onClick={submit}>{busy ? <Loader2 size={14} className="animate-spin" /> : null} Confirm</button>
        </div>
      </div>
    </Modal>
  )
}
