import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, StatCard, inputCls } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { formatUsd, summarizeCleaningJobs, type CleaningReport } from '../../../shared/cleaningReports'

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
}

export default function CleaningReports() {
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(daysAgo(0))
  const [report, setReport] = useState<CleaningReport>(() => summarizeCleaningJobs([]))
  const [activePlans, setActivePlans] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ report: CleaningReport; activePlans: number }>(`/admin/cleaning/reports?from=${from}&to=${to}`)
      setReport(res.report)
      setActivePlans(res.activePlans)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load reports.')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-6">
      <PageIntro kicker="Cleaning Operations" title="Cleaning Reports" subtitle="Booked and completed revenue, vendor cost, and gross margin across the cleaning line. Every figure is derived from real jobs." />

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-400"><span className="mb-1 block">From</span><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs text-slate-400"><span className="mb-1 block">To</span><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {loading && <span className="pb-2 text-xs text-slate-500">Loading…</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Booked Revenue" value={formatUsd(report.bookedRevenueCents)} />
        <StatCard label="Completed Revenue" value={formatUsd(report.completedRevenueCents)} />
        <StatCard label="Vendor Cost" value={formatUsd(report.vendorCostCents)} />
        <StatCard label="Gross Margin" value={`${formatUsd(report.grossMarginCents)} · ${report.grossMarginPercent}%`} />
        <StatCard label="Average Ticket" value={formatUsd(report.averageTicketCents)} />
        <StatCard label="Completion Rate" value={`${report.completionRate}%`} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Jobs" value={String(report.jobCount)} />
        <StatCard label="Completed" value={String(report.completedCount)} />
        <StatCard label="STR / Residential" value={`${report.strCount} / ${report.residentialCount}`} />
        <StatCard label="Active Recurring Plans" value={String(activePlans)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <h2 className="text-sm font-semibold text-white">By service</h2>
          <BreakdownTable rows={report.byService} />
        </Panel>
        <Panel>
          <h2 className="text-sm font-semibold text-white">By county</h2>
          <BreakdownTable rows={report.byCounty} />
        </Panel>
      </div>
    </div>
  )
}

function BreakdownTable({ rows }: { rows: CleaningReport['byService'] }) {
  if (!rows.length) return <p className="mt-3 text-sm text-slate-500">No jobs in this range.</p>
  return (
    <table className="mt-3 w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-white/[.06]">
            <td className="py-2 text-slate-200">{r.label}</td>
            <td className="py-2 text-right tabular-nums text-slate-400">{r.count}</td>
            <td className="py-2 text-right tabular-nums text-slate-200">{formatUsd(r.revenueCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
