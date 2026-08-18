import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, StatCard, EmptyState, inputCls } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { formatUsd } from '../../../shared/cleaningPricing'
import { CLEANING_JOB_STATUSES, cleaningStatusLabel, cleaningStatusTone, type CleaningStatusTone } from '../../../shared/cleaningJobs'

interface Job {
  id: string
  reference: string
  serviceLabel: string
  county: string
  tierLabel: string | null
  bedrooms: number
  bathrooms: number
  frequency: string
  status: string
  scheduledDate: string | null
  arrivalWindow: string | null
  clientTotalCents: number
  vendorPayoutCents: number
  marginCents: number
  marginPercent: number
  belowMinMargin: boolean
  needsReview: boolean
  assignedVendorName: string | null
  openIssues: number
  turnover: { urgency: string; minutesRemaining: number | null }
}
interface Summary {
  needs_review?: number
  awaiting_vendor?: number
  active?: number
  completed?: number
  booked_revenue_cents?: number
  completed_revenue_cents?: number
  completed_payout_cents?: number
}
interface Vendor { id: string; name: string }
interface Plan {
  id: string
  reference: string
  status: string
  frequency: string
  serviceLabel: string
  county: string
  bedrooms: number
  contactName: string | null
  propertyAddress: string | null
  nextDate: string | null
  skipNext: boolean
  visitsCompleted: number
}

const COUNTY_LABEL: Record<string, string> = { miami_dade: 'Miami-Dade', broward: 'Broward', palm_beach: 'Palm Beach' }

const toneClass: Record<CleaningStatusTone, string> = {
  neutral: 'bg-white/8 text-slate-300',
  info: 'bg-sky-500/15 text-sky-300',
  active: 'bg-gold/15 text-gold',
  success: 'bg-emerald-500/15 text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-300',
  danger: 'bg-rose-500/15 text-rose-300',
}

export default function CleaningDispatch() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [summary, setSummary] = useState<Summary>({})
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('open')
  const [countyFilter, setCountyFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (countyFilter) params.set('county', countyFilter)
      const [jobsRes, sumRes, vendRes, planRes] = await Promise.all([
        api.get<{ jobs: Job[] }>(`/admin/cleaning/jobs?${params.toString()}`),
        api.get<{ summary: Summary }>('/admin/cleaning/jobs/summary'),
        api.get<{ vendors: Vendor[] }>('/admin/cleaning/assignable-vendors'),
        api.get<{ plans: Plan[] }>('/admin/cleaning/plans'),
      ])
      setJobs(jobsRes.jobs)
      setSummary(sumRes.summary || {})
      setVendors(vendRes.vendors)
      setPlans(planRes.plans)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load cleaning jobs.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, countyFilter])

  useEffect(() => { void load() }, [load])

  async function assign(job: Job, vendorUserId: string) {
    if (!vendorUserId) return
    try {
      await api.post(`/admin/cleaning/jobs/${job.id}/assign`, { vendorUserId })
      toast.success('Vendor assigned.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not assign.')
    }
  }

  async function setStatus(job: Job, status: string) {
    try {
      await api.post(`/admin/cleaning/jobs/${job.id}/status`, { status })
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update status.')
    }
  }

  async function planAction(plan: Plan, action: string) {
    try {
      await api.post(`/admin/cleaning/plans/${plan.id}/action`, { action })
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the plan.')
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro
        kicker="Cleaning Operations"
        title="Dispatch Board"
        subtitle="Every booked cleaning with client price, vendor payout, and margin. Assign vendors, move status, and keep turnovers on schedule."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Needs Review" value={String(summary.needs_review ?? 0)} accent="coral" />
        <StatCard label="Awaiting Vendor" value={String(summary.awaiting_vendor ?? 0)} accent="gold" />
        <StatCard label="Active" value={String(summary.active ?? 0)} accent="sea" />
        <StatCard label="Completed" value={String(summary.completed ?? 0)} accent="green" />
        <StatCard label="Booked Revenue" value={formatUsd(summary.booked_revenue_cents ?? 0)} accent="gold" />
        <StatCard label="Completed Margin" value={formatUsd((summary.completed_revenue_cents ?? 0) - (summary.completed_payout_cents ?? 0))} accent="sea" />
      </div>

      <div className="flex flex-wrap gap-3">
        <select className={`${inputCls} max-w-[200px]`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="open">All open</option>
          <option value="">Everything</option>
          {CLEANING_JOB_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select className={`${inputCls} max-w-[200px]`} value={countyFilter} onChange={(e) => setCountyFilter(e.target.value)}>
          <option value="">All counties</option>
          {Object.entries(COUNTY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <Panel className="overflow-x-auto p-0">
        {loading ? (
          <p className="p-6 text-sm text-slate-400">Loading jobs…</p>
        ) : jobs.length === 0 ? (
          <EmptyState label="No cleaning jobs yet. Bookings from the public calculator will appear here." />
        ) : (
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Client</th>
                <th className="px-4 py-3 text-right">Payout</th>
                <th className="px-4 py-3 text-right">Margin</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-white/[.06] align-top">
                  <td className="px-4 py-3">
                    <button onClick={() => setSelectedId(job.id)} className="text-left">
                      <p className="font-medium text-white hover:text-gold">{job.serviceLabel}</p>
                      <p className="text-xs text-slate-400">{job.reference} · {job.tierLabel || `${job.bedrooms}BR`}/{job.bathrooms}BA · {COUNTY_LABEL[job.county] || job.county}</p>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-300">
                    {job.scheduledDate || <span className="text-amber-300">Unscheduled</span>}
                    {job.arrivalWindow && <span className="block text-slate-500">{job.arrivalWindow}</span>}
                    {job.turnover.urgency !== 'none' && job.turnover.minutesRemaining != null && (
                      <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${job.turnover.urgency === 'late' || job.turnover.urgency === 'at_risk' ? 'bg-rose-500/15 text-rose-300' : 'bg-amber-500/15 text-amber-300'}`}>
                        {job.turnover.minutesRemaining < 0 ? 'Late' : `${Math.floor(job.turnover.minutesRemaining / 60)}h ${job.turnover.minutesRemaining % 60}m left`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${toneClass[cleaningStatusTone(job.status)]}`}>{cleaningStatusLabel(job.status)}</span>
                    {job.openIssues > 0 && <span className="ml-1 inline-block rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">{job.openIssues} issue{job.openIssues > 1 ? 's' : ''}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-200">{formatUsd(job.clientTotalCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{formatUsd(job.vendorPayoutCents)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${job.belowMinMargin ? 'text-rose-300' : 'text-emerald-300'}`}>
                    {formatUsd(job.marginCents)}
                    <span className="block text-[10px] text-slate-500">{job.marginPercent}%{job.belowMinMargin ? ' · low' : ''}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {job.assignedVendorName ? (
                      <span className="text-slate-200">{job.assignedVendorName}</span>
                    ) : (
                      <select className={`${inputCls} max-w-[150px] py-1 text-xs`} defaultValue="" onChange={(e) => assign(job, e.target.value)}>
                        <option value="" disabled>Assign…</option>
                        {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {job.status === 'needs_review' && <button onClick={() => setStatus(job, 'scheduled')} className="text-xs font-semibold text-gold hover:underline">Approve</button>}
                    {job.status === 'requested' && <button onClick={() => setStatus(job, 'scheduled')} className="text-xs font-semibold text-gold hover:underline">Schedule</button>}
                    {!['completed', 'cancelled'].includes(job.status) && (
                      <button onClick={() => setStatus(job, 'cancelled')} className="ml-3 text-xs text-slate-500 hover:text-rose-300">Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {plans.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-white">Recurring plans</h2>
          <Panel className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Cadence</th>
                  <th className="px-4 py-3">Next visit</th>
                  <th className="px-4 py-3">Visits</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id} className="border-b border-white/[.06]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{plan.serviceLabel}</p>
                      <p className="text-xs text-slate-400">{plan.reference} · {plan.contactName || plan.propertyAddress || COUNTY_LABEL[plan.county]}</p>
                    </td>
                    <td className="px-4 py-3 text-xs capitalize text-slate-300">{plan.frequency}</td>
                    <td className="px-4 py-3 text-xs text-slate-300">{plan.status === 'active' ? (plan.nextDate || '-') : '-'}{plan.skipNext && plan.status === 'active' ? <span className="ml-1 text-amber-300">(skipping)</span> : null}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{plan.visitsCompleted}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${plan.status === 'active' ? 'bg-emerald-500/15 text-emerald-300' : plan.status === 'paused' ? 'bg-amber-500/15 text-amber-300' : 'bg-white/8 text-slate-400'}`}>{plan.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {plan.status === 'active' && <button onClick={() => planAction(plan, plan.skipNext ? 'unskip' : 'skip')} className="text-gold hover:underline">{plan.skipNext ? 'Unskip' : 'Skip next'}</button>}
                      {plan.status === 'active' && <button onClick={() => planAction(plan, 'pause')} className="ml-3 text-slate-400 hover:text-white">Pause</button>}
                      {plan.status === 'paused' && <button onClick={() => planAction(plan, 'resume')} className="text-gold hover:underline">Resume</button>}
                      {plan.status !== 'cancelled' && <button onClick={() => planAction(plan, 'cancel')} className="ml-3 text-slate-500 hover:text-rose-300">Cancel</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      )}

      {selectedId && <JobDrawer jobId={selectedId} vendors={vendors} onClose={() => setSelectedId(null)} onChanged={load} />}
    </div>
  )
}

interface JobDetail {
  job: Job & { propertyAddress: string | null; propertyUnit: string | null; contactName: string | null; contactPhone: string | null; payoutStatus: string; paymentStatus: string; marginPercent: number }
  notesInternal: string | null
  events: { id: string; kind: string; from_status: string | null; to_status: string | null; detail: string | null; created_at: string }[]
  checklist: { id: string; category: string; label: string; required: number; status: string }[]
  issues: { id: string; category: string; severity: string; description: string; status: string }[]
  photos: { id: string; label: string; url: string }[]
}

function JobDrawer({ jobId, vendors, onClose, onChanged }: { jobId: string; vendors: Vendor[]; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<JobDetail | null>(null)
  const load = useCallback(async () => {
    try { setDetail(await api.get<JobDetail>(`/admin/cleaning/jobs/${jobId}`)) } catch { /* ignore */ }
  }, [jobId])
  useEffect(() => { void load() }, [load])

  async function act(fn: () => Promise<unknown>) {
    try { await fn(); await load(); onChanged() } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Action failed.') }
  }

  const j = detail?.job
  const done = detail ? detail.checklist.filter((i) => i.status === 'complete' || i.status === 'not_applicable').length : 0

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-navy-950 p-6" onClick={(e) => e.stopPropagation()}>
        {!j ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">{j.serviceLabel}</h2>
                <p className="text-xs text-slate-400">{j.reference} · {cleaningStatusLabel(j.status)}</p>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-white/10 p-2"><p className="text-[10px] uppercase text-slate-500">Client</p><p className="text-sm font-semibold text-white">{formatUsd(j.clientTotalCents)}</p></div>
              <div className="rounded-md border border-white/10 p-2"><p className="text-[10px] uppercase text-slate-500">Payout</p><p className="text-sm font-semibold text-slate-200">{formatUsd(j.vendorPayoutCents)}</p></div>
              <div className="rounded-md border border-white/10 p-2"><p className="text-[10px] uppercase text-slate-500">Margin</p><p className={`text-sm font-semibold ${j.belowMinMargin ? 'text-rose-300' : 'text-emerald-300'}`}>{j.marginPercent}%</p></div>
            </div>

            {(j.propertyAddress || j.contactName) && (
              <div className="mt-4 text-sm text-slate-300">
                {j.propertyAddress && <p>{j.propertyAddress}{j.propertyUnit ? `, ${j.propertyUnit}` : ''}</p>}
                {j.contactName && <p className="text-slate-400">{j.contactName}{j.contactPhone ? ` · ${j.contactPhone}` : ''}</p>}
                <p className="text-slate-500">{j.scheduledDate || 'Unscheduled'}{j.arrivalWindow ? ` · ${j.arrivalWindow}` : ''}</p>
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex flex-wrap gap-2">
              {!j.assignedVendorName && (
                <select className={`${inputCls} max-w-[180px] py-1 text-xs`} defaultValue="" onChange={(e) => e.target.value && act(() => api.post(`/admin/cleaning/jobs/${jobId}/assign`, { vendorUserId: e.target.value }))}>
                  <option value="" disabled>Assign vendor…</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
              {j.status === 'needs_review' && <button onClick={() => act(() => api.post(`/admin/cleaning/jobs/${jobId}/status`, { status: 'scheduled' }))} className="rounded-md bg-gold px-3 py-1.5 text-xs font-semibold text-navy-950">Approve</button>}
              {j.payoutStatus !== 'paid' && j.status === 'completed' && <button onClick={() => act(() => api.patch(`/admin/cleaning/jobs/${jobId}`, { payoutStatus: 'approved' }))} className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-200">Approve payout</button>}
              {!['completed', 'cancelled'].includes(j.status) && <button onClick={() => act(() => api.post(`/admin/cleaning/jobs/${jobId}/status`, { status: 'cancelled' }))} className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:text-rose-300">Cancel</button>}
            </div>

            {detail.issues.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Issues</p>
                {detail.issues.map((i) => <p key={i.id} className={`mt-1 text-sm ${i.severity === 'urgent' ? 'text-rose-300' : 'text-amber-300'}`}>{i.category} · {i.severity}: {i.description}</p>)}
              </div>
            )}

            {detail.photos.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Photos</p>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {detail.photos.map((p) => <img key={p.id} src={`/api${p.url}`} alt={p.label} className="aspect-square w-full rounded object-cover" loading="lazy" />)}
                </div>
              </div>
            )}

            {detail.checklist.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checklist · {done}/{detail.checklist.length}</p>
                <div className="mt-2 space-y-1">
                  {detail.checklist.map((i) => (
                    <p key={i.id} className={`text-sm ${i.status === 'complete' || i.status === 'not_applicable' ? 'text-slate-500 line-through' : 'text-slate-300'}`}>{i.label}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">History</p>
              <div className="mt-2 space-y-1">
                {detail.events.map((e) => (
                  <p key={e.id} className="text-xs text-slate-400">{e.created_at.slice(0, 16).replace('T', ' ')} · {e.to_status ? cleaningStatusLabel(e.to_status) : e.kind}{e.detail ? ` - ${e.detail}` : ''}</p>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
