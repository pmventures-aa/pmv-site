import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag, btnPrimary, btnOutline, EmptyState, SkeletonTable } from '../../components/admin/ui'
import { useLiveRefresh } from '../../lib/liveRefresh'

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
  next_run_at: string | null
  last_run: RunRow | null
}

const tone: Record<string, 'green'|'gold'|'red'|'blue'|'slate'> = {
  success: 'green', partial: 'gold', failed: 'red', running: 'blue',
}
const fmt = (v: string | null) => v ? new Date(v).toLocaleString() : 'Not yet run'
const duration = (r: RunRow | null) => {
  if (!r?.finished_at) return r?.started_at ? 'In progress' : '—'
  const ms = new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()
  return ms < 1000 ? '<1 sec' : `${Math.round(ms / 1000)} sec`
}

export default function AutomationCenter() {
  const [automations, setAutomations] = useState<AutomationRow[]>([])
  const [runs, setRuns] = useState<RunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await api.get<{automations: AutomationRow[]; runs: RunRow[]}>('/admin/automation-center')
      setAutomations(res.automations); setRuns(res.runs); setError(null)
    } catch (err) {
      if (!silent) setError(err instanceof ApiError ? err.message : 'Could not load automation activity.')
    } finally { if (!silent) setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  useLiveRefresh(useCallback(() => load(true), [load]))

  const summary = useMemo(() => {
    const failed = runs.filter((r) => r.status === 'failed' || r.status === 'partial').length
    const processed = runs.slice(0, 20).reduce((sum, r) => sum + Number(r.items_processed || 0), 0)
    const active = automations.filter((a) => a.last_run?.status === 'running').length
    return { failed, processed, active }
  }, [runs, automations])

  async function runNow(key: string) {
    if (!window.confirm('Run this automation now? Any eligible queued work will be processed immediately.')) return
    setBusyKey(key)
    try {
      await api.post(`/admin/automation-center/${key}/run`)
      await load()
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'The automation could not be started.')
    } finally { setBusyKey(null) }
  }

  if (loading) return <div><PageIntro kicker="HQ Operations" title="Automation Center" subtitle="Monitor scheduled background work and run authorized jobs on demand." /><SkeletonTable rows={4} cols={6} /></div>

  return <div className="mx-auto max-w-[1500px]">
    <PageIntro kicker="HQ Operations" title="Automation Center" subtitle="Monitor background jobs, verify recent execution, review exceptions, and run authorized work on demand." />
    {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}

    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      <Panel className="!p-4"><p className="text-[10px] uppercase tracking-[.15em] text-slate-500">Configured automations</p><p className="mt-2 text-2xl font-semibold text-white">{automations.length}</p></Panel>
      <Panel className="!p-4"><p className="text-[10px] uppercase tracking-[.15em] text-slate-500">Recent exceptions</p><p className={`mt-2 text-2xl font-semibold ${summary.failed ? 'text-amber-300' : 'text-emerald-300'}`}>{summary.failed}</p></Panel>
      <Panel className="!p-4"><p className="text-[10px] uppercase tracking-[.15em] text-slate-500">Items processed · last 20 runs</p><p className="mt-2 text-2xl font-semibold text-white">{summary.processed.toLocaleString()}</p></Panel>
    </div>

    <div className="mb-8 grid gap-4 lg:grid-cols-2">
      {automations.map((a) => <Panel key={a.key} className="!p-5">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-semibold text-white">{a.label}</p><p className="mt-1 text-xs text-slate-500">Schedule: {a.cadence}</p></div>
          <Tag tone={tone[a.last_run?.status || ''] || 'slate'}>{a.last_run?.status || 'Not run'}</Tag>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-xs uppercase tracking-wide text-slate-500">Last completed run</dt><dd className="mt-1 text-slate-200">{fmt(a.last_run?.finished_at || a.last_run?.started_at || null)}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-slate-500">Next scheduled run</dt><dd className="mt-1 text-slate-200">{a.next_run_at ? fmt(a.next_run_at) : a.cadence}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-slate-500">Items processed</dt><dd className="mt-1 text-xl font-semibold text-white">{a.last_run?.items_processed ?? 0}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-slate-500">Succeeded / failed</dt><dd className="mt-1 text-xl font-semibold text-white">{a.last_run ? `${a.last_run.items_succeeded} / ${a.last_run.items_failed}` : '0 / 0'}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-slate-500">Duration</dt><dd className="mt-1 text-slate-200">{duration(a.last_run)}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-slate-500">Trigger</dt><dd className="mt-1 capitalize text-slate-200">{a.last_run?.trigger_type || '—'}</dd></div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2"><button className={btnPrimary} disabled={busyKey === a.key} onClick={() => runNow(a.key)}>{busyKey === a.key ? 'Running…' : 'Run now'}</button><button className={btnOutline} onClick={() => void load()}>Refresh</button></div>
      </Panel>)}
    </div>

    <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-slate-500">Execution history</p><h2 className="mt-1 text-sm font-semibold text-white">Recent automation runs</h2></div>{summary.active > 0 && <Tag tone="blue">{summary.active} running</Tag>}</div>
    {runs.length === 0 ? <EmptyState label="No automation runs have been recorded yet." /> : <div className="overflow-x-auto rounded-md border border-white/10">
      <table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-3">Automation</th><th className="px-4 py-3">Trigger</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Processed</th><th className="px-4 py-3">Succeeded</th><th className="px-4 py-3">Failed</th><th className="px-4 py-3">Duration</th><th className="px-4 py-3">Started</th></tr></thead><tbody>{runs.map((r) => <tr key={r.id} className="border-b border-white/5 last:border-0"><td className="px-4 py-3 text-slate-200">{automations.find((a) => a.key === r.automation_key)?.label || r.automation_key}</td><td className="px-4 py-3 capitalize text-slate-400">{r.trigger_type}</td><td className="px-4 py-3"><Tag tone={tone[r.status] || 'slate'}>{r.status}</Tag></td><td className="px-4 py-3 text-slate-300">{r.items_processed}</td><td className="px-4 py-3 text-slate-300">{r.items_succeeded}</td><td className={`px-4 py-3 ${r.items_failed ? 'text-rose-300' : 'text-slate-300'}`}>{r.items_failed}</td><td className="px-4 py-3 text-slate-400">{duration(r)}</td><td className="px-4 py-3 text-slate-400">{fmt(r.started_at)}</td></tr>)}</tbody></table>
    </div>}
  </div>
}
