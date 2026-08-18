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
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('open')
  const [countyFilter, setCountyFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (countyFilter) params.set('county', countyFilter)
      const [jobsRes, sumRes, vendRes] = await Promise.all([
        api.get<{ jobs: Job[] }>(`/admin/cleaning/jobs?${params.toString()}`),
        api.get<{ summary: Summary }>('/admin/cleaning/jobs/summary'),
        api.get<{ vendors: Vendor[] }>('/admin/cleaning/assignable-vendors'),
      ])
      setJobs(jobsRes.jobs)
      setSummary(sumRes.summary || {})
      setVendors(vendRes.vendors)
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

  return (
    <div className="space-y-6">
      <PageIntro
        kicker="Cleaning Operations"
        title="Dispatch Board"
        subtitle="Every booked cleaning with client price, vendor payout, and margin. Assign vendors, move status, and keep turnovers on schedule."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Needs Review" value={String(summary.needs_review ?? 0)} />
        <StatCard label="Awaiting Vendor" value={String(summary.awaiting_vendor ?? 0)} />
        <StatCard label="Active" value={String(summary.active ?? 0)} />
        <StatCard label="Completed" value={String(summary.completed ?? 0)} />
        <StatCard label="Booked Revenue" value={formatUsd(summary.booked_revenue_cents ?? 0)} />
        <StatCard label="Completed Margin" value={formatUsd((summary.completed_revenue_cents ?? 0) - (summary.completed_payout_cents ?? 0))} />
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
                    <p className="font-medium text-white">{job.serviceLabel}</p>
                    <p className="text-xs text-slate-400">{job.reference} · {job.tierLabel || `${job.bedrooms}BR`}/{job.bathrooms}BA · {COUNTY_LABEL[job.county] || job.county}</p>
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
    </div>
  )
}
