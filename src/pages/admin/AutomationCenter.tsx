import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Pause, Play, RefreshCw, Settings2 } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag, btnPrimary, btnOutline, EmptyState, SkeletonTable, inputCls, CardList, DataCard, CardRow } from '../../components/admin/ui'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { RecentListShell, RecentWindowBar, filterByNeedle, useRecentWindow } from '../../components/admin/RecentWindow'
import { toast } from '../../components/kit/toast'
import { humanizeLabel } from '../../../shared/displayCase'

interface RunRow {
  id: string
  automation_key: string
  trigger_type: string
  status: string
  items_processed: number
  items_succeeded: number
  items_failed: number
  started_at: string
  finished_at: string | null
  detail_json?: string | null
}
interface AutomationRow {
  key: string
  label: string
  cadence: string
  description?: string
  enabled: boolean
  notes: string
  next_run_at: string | null
  last_run: RunRow | null
}
interface RuleRow {
  id: string
  name: string
  rule_type: string
  enabled: number
  config_json: string
}

type Tab = 'jobs' | 'envelopes' | 'history' | 'exceptions'
const TABS: { key: Tab; label: string; blurb: string }[] = [
  { key: 'jobs', label: 'Jobs', blurb: 'Pause, resume, and run each scheduled job' },
  { key: 'envelopes', label: 'Envelope rules', blurb: 'Reminders, expiration, and retention for e-sign packets' },
  { key: 'history', label: 'Run history', blurb: 'Most recent executions, with filters and detail' },
  { key: 'exceptions', label: 'Exceptions', blurb: 'Failed and partial runs that need an operator' },
]
const tone: Record<string, 'green' | 'gold' | 'red' | 'blue' | 'slate'> = {
  success: 'green', partial: 'gold', failed: 'red', running: 'blue',
}
const fmt = (v: string | null) => (v ? new Date(v).toLocaleString() : 'Not yet run')
function duration(r: RunRow | null) {
  if (!r?.finished_at) return r?.started_at ? 'In progress' : 'Not provided'
  const ms = new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()
  return ms < 1000 ? '<1 sec' : `${Math.round(ms / 1000)} sec`
}
function parseDetail(raw?: string | null) {
  try { return raw ? JSON.parse(raw) as Record<string, unknown> : null } catch { return null }
}

export default function AutomationCenter() {
  const [automations, setAutomations] = useState<AutomationRow[]>([])
  const [runs, setRuns] = useState<RunRow[]>([])
  const [rules, setRules] = useState<RuleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('jobs')
  const [jobFilter, setJobFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [openRun, setOpenRun] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const base = await api.get<{ automations: AutomationRow[]; runs: RunRow[]; rules?: RuleRow[] }>('/admin/automation-center')
      setAutomations(base.automations || [])
      setRuns(base.runs || [])
      if (base.rules) setRules(base.rules)
      else {
        try {
          const docs = await api.get<{ rules: RuleRow[] }>('/admin/document-platform/automation')
          setRules(docs.rules || [])
        } catch { setRules([]) }
      }
      setError(null)
    } catch (err) {
      if (!silent) setError(err instanceof ApiError ? err.message : 'Could not load automation activity.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useLiveRefresh(useCallback(() => load(true), [load]))

  const summary = useMemo(() => ({
    failed: runs.filter((r) => r.status === 'failed' || r.status === 'partial').length,
    processed: runs.slice(0, 20).reduce((s, r) => s + Number(r.items_processed || 0), 0),
    paused: automations.filter((a) => !a.enabled).length,
    running: automations.filter((a) => a.last_run?.status === 'running').length,
  }), [runs, automations])

  const filteredRuns = useMemo(() => {
    const byJob = jobFilter === 'all' ? runs : runs.filter((r) => r.automation_key === jobFilter)
    const byStatus = statusFilter === 'all' ? byJob : byStatusFilter(byJob, statusFilter)
    return filterByNeedle(byStatus, search, (r) => `${r.automation_key} ${r.status} ${r.trigger_type} ${r.detail_json || ''}`)
  }, [runs, jobFilter, statusFilter, search])

  const exceptions = useMemo(
    () => runs.filter((r) => r.status === 'failed' || r.status === 'partial' || Number(r.items_failed) > 0),
    [runs],
  )

  async function runNow(key: string) {
    if (!window.confirm('Run this automation now? Eligible queued work will be processed immediately.')) return
    setBusyKey(key)
    try {
      await api.post(`/admin/automation-center/${key}/run`, {})
      toast.success('Run started.')
      await load(true)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The automation could not be started.')
    } finally {
      setBusyKey(null)
    }
  }

  async function toggleEnabled(row: AutomationRow) {
    setBusyKey(`enable-${row.key}`)
    try {
      await api.patch(`/admin/automation-center/${row.key}`, { enabled: !row.enabled, notes: row.notes })
      toast.success(row.enabled ? 'Paused. The next cron will skip this job.' : 'Resumed. The next cron will process this job.')
      await load(true)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update this job.')
    } finally {
      setBusyKey(null)
    }
  }

  async function saveNotes(row: AutomationRow, notes: string) {
    try {
      await api.patch(`/admin/automation-center/${row.key}`, { enabled: row.enabled, notes })
      await load(true)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save notes.')
    }
  }

  async function toggleRule(rule: RuleRow) {
    try {
      await api.patch(`/admin/document-platform/automation/rules/${rule.id}`, { enabled: !Number(rule.enabled) })
      await load(true)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the envelope rule.')
    }
  }

  async function saveRuleConfig(rule: RuleRow, config: Record<string, unknown>) {
    try {
      await api.patch(`/admin/document-platform/automation/rules/${rule.id}`, { config })
      toast.success('Rule saved.')
      await load(true)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the rule.')
    }
  }

  if (loading) {
    return (
      <div>
        <PageIntro kicker="HQ Operations" title="Automation Center" subtitle="Monitor scheduled background work and run authorized jobs on demand." />
        <SkeletonTable rows={4} cols={6} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1500px] pb-12">
      <PageIntro
        kicker="HQ Operations"
        title="Automation Center"
        subtitle="Control scheduled jobs, envelope lifecycle rules, and recent execution. Lists default to the three most recent records."
        action={<button className={btnOutline} onClick={() => void load()}><RefreshCw size={14} /> Refresh</button>}
      />
      {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="!p-4"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">Jobs</p><p className="mt-2 text-2xl font-extrabold text-white">{automations.length}</p></Panel>
        <Panel className="!p-4"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">Paused</p><p className={`mt-2 text-2xl font-extrabold ${summary.paused ? 'text-amber-300' : 'text-white'}`}>{summary.paused}</p></Panel>
        <Panel className="!p-4"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">Exceptions</p><p className={`mt-2 text-2xl font-extrabold ${summary.failed ? 'text-amber-300' : 'text-emerald-300'}`}>{summary.failed}</p></Panel>
        <Panel className="!p-4"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">Items · last 20 runs</p><p className="mt-2 text-2xl font-extrabold text-white">{summary.processed.toLocaleString()}</p></Panel>
      </div>

      <div className="mb-5 overflow-hidden rounded-xl border border-white/[.08] bg-white/[.018]">
        <div className="flex gap-1 overflow-x-auto px-2 pt-2">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`shrink-0 rounded-t-lg border-b-2 px-3.5 py-2.5 text-sm font-bold transition ${tab === item.key ? 'border-gold bg-gold/[.06] text-white' : 'border-transparent text-slate-500 hover:bg-white/[.025] hover:text-slate-200'}`}
            >
              {item.label}
              {item.key === 'exceptions' && summary.failed > 0 && <span className="ml-2 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] text-amber-200">{summary.failed}</span>}
            </button>
          ))}
        </div>
        <p className="border-t border-white/[.08] px-4 py-2.5 text-xs text-slate-500">{TABS.find((item) => item.key === tab)?.blurb}</p>
      </div>

      {tab === 'jobs' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {automations.map((job) => (
            <Panel key={job.key} className="!p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-extrabold text-white">{job.label}</p>
                  <p className="mt-1 text-xs text-slate-500">Schedule: {job.cadence}</p>
                  {job.description && <p className="mt-2 text-xs leading-5 text-slate-400">{job.description}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Tag tone={job.enabled ? (tone[job.last_run?.status || ''] || 'slate') : 'gold'}>{job.enabled ? (job.last_run?.status || 'Not run') : 'Paused'}</Tag>
                </div>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Last completed</dt><dd className="mt-1 text-slate-200">{fmt(job.last_run?.finished_at || job.last_run?.started_at || null)}</dd></div>
                <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Next scheduled</dt><dd className="mt-1 text-slate-200">{job.next_run_at ? fmt(job.next_run_at) : job.cadence}</dd></div>
                <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Processed</dt><dd className="mt-1 text-xl font-extrabold text-white">{job.last_run?.items_processed ?? 0}</dd></div>
                <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Succeeded / failed</dt><dd className="mt-1 text-xl font-extrabold text-white">{job.last_run ? `${job.last_run.items_succeeded} / ${job.last_run.items_failed}` : '0 / 0'}</dd></div>
              </dl>
              <label className="mt-4 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Operator notes
                <textarea
                  className={`${inputCls} mt-1 min-h-16 text-sm`}
                  defaultValue={job.notes}
                  onBlur={(e) => { if (e.target.value !== job.notes) void saveNotes(job, e.target.value) }}
                  placeholder="Why this job is paused, who owns it, or what to watch."
                />
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className={btnPrimary} disabled={busyKey === job.key || !job.enabled} onClick={() => void runNow(job.key)}>
                  {busyKey === job.key ? 'Running…' : <><Play size={14} /> Run now</>}
                </button>
                <button className={btnOutline} disabled={busyKey === `enable-${job.key}`} onClick={() => void toggleEnabled(job)}>
                  {job.enabled ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Resume</>}
                </button>
                {job.key === 'document_envelopes' && <button className={btnOutline} onClick={() => setTab('envelopes')}><Settings2 size={14} /> Rules</button>}
              </div>
            </Panel>
          ))}
        </div>
      )}

      {tab === 'envelopes' && <EnvelopeRules rules={rules} onToggle={toggleRule} onSave={saveRuleConfig} onRun={() => void runNow('document_envelopes')} busy={busyKey === 'document_envelopes'} />}

      {tab === 'history' && (
        <HistoryTable
          runs={filteredRuns}
          automations={automations}
          jobFilter={jobFilter}
          statusFilter={statusFilter}
          search={search}
          openRun={openRun}
          onJob={setJobFilter}
          onStatus={setStatusFilter}
          onSearch={setSearch}
          onOpen={setOpenRun}
        />
      )}

      {tab === 'exceptions' && (
        exceptions.length === 0
          ? <EmptyState label="No failed or partial runs in the current history." />
          : <HistoryTable
              runs={exceptions}
              automations={automations}
              jobFilter="all"
              statusFilter="exceptions"
              search=""
              openRun={openRun}
              onJob={() => undefined}
              onStatus={() => undefined}
              onSearch={() => undefined}
              onOpen={setOpenRun}
              hideFilters
            />
      )}
    </div>
  )
}

function byStatusFilter(runs: RunRow[], status: string) {
  if (status === 'exceptions') return runs.filter((r) => r.status === 'failed' || r.status === 'partial')
  return runs.filter((r) => r.status === status)
}

function HistoryTable({
  runs, automations, jobFilter, statusFilter, search, openRun, onJob, onStatus, onSearch, onOpen, hideFilters,
}: {
  runs: RunRow[]
  automations: AutomationRow[]
  jobFilter: string
  statusFilter: string
  search: string
  openRun: string | null
  onJob: (v: string) => void
  onStatus: (v: string) => void
  onSearch: (v: string) => void
  onOpen: (id: string | null) => void
  hideFilters?: boolean
}) {
  const windowed = useRecentWindow(runs)
  const labelFor = (key: string) => automations.find((a) => a.key === key)?.label || humanizeLabel(key)
  return (
    <div>
      {!hideFilters && (
        <Panel className="mb-4 !p-4">
          <div className="flex flex-wrap gap-3">
            <select className={`${inputCls} max-w-[240px]`} value={jobFilter} onChange={(e) => onJob(e.target.value)}>
              <option value="all">All jobs</option>
              {automations.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
            <select className={`${inputCls} max-w-[180px]`} value={statusFilter} onChange={(e) => onStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="success">Success</option>
              <option value="partial">Partial</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
              <option value="exceptions">Exceptions</option>
            </select>
            <input className={`${inputCls} max-w-xs`} placeholder="Search runs…" value={search} onChange={(e) => onSearch(e.target.value)} />
          </div>
        </Panel>
      )}
      {runs.length === 0 ? <EmptyState label="No automation runs match these filters." /> : (
        <RecentListShell footer={<RecentWindowBar extra={windowed.extra} expanded={windowed.expanded} onToggle={() => windowed.setExpanded((v) => !v)} showing={windowed.showing} total={windowed.total} noun="runs" />}>
          <CardList className="p-3">{windowed.visible.map((r) => { const detail = parseDetail(r.detail_json); const open = openRun === r.id; return <DataCard key={r.id}><button type="button" className="block text-left font-semibold text-white hover:text-gold" onClick={() => onOpen(open ? null : r.id)}>{labelFor(r.automation_key)}</button>{open && <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-3 text-[11px] leading-5 text-slate-400">{detail?.error ? <p className="text-rose-200">{String(detail.error)}</p> : null}{Array.isArray(detail?.errors) && (detail.errors as string[]).length > 0 && <ul className="mt-1 list-disc space-y-1 pl-4">{(detail.errors as string[]).map((item) => <li key={item}>{item}</li>)}</ul>}{!detail?.error && !Array.isArray(detail?.errors) && <pre className="whitespace-pre-wrap">{JSON.stringify(detail || { note: 'No additional detail recorded.' }, null, 2)}</pre>}</div>}<div className="mt-3 space-y-1.5"><CardRow label="Trigger"><span className="capitalize">{r.trigger_type}</span></CardRow><CardRow label="Status"><Tag tone={tone[r.status] || 'slate'}>{r.status}</Tag></CardRow><CardRow label="Processed">{r.items_processed}</CardRow><CardRow label="Succeeded">{r.items_succeeded}</CardRow><CardRow label="Failed"><span className={r.items_failed ? 'text-rose-300' : ''}>{r.items_failed}</span></CardRow><CardRow label="Duration">{duration(r)}</CardRow><CardRow label="Started">{fmt(r.started_at)}</CardRow></div></DataCard> })}</CardList>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Automation</th>
                  <th className="px-4 py-3">Trigger</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Processed</th>
                  <th className="px-4 py-3">Succeeded</th>
                  <th className="px-4 py-3">Failed</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Started</th>
                </tr>
              </thead>
              <tbody>
                {windowed.visible.map((r) => {
                  const detail = parseDetail(r.detail_json)
                  const open = openRun === r.id
                  return (
                    <tr key={r.id} className="border-b border-white/5 last:border-0 align-top">
                      <td className="px-4 py-3 text-slate-200">
                        <button type="button" className="text-left font-semibold hover:text-gold" onClick={() => onOpen(open ? null : r.id)}>{labelFor(r.automation_key)}</button>
                        {open && (
                          <div className="mt-2 max-w-xl rounded-lg border border-white/10 bg-black/20 p-3 text-[11px] leading-5 text-slate-400">
                            {detail?.error ? <p className="text-rose-200">{String(detail.error)}</p> : null}
                            {Array.isArray(detail?.errors) && (detail.errors as string[]).length > 0 && (
                              <ul className="mt-1 list-disc space-y-1 pl-4">{(detail.errors as string[]).map((item) => <li key={item}>{item}</li>)}</ul>
                            )}
                            {!detail?.error && !Array.isArray(detail?.errors) && <pre className="whitespace-pre-wrap">{JSON.stringify(detail || { note: 'No additional detail recorded.' }, null, 2)}</pre>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-400">{r.trigger_type}</td>
                      <td className="px-4 py-3"><Tag tone={tone[r.status] || 'slate'}>{r.status}</Tag></td>
                      <td className="px-4 py-3 text-slate-300">{r.items_processed}</td>
                      <td className="px-4 py-3 text-slate-300">{r.items_succeeded}</td>
                      <td className={`px-4 py-3 ${r.items_failed ? 'text-rose-300' : 'text-slate-300'}`}>{r.items_failed}</td>
                      <td className="px-4 py-3 text-slate-400">{duration(r)}</td>
                      <td className="px-4 py-3 text-slate-400">{fmt(r.started_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </RecentListShell>
      )}
    </div>
  )
}

function EnvelopeRules({
  rules, onToggle, onSave, onRun, busy,
}: {
  rules: RuleRow[]
  onToggle: (rule: RuleRow) => void
  onSave: (rule: RuleRow, config: Record<string, unknown>) => void
  onRun: () => void
  busy: boolean
}) {
  if (!rules.length) {
    return (
      <Panel>
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 text-amber-300" size={18} />
          <div>
            <p className="font-bold text-white">Envelope rules are not installed yet</p>
            <p className="mt-2 text-sm text-slate-400">Apply migration 0060 (and 0044 if this environment predates the e-sign platform). Until then, lifecycle runs use safe defaults and no longer hard-fail the job.</p>
          </div>
        </div>
      </Panel>
    )
  }
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-bold text-white">Document envelope lifecycle</p>
            <p className="mt-1 text-sm text-slate-400">These rules send reminders, expire overdue packets, and apply retention. Pause a rule without pausing the whole job.</p>
          </div>
          <button className={btnPrimary} disabled={busy} onClick={onRun}><Play size={14} /> Run envelope job</button>
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-3">
        {rules.map((rule) => <RuleCard key={rule.id} rule={rule} onToggle={() => onToggle(rule)} onSave={(config) => onSave(rule, config)} />)}
      </div>
    </div>
  )
}

function RuleCard({ rule, onToggle, onSave }: { rule: RuleRow; onToggle: () => void; onSave: (config: Record<string, unknown>) => void }) {
  const initial = (() => { try { return JSON.parse(rule.config_json || '{}') as Record<string, unknown> } catch { return {} } })()
  const [maxReminders, setMaxReminders] = useState(String(initial.max_reminders ?? 20))
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-white">{rule.name}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{humanizeLabel(rule.rule_type)}</p>
        </div>
        <button type="button" onClick={onToggle} className={`rounded-full px-3 py-1 text-xs font-bold ${Number(rule.enabled) ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/5 text-slate-400'}`}>
          {Number(rule.enabled) ? 'Enabled' : 'Disabled'}
        </button>
      </div>
      {rule.rule_type === 'reminder' && (
        <label className="mt-4 block text-xs font-bold text-slate-400">Max reminders per recipient
          <input className={`${inputCls} mt-1`} type="number" min="1" max="50" value={maxReminders} onChange={(e) => setMaxReminders(e.target.value)} />
        </label>
      )}
      {rule.rule_type === 'expiration' && <p className="mt-4 text-xs leading-5 text-slate-400">Expires sent packets whose due date has passed and revokes unused signing links.</p>}
      {rule.rule_type === 'retention' && <p className="mt-4 text-xs leading-5 text-slate-400">Applies due disposition unless a legal hold covers the record.</p>}
      {rule.rule_type === 'reminder' && (
        <button className={`${btnOutline} mt-4 w-full`} onClick={() => onSave({ ...initial, max_reminders: Number(maxReminders) || 20 })}>Save rule</button>
      )}
    </Panel>
  )
}
