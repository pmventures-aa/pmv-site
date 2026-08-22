import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CheckCircle2, Clock, FileText, Loader2, LogOut, MessageSquareReply, ShieldCheck, UserRound } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth, isApiError } from '../../lib/auth'
import { Crest } from '../../components/ui'
import {
  REVIEW_PROGRESS,
  REVIEW_STAGES,
  reviewProgress,
  reviewStageMeta,
  type FollowUpRequest,
  type ReviewStage,
} from '../../../shared/providerJourney'

interface ReviewProfile { displayName: string | null; fullName: string | null; email: string; phone: string | null }
interface ReviewData {
  stage: ReviewStage
  networkStatus: string
  vendorCategory: string | null
  profileComplete: boolean
  profile: ReviewProfile
  followUps: FollowUpRequest[]
}

const pmvGentle = { type: 'spring', stiffness: 190, damping: 26, mass: 0.9 } as const

export default function UnderReviewShell() {
  const { user, logout } = useAuth()
  const reduce = useReducedMotion()
  const [data, setData] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get<ReviewData>('/portal/self/review')
      setData(res)
      setError(null)
    } catch (err) {
      setError(isApiError(err) ? err.message : 'We could not load your review status.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const firstName = useMemo(() => {
    const source = data?.profile.fullName || user?.full_name || user?.first_name || ''
    return source.trim().split(/\s+/)[0] || 'there'
  }, [data, user])

  return (
    <div className="min-h-screen bg-navy-radial text-slate-200">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#06111f]/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <Crest size={34} />
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight text-white">Pinnacle Management Ventures</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-gold/80">Provider Network</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-white/25 hover:text-white"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-20 pt-8 sm:pt-10">
        {loading ? (
          <div className="grid min-h-[40vh] place-items-center text-slate-400">
            <span className="inline-flex items-center gap-2 text-sm"><Loader2 className="animate-spin" size={18} /> Loading your review…</span>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-200">
            {error} <button onClick={load} className="ml-1 font-semibold underline underline-offset-4">Retry</button>
          </div>
        ) : data ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={pmvGentle}
            className="space-y-7"
          >
            <Hero firstName={firstName} stage={data.stage} vendorCategory={data.vendorCategory} />
            <StatusTracker stage={data.stage} />
            {!data.profileComplete && data.stage !== 'declined' && (
              <ProfileCard profile={data.profile} onSaved={load} />
            )}
            <FollowUps items={data.followUps} onAnswered={load} />
          </motion.div>
        ) : null}
      </main>
    </div>
  )
}

function Hero({ firstName, stage, vendorCategory }: { firstName: string; stage: ReviewStage; vendorCategory: string | null }) {
  const declined = stage === 'declined'
  const approved = stage === 'approved'
  const meta = reviewStageMeta(stage)
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[.025] p-6 sm:p-7">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/85">
        {declined ? 'Application decision' : approved ? 'Welcome aboard' : 'Application in review'}
      </p>
      <h1 className="mt-2 text-2xl font-bold text-white sm:text-[1.7rem]">
        {declined ? `Thank you, ${firstName}.` : approved ? `You're approved, ${firstName}!` : `Thanks, ${firstName}. We've got your application.`}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
        {declined
          ? 'After review, we are not moving forward with your application at this time. If you believe this was in error, reply to your Pinnacle contact.'
          : approved
            ? 'Your workspace is unlocking now. Refresh in a moment if everything is not yet visible.'
            : meta.blurb}
      </p>
      {vendorCategory && !declined && (
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[.03] px-3 py-1 text-xs text-slate-300">
          <ShieldCheck size={13} className="text-gold" /> Applying as {vendorCategory}
        </span>
      )}
    </section>
  )
}

function StatusTracker({ stage }: { stage: ReviewStage }) {
  const declined = stage === 'declined'
  const pct = Math.round(reviewProgress(stage) * 100)
  const currentIndex = REVIEW_PROGRESS.indexOf(stage)
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[.025] p-6 sm:p-7">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-200">Where we are</h2>
        {!declined && <span className="text-xs text-slate-400">{pct}% complete</span>}
      </div>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
        <motion.div
          className={`h-full rounded-full ${declined ? 'bg-red-400/70' : 'bg-gold'}`}
          initial={{ width: 0 }}
          animate={{ width: declined ? '100%' : `${pct}%` }}
          transition={pmvGentle}
        />
      </div>

      {declined ? (
        <p className="mt-5 text-sm text-red-200">This application was declined.</p>
      ) : (
        <ol className="mt-6 space-y-4">
          {REVIEW_STAGES.map((s, i) => {
            const state: 'done' | 'active' | 'todo' = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'todo'
            return (
              <li key={s.key} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] ${
                    state === 'done'
                      ? 'border-gold/50 bg-gold/15 text-gold'
                      : state === 'active'
                        ? 'border-gold bg-gold/20 text-gold'
                        : 'border-white/12 bg-white/[.03] text-slate-500'
                  }`}
                >
                  {state === 'done' ? <CheckCircle2 size={14} /> : state === 'active' ? <Clock size={13} /> : i + 1}
                </span>
                <div>
                  <p className={`text-sm font-semibold ${state === 'todo' ? 'text-slate-500' : 'text-white'}`}>{s.label}</p>
                  {state === 'active' && <p className="mt-0.5 text-xs leading-5 text-slate-400">{s.blurb}</p>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function ProfileCard({ profile, onSaved }: { profile: ReviewProfile; onSaved: () => Promise<void> }) {
  const [fullName, setFullName] = useState(profile.fullName || '')
  const [displayName, setDisplayName] = useState(profile.displayName || '')
  const [phone, setPhone] = useState(profile.phone || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      await api.post('/portal/self/profile', { fullName, displayName, phone })
      await onSaved()
    } catch (error) {
      setErr(isApiError(error) ? error.message : 'We could not save your details.')
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full rounded-lg border border-white/12 bg-white/[.04] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-gold/50 focus:outline-none'

  return (
    <section className="rounded-2xl border border-gold/25 bg-gold/[.04] p-6 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gold/25 bg-gold/[.08] text-gold"><UserRound size={17} /></span>
        <div className="flex-1">
          <h2 className="text-base font-bold text-white">Confirm your details</h2>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            This helps us finish your review faster. It takes under a minute.
          </p>
        </div>
      </div>

      <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-300">Full legal name</span>
          <input className={field} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jordan A. Rivera" required />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-300">Display name</span>
          <input className={field} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How you'd like to appear" required />
        </label>
        <label className="block sm:col-span-2 sm:max-w-xs">
          <span className="mb-1.5 block text-xs font-semibold text-slate-300">Phone</span>
          <input className={field} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" required />
        </label>
        <label className="block sm:col-span-2 sm:max-w-xs">
          <span className="mb-1.5 block text-xs font-semibold text-slate-300">Email</span>
          <input className={`${field} opacity-60`} value={profile.email} disabled />
        </label>
        {err && <p className="text-xs text-red-300 sm:col-span-2">{err}</p>}
        <div className="sm:col-span-2">
          <button type="submit" disabled={busy} className="btn-gold min-h-11 px-6 text-sm disabled:opacity-60">
            {busy ? 'Saving…' : 'Save my details'}
          </button>
        </div>
      </form>
    </section>
  )
}

function FollowUps({ items, onAnswered }: { items: FollowUpRequest[]; onAnswered: () => Promise<void> }) {
  const open = items.filter((f) => f.status !== 'resolved')
  if (open.length === 0) return null
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-200">Action needed</h2>
      <AnimatePresence initial={false}>
        {open.map((f) => (
          <motion.div
            key={f.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={pmvGentle}
          >
            <FollowUpCard item={f} onAnswered={onAnswered} />
          </motion.div>
        ))}
      </AnimatePresence>
    </section>
  )
}

function FollowUpCard({ item, onAnswered }: { item: FollowUpRequest; onAnswered: () => Promise<void> }) {
  const [response, setResponse] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const answered = item.status === 'answered'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      await api.post(`/portal/self/follow-ups/${item.id}/respond`, { response })
      await onAnswered()
    } catch (error) {
      setErr(isApiError(error) ? error.message : 'We could not send your response.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-amber-300/25 bg-amber-400/[.05] p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-amber-300/25 bg-amber-400/[.08] text-amber-300">
          {item.kind === 'document' ? <FileText size={15} /> : <MessageSquareReply size={15} />}
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">{item.title}</p>
          {item.body && <p className="mt-1 text-xs leading-5 text-slate-300">{item.body}</p>}
        </div>
      </div>

      {answered ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[.03] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/90">Response sent</p>
          {item.responseText && <p className="mt-1 text-xs leading-5 text-slate-300">{item.responseText}</p>}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3">
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={3}
            required
            placeholder="Type your response…"
            className="w-full rounded-lg border border-white/12 bg-white/[.04] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-gold/50 focus:outline-none"
          />
          {err && <p className="mt-1.5 text-xs text-red-300">{err}</p>}
          <button type="submit" disabled={busy || !response.trim()} className="btn-gold mt-2.5 min-h-10 px-5 text-sm disabled:opacity-60">
            {busy ? 'Sending…' : 'Send response'}
          </button>
        </form>
      )}
    </div>
  )
}

