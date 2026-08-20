import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAppPath } from '../../lib/basePath'

// Per-service / per-job progress for the client home. Each active service or
// job the client has gets its own small ring showing how far along it is, so
// the portal reads as living work moving forward rather than a static list.
// Progress is derived from each item's client-safe status/stage - no new
// backend. "Journeys are at the core": every job is a little journey.

export interface JobProgress {
  id: string
  label: string
  status: string
  to: string
}

// Map a client-safe status/stage to a completion percentage. Ordered stages so
// a job visibly advances: requested -> in progress -> review -> complete.
export function statusToPercent(status: string): number {
  const s = (status || '').toLowerCase().replace(/\s+/g, '_')
  if (['done', 'completed', 'complete', 'closed', 'filed', 'approved', 'active', 'paid', 'confirmed'].includes(s)) return 100
  if (['review', 'under_review', 'proposed', 'quoted', 'signing', 'awaiting_signature'].includes(s)) return 80
  if (['in_progress', 'scheduled', 'assigned', 'dispatched', 'working'].includes(s)) return 55
  if (['open', 'requested', 'pending', 'new', 'not_started', 'draft', 'submitted'].includes(s)) return 20
  return 40
}

function prettyStatus(status: string): string {
  return (status || 'In progress').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function Ring({ value, size = 54, stroke = 6 }: { value: number; size?: number; stroke?: number }) {
  const reduce = useReducedMotion()
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.max(0, Math.min(100, value)) / 100)
  const done = value >= 100
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={done ? '#34d399' : '#c9a227'} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: reduce ? offset : circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: reduce ? 0 : 0.9, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-xs font-semibold text-white tabular-nums">{Math.round(value)}%</span>
      </div>
    </div>
  )
}

export function JourneyProgress({ jobs, startTo, className = '' }: { jobs: JobProgress[]; startTo: string; className?: string }) {
  const p = useAppPath()

  return (
    <section className={`overflow-hidden rounded-xl border border-white/10 bg-white/[.025] px-5 py-4 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-gold/80">Your Pinnacle journey</p>
          <h2 className="mt-0.5 font-display text-lg font-medium text-white">Where your work stands</h2>
        </div>
        <Link to={p(startTo)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold hover:underline">
          Start something new <ArrowRight size={13} />
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-white/12 px-4 py-5 text-center">
          <p className="text-sm text-slate-300">No active services yet.</p>
          <p className="mt-1 text-xs text-slate-500">Each service you start shows its own progress here as Pinnacle moves it forward.</p>
          <Link to={p(startTo)} className="btn-gold mt-3 inline-flex !px-4 !py-2 text-xs">Start a service</Link>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {jobs.map((job) => {
            const pct = statusToPercent(job.status)
            return (
              <li key={job.id}>
                <Link to={p(job.to)} className="flex items-center gap-3 rounded-lg border border-white/[.08] bg-white/[.015] px-3 py-2.5 transition hover:border-gold/30 hover:bg-white/[.03]">
                  <Ring value={pct} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white" title={job.label}>{job.label}</p>
                    <p className={`mt-0.5 text-xs ${pct >= 100 ? 'text-emerald-300' : 'text-slate-400'}`}>{pct >= 100 ? 'Complete' : prettyStatus(job.status)}</p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
