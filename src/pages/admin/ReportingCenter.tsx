import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, NoAccess, inputCls, btnPrimary, btnOutline, SkeletonStatCard, SkeletonTable } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { useCapabilities } from '../../lib/capabilities'
import { Dialog, DialogContent } from '../../components/kit/Dialog'

interface CatalogEntry {
  key: string
  label: string
  category: 'business' | 'employee' | 'client' | 'operations'
  description: string
}
interface Column {
  key: string
  label: string
  type?: 'number' | 'money' | 'percent' | 'text' | 'date'
}
interface ReportResult {
  key: string
  label: string
  columns: Column[]
  rows: Record<string, unknown>[]
}
interface Template {
  id: string
  name: string
  report_key: string
  schedule_cron: string | null
  created_at: string
}

const CATEGORIES: { key: CatalogEntry['category']; label: string }[] = [
  { key: 'business', label: 'Business' },
  { key: 'employee', label: 'Employee' },
  { key: 'client', label: 'Client' },
  { key: 'operations', label: 'Operations' },
]
const KPI_KEYS = ['total_leads', 'conversion_rate', 'active_clients', 'outstanding_invoices']

function formatValue(value: unknown, type?: Column['type']): string {
  if (value === null || value === undefined) return '—'
  if (type === 'money') return `$${((value as number) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (type === 'percent') return `${value}%`
  if (typeof value === 'number') return value.toLocaleString()
  return String(value)
}

function todayISO(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)
}

export default function ReportingCenter() {
  const caps = useCapabilities()
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [category, setCategory] = useState<CatalogEntry['category']>('business')
  const [from, setFrom] = useState(todayISO(-30))
  const [to, setTo] = useState(todayISO())
  const [results, setResults] = useState<Record<string, ReportResult>>({})
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set())
  const [templates, setTemplates] = useState<Template[]>([])
  const [savingReport, setSavingReport] = useState<string | null>(null)

  useEffect(() => {
    if (!caps.can_view_reports && !caps.loading) return
    api.get<{ reports: CatalogEntry[] }>('/admin/reports/catalog').then((r) => setCatalog(r.reports)).catch(() => {})
    api.get<{ templates: Template[] }>('/admin/report-templates').then((r) => setTemplates(r.templates)).catch(() => {})
  }, [caps.can_view_reports, caps.loading])

  const runReport = useCallback(
    (key: string) => {
      setLoadingKeys((s) => new Set(s).add(key))
      api
        .get<ReportResult>(`/admin/reports/${key}?from=${from}&to=${to}`)
        .then((r) => setResults((cur) => ({ ...cur, [key]: r })))
        .catch(() => toast.error(`Could not load "${key.replace(/_/g, ' ')}".`))
        .finally(() =>
          setLoadingKeys((s) => {
            const next = new Set(s)
            next.delete(key)
            return next
          }),
        )
    },
    [from, to],
  )

  useEffect(() => {
    if (catalog.length === 0) return
    for (const key of KPI_KEYS) runReport(key)
  }, [catalog.length, runReport])

  useEffect(() => {
    // KPI_KEYS are already fetched by the effect above (and shown in the
    // KPI strip) — skip re-fetching/re-rendering them here as a duplicate
    // card in the Business tab.
    for (const entry of catalog.filter((c) => c.category === category && !KPI_KEYS.includes(c.key))) runReport(entry.key)
  }, [category, catalog, runReport])

  async function saveTemplate(reportKey: string, name: string) {
    try {
      await api.post('/admin/report-templates', { name, report_key: reportKey, filters: { from, to } })
      toast.success('Report saved.')
      const r = await api.get<{ templates: Template[] }>('/admin/report-templates')
      setTemplates(r.templates)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save this report.')
    } finally {
      setSavingReport(null)
    }
  }

  async function runTemplate(t: Template) {
    try {
      const r = await api.post<ReportResult>(`/admin/report-templates/${t.id}/run`)
      setResults((cur) => ({ ...cur, [t.report_key]: r }))
      toast.success(`"${t.name}" refreshed.`)
    } catch {
      toast.error('Could not run this saved report.')
    }
  }

  async function deleteTemplate(id: string) {
    try {
      await api.del(`/admin/report-templates/${id}`)
      setTemplates((ts) => ts.filter((t) => t.id !== id))
    } catch {
      toast.error('Could not remove this saved report.')
    }
  }

  if (!caps.loading && !caps.can_view_reports) {
    return (
      <div>
        <PageIntro kicker="Insights" title="Reporting Center" />
        <NoAccess label="the Reporting Center" />
      </div>
    )
  }

  const categoryEntries = catalog.filter((c) => c.category === category && !KPI_KEYS.includes(c.key))

  return (
    <div>
      <PageIntro
        kicker="Insights"
        title="Reporting Center"
        subtitle="Real-time metrics across the firm. Export any report to CSV, print/save as PDF, or save it as a reusable template."
        action={
          <button onClick={() => window.print()} className={`${btnOutline} print:hidden`}>
            Print / Save as PDF
          </button>
        }
      />

      <Panel className="mb-6 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">From</span>
            <input className={inputCls} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">To</span>
            <input className={inputCls} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <p className="pb-2.5 text-xs text-slate-500">Reports with "(period)" or "(range)" in their description use this window; others are a live snapshot.</p>
        </div>
      </Panel>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {KPI_KEYS.map((key) => {
          const r = results[key]
          const col = r?.columns[0]
          const val = r?.rows[0]?.[col?.key ?? '']
          if (loadingKeys.has(key) && !r) return <SkeletonStatCard key={key} />
          return (
            <Panel key={key} className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{r?.label ?? key.replace(/_/g, ' ')}</p>
              <p className="mt-2 font-display text-3xl font-medium text-white tabular-nums">
                {loadingKeys.has(key) ? '…' : formatValue(val, col?.type)}
              </p>
            </Panel>
          )
        })}
      </div>

      {templates.length > 0 && (
        <Panel className="mb-6 print:hidden">
          <h3 className="mb-3 text-sm font-semibold text-white">Saved reports</h3>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-1.5 text-xs">
                <span className="text-slate-200">{t.name}</span>
                <button onClick={() => runTemplate(t)} className="font-medium text-gold hover:underline">
                  Run
                </button>
                <button onClick={() => deleteTemplate(t.id)} className="text-slate-500 hover:text-rose-300">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="mb-5 flex gap-1.5 border-b border-white/10 print:hidden">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
              category === c.key ? 'border-gold text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {categoryEntries.map((entry) => (
          <ReportCard
            key={entry.key}
            entry={entry}
            result={results[entry.key]}
            loading={loadingKeys.has(entry.key)}
            from={from}
            to={to}
            onSave={() => setSavingReport(entry.key)}
          />
        ))}
      </div>

      {savingReport && (
        <SaveTemplateDialog reportKey={savingReport} onClose={() => setSavingReport(null)} onSave={(name) => saveTemplate(savingReport, name)} />
      )}
    </div>
  )
}

function ReportCard({
  entry,
  result,
  loading,
  from,
  to,
  onSave,
}: {
  entry: CatalogEntry
  result?: ReportResult
  loading: boolean
  from: string
  to: string
  onSave: () => void
}) {
  const isSingleStat = result && result.columns.length === 1 && result.rows.length <= 1

  return (
    <Panel className="!p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{entry.label}</h3>
          <p className="text-xs text-slate-500">{entry.description}</p>
        </div>
        <div className="flex shrink-0 gap-3 print:hidden">
          <button onClick={onSave} className="text-xs font-medium text-slate-400 hover:text-white">
            Save
          </button>
          <a href={`/api/admin/reports/${entry.key}/export.csv?from=${from}&to=${to}`} className="text-xs font-medium text-gold hover:underline" download>
            Export CSV
          </a>
        </div>
      </div>
      <div className="p-5">
        {loading && !result ? (
          <SkeletonTable rows={3} cols={4} />
        ) : !result || result.rows.length === 0 ? (
          <p className="text-sm text-slate-500">No data for this range.</p>
        ) : isSingleStat ? (
          <p className="font-display text-3xl font-medium text-white tabular-nums">{formatValue(result.rows[0][result.columns[0].key], result.columns[0].type)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                  {result.columns.map((c) => (
                    <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-t border-white/5">
                    {result.columns.map((c) => (
                      <td key={c.key} className="whitespace-nowrap px-3 py-2 text-slate-200 tabular-nums">
                        {formatValue(row[c.key], c.type)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  )
}

function SaveTemplateDialog({ reportKey, onClose, onSave }: { reportKey: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Save this report" description="Reuse it later with the same date range, from the Saved reports list.">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) onSave(name.trim())
          }}
          className="space-y-4"
        >
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Name</span>
            <input className={inputCls} required autoFocus placeholder={reportKey.replace(/_/g, ' ')} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className={btnOutline}>
              Cancel
            </button>
            <button type="submit" className={btnPrimary}>
              Save
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
