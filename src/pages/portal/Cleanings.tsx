import { useCallback, useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { Card, EmptyState, PageHeader } from '../../components/ui'
import { toast } from '../../components/kit/toast'
import { formatUsd } from '../../../shared/cleaningPricing'
import { cleaningStatusLabel } from '../../../shared/cleaningJobs'
import { frequencyLabel, type RecurringFrequency } from '../../../shared/cleaningRecurrence'

interface CJob {
  id: string; reference: string; serviceType: string; serviceLabel: string; status: string
  scheduledDate: string | null; arrivalWindow: string | null; totalCents: number; frequency: string; recurring: boolean
}
interface CPlan { id: string; reference: string; status: string; frequency: string; serviceLabel: string; nextDate: string | null; skipNext: boolean; visitsCompleted: number }
interface Report { job: CJob; checklist: { done: number; total: number }; photos: { id: string; label: string; url: string }[] }

export default function Cleanings() {
  const [upcoming, setUpcoming] = useState<CJob[]>([])
  const [past, setPast] = useState<CJob[]>([])
  const [plans, setPlans] = useState<CPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [openReport, setOpenReport] = useState<Record<string, Report | null>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [jobs, planRes] = await Promise.all([
        api.get<{ upcoming: CJob[]; past: CJob[] }>('/portal/cleaning/jobs'),
        api.get<{ plans: CPlan[] }>('/portal/cleaning/plans'),
      ])
      setUpcoming(jobs.upcoming)
      setPast(jobs.past)
      setPlans(planRes.plans)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load your cleanings.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  async function toggleReport(job: CJob) {
    if (openReport[job.id]) { setOpenReport((s) => ({ ...s, [job.id]: null })); return }
    try {
      const rep = await api.get<Report>(`/portal/cleaning/jobs/${job.id}`)
      setOpenReport((s) => ({ ...s, [job.id]: rep }))
    } catch { /* ignore */ }
  }

  async function planAction(plan: CPlan, action: string) {
    try { await api.post(`/portal/cleaning/plans/${plan.id}/action`, { action }); await load() }
    catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not update the plan.') }
  }

  async function convert(job: CJob, frequency: RecurringFrequency) {
    try {
      await api.post(`/portal/cleaning/jobs/${job.id}/convert-recurring`, { frequency })
      toast.success('Recurring plan started. We will keep it handled.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not start the plan.')
    }
  }

  const canConvert = (j: CJob) => j.status === 'completed' && !j.recurring && j.frequency === 'one_time' && j.serviceType === 'residential_standard'

  return (
    <div>
      <PageHeader eyebrow="Cleaning" title="My Cleanings" subtitle="Your upcoming and past cleanings, completion reports, and recurring service." />

      {loading ? (
        <p className="mt-6 text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="mt-6 space-y-8">
          {plans.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-white">Recurring plans</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {plans.map((plan) => (
                  <Card key={plan.id}>
                    <div className="flex items-baseline justify-between">
                      <p className="font-semibold text-white">{plan.serviceLabel}</p>
                      <span className="text-xs capitalize text-gold">{plan.frequency}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {plan.status === 'active' ? `Next visit ${plan.nextDate || 'soon'}${plan.skipNext ? ' (skipping one)' : ''}` : plan.status} · {plan.visitsCompleted} completed
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs">
                      {plan.status === 'active' && <button onClick={() => planAction(plan, plan.skipNext ? 'unskip' : 'skip')} className="font-semibold text-gold">{plan.skipNext ? 'Unskip next' : 'Skip next'}</button>}
                      {plan.status === 'active' && <button onClick={() => planAction(plan, 'pause')} className="text-slate-400 hover:text-white">Pause</button>}
                      {plan.status === 'paused' && <button onClick={() => planAction(plan, 'resume')} className="font-semibold text-gold">Resume</button>}
                      {plan.status !== 'cancelled' && <button onClick={() => planAction(plan, 'cancel')} className="text-slate-500 hover:text-rose-300">Cancel</button>}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold text-white">Upcoming</h2>
            {upcoming.length === 0 ? <EmptyState label="When you book a cleaning it will show up here." /> : (
              <div className="grid gap-3">
                {upcoming.map((job) => (
                  <Card key={job.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-semibold text-white">{job.serviceLabel}</p>
                      <span className="text-sm font-semibold text-gold">{formatUsd(job.totalCents)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{job.reference} · {cleaningStatusLabel(job.status)} · {job.scheduledDate || 'Scheduling'}{job.arrivalWindow ? ` · ${job.arrivalWindow}` : ''}</p>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-white">Past</h2>
            {past.length === 0 ? <EmptyState label="Completed cleanings and their reports appear here." /> : (
              <div className="grid gap-3">
                {past.map((job) => {
                  const rep = openReport[job.id]
                  return (
                    <Card key={job.id}>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-semibold text-white">{job.serviceLabel}</p>
                        <span className="text-sm font-semibold text-slate-300">{formatUsd(job.totalCents)}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{job.reference} · {cleaningStatusLabel(job.status)} · {job.scheduledDate || ''}</p>

                      {job.status === 'completed' && (
                        <button onClick={() => toggleReport(job)} className="mt-2 text-xs font-semibold text-gold">{rep ? 'Hide report' : 'View completion report'}</button>
                      )}
                      {rep && (
                        <div className="mt-3 border-t border-white/10 pt-3">
                          <p className="text-xs text-slate-400">Checklist {rep.checklist.done}/{rep.checklist.total} completed</p>
                          {rep.photos.length > 0 && (
                            <div className="mt-2 grid grid-cols-4 gap-2">
                              {rep.photos.map((p) => <img key={p.id} src={`/api${p.url}`} alt={p.label} className="aspect-square w-full rounded object-cover" loading="lazy" />)}
                            </div>
                          )}
                        </div>
                      )}

                      {canConvert(job) && (
                        <div className="mt-3 rounded-md border border-gold/25 bg-gold/[.06] p-3">
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-white"><Sparkles size={14} className="text-gold" /> Want us to keep it this way?</p>
                          <p className="mt-1 text-xs text-slate-400">Save more when we keep it clean. Pick a cadence and we handle the rest.</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(['weekly', 'biweekly', 'monthly'] as RecurringFrequency[]).map((f) => (
                              <button key={f} onClick={() => convert(job, f)} className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-gold/55 hover:text-gold">{frequencyLabel(f)}</button>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
