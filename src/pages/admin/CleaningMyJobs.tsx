import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { formatUsd } from '../../../shared/cleaningPricing'
import { VENDOR_FIELD_STEPS, cleaningStatusLabel, formatDuration } from '../../../shared/cleaningJobs'

interface VJob {
  id: string
  reference: string
  serviceLabel: string
  county: string
  bedrooms: number
  bathrooms: number
  frequency: string
  status: string
  scheduledDate: string | null
  arrivalWindow: string | null
  payoutCents: number
  mine: boolean
  propertyAddress: string | null
  propertyUnit: string | null
  contactName: string | null
  contactPhone: string | null
  turnover: { urgency: string; minutesRemaining: number | null }
}

const COUNTY_LABEL: Record<string, string> = { miami_dade: 'Miami-Dade', broward: 'Broward', palm_beach: 'Palm Beach' }

export default function CleaningMyJobs() {
  const [mine, setMine] = useState<VJob[]>([])
  const [available, setAvailable] = useState<VJob[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ mine: VJob[]; available: VJob[] }>('/admin/cleaning/my-jobs')
      setMine(res.mine)
      setAvailable(res.available)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load your jobs.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function accept(job: VJob) {
    setBusyId(job.id)
    try {
      await api.post(`/admin/cleaning/my-jobs/${job.id}/accept`, {})
      toast.success('Job accepted.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not accept the job.')
    } finally {
      setBusyId(null)
    }
  }

  async function fieldAction(job: VJob, action: string) {
    setBusyId(job.id)
    // Best-effort location capture; not continuous tracking.
    const withGeo = (extra: Record<string, number> = {}) => api.post(`/admin/cleaning/my-jobs/${job.id}/field`, { action, ...extra })
    try {
      if (navigator.geolocation && (action === 'check_in' || action === 'complete')) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            async (pos) => { await withGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {}); resolve() },
            async () => { await withGeo().catch(() => {}); resolve() },
            { timeout: 6000 },
          )
        })
      } else {
        await withGeo()
      }
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the job.')
    } finally {
      setBusyId(null)
    }
  }

  function nextStep(status: string) {
    return VENDOR_FIELD_STEPS.find((s) => s.from === status) || null
  }

  const earnings = mine.filter((j) => j.status === 'completed').reduce((sum, j) => sum + j.payoutCents, 0)

  return (
    <div className="space-y-6">
      <PageIntro kicker="Cleaning" title="My Cleaning Jobs" subtitle="Accept work, follow the property steps, and complete each job from your phone." />

      {loading ? (
        <Panel><p className="text-sm text-slate-400">Loading…</p></Panel>
      ) : (
        <>
          {available.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Available near you</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {available.map((job) => (
                  <div key={job.id} className="rounded-lg border border-white/10 bg-navy-900/55 p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-semibold text-white">{job.serviceLabel}</p>
                      <span className="text-sm font-bold text-gold">{formatUsd(job.payoutCents)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{COUNTY_LABEL[job.county] || job.county} · {job.bedrooms}BR / {job.bathrooms}BA</p>
                    <p className="mt-1 text-xs text-slate-400">{job.scheduledDate || 'Flexible date'}{job.arrivalWindow ? ` · ${job.arrivalWindow}` : ''}</p>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => accept(job)} disabled={busyId === job.id} className="flex-1 rounded-md bg-gold px-3 py-2 text-sm font-semibold text-navy-950 disabled:opacity-60">Accept</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">My jobs</h2>
              {earnings > 0 && <span className="text-xs text-slate-400">Completed payout: <span className="font-semibold text-emerald-300">{formatUsd(earnings)}</span></span>}
            </div>
            {mine.length === 0 ? (
              <EmptyState label="No assigned jobs yet. Accept an available job above to get started." />
            ) : (
              <div className="grid gap-3">
                {mine.map((job) => {
                  const step = nextStep(job.status)
                  return (
                    <div key={job.id} className="rounded-lg border border-white/10 bg-navy-900/55 p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-semibold text-white">{job.serviceLabel}</p>
                        <span className="text-sm font-bold text-gold">{formatUsd(job.payoutCents)}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{job.reference} · {cleaningStatusLabel(job.status)}</p>
                      {job.propertyAddress && (
                        <p className="mt-2 text-sm text-slate-200">{job.propertyAddress}{job.propertyUnit ? `, ${job.propertyUnit}` : ''}</p>
                      )}
                      <p className="mt-1 text-xs text-slate-400">{job.scheduledDate || 'Flexible'}{job.arrivalWindow ? ` · ${job.arrivalWindow}` : ''}</p>
                      {job.turnover.urgency !== 'none' && job.turnover.minutesRemaining != null && (
                        <p className={`mt-1 text-xs font-semibold ${job.turnover.urgency === 'late' || job.turnover.urgency === 'at_risk' ? 'text-rose-300' : 'text-amber-300'}`}>
                          {job.turnover.minutesRemaining < 0 ? 'Turnover late' : `${formatDuration(job.turnover.minutesRemaining)} to next check-in`}
                        </p>
                      )}
                      {job.contactPhone && <a href={`tel:${job.contactPhone}`} className="mt-2 inline-block text-xs font-semibold text-gold">Call contact</a>}
                      {step && (
                        <button onClick={() => fieldAction(job, step.action)} disabled={busyId === job.id} className="mt-3 w-full rounded-md bg-gold px-3 py-2.5 text-sm font-semibold text-navy-950 disabled:opacity-60">
                          {busyId === job.id ? 'Working…' : step.label}
                        </button>
                      )}
                      {job.status === 'completed' && <p className="mt-3 rounded-md bg-emerald-500/12 px-3 py-2 text-center text-sm font-semibold text-emerald-300">Completed</p>}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
