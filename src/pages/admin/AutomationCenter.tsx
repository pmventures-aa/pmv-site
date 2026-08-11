import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag, btnPrimary, EmptyState, SkeletonTable } from '../../components/admin/ui'
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

  async function runNow(key: string) {
    if (!window.confirm('Run this automation now? This may process queued work immediately.')) return
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
    <PageIntro kicker="HQ Operations" title="Automation Center" subtitle="Monitor scheduled background work, review execution history, and run authorized jobs when needed." />
    {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}

    <div className="mb-8 grid gap-4 lg:grid-cols-2">
      {automations.map((a) => <Panel key={a.key} className="!p-5">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-semibold text-white">{a.label}</p><p className="mt-1 text-xs text-slate-500">{a.cadence}</p></div>
          <Tag tone={tone[a.last_run?.status || ''] || 'slate'}>{a.last_run?.status || 'Not run'}</Tag>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-xs uppercase tracking-wide text-slate-500">Last run</dt><dd className="mt-1 text-slate-200">{fmt(a.last_run?.finished_at || a.last_run?.started_at || null)}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-slate-500">Next run</dt><dd className="mt-1 text-slate-200">{a.next_run_at ? fmt(a.next_run_at) : a.cadence}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-slate-500">Items processed</dt><dd className="mt-1 text-xl font-semibold text-white">{a.last_run?.items_processed ?? 0}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-slate-500">Succeeded / failed</dt><dd className="mt-1 text-xl font-semibold text-white">{a.last_run ? `${a.last_run.items_succeeded} / ${a.last_run.items_failed}` : '0 / 0'}</dd></div>
        </dl>
        <button className={`${btnPrimary} mt-5`} disabled={busyKey === a.key} onClick={() => runNow(a.key)}>{busyKey === a.key ? 'Running…' : 'Run now'}</button>
      </Panel>)}
    </div>

    <h2 className="mb-3 text-sm font-semibold text-white">Execution history</h2>
    {runs.length === 0 ? <EmptyState label="No automation runs have been recorded yet." /> : <div className="overflow-x-auto rounded-md border border-white/10">
      <table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-3">Automation</th><th className="px-4 py-3">Trigger</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Processed</th><th className="px-4 py-3">Succeeded</th><th className="px-4 py-3">Failed</th><th className="px-4 py-3">Started</th></tr></thead><tbody>{runs.map((r) => <tr key={r.id} className="border-b border-white/5 last:border-0"><td className="px-4 py-3 text-slate-200">{automations.find((a) => a.key === r.automation_key)?.label || r.automation_key}</td><td className="px-4 py-3 text-slate-400">{r.trigger_type}</td><td className="px-4 py-3"><Tag tone={tone[r.status] || 'slate'}>{r.status}</Tag></td><td className="px-4 py-3 text-slate-300">{r.items_processed}</td><td className="px-4 py-3 text-slate-300">{r.items_succeeded}</td><td className="px-4 py-3 text-slate-300">{r.items_failed}</td><td className="px-4 py-3 text-slate-400">{fmt(r.started_at)}</td></tr>)}</tbody></table>
    </div>}
  </div>
}
