import { RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { quoteFromSeed } from '../data/quotes'
import { WELCOME_SESSION_KEY } from '../lib/auth'
import { fetchAnotherBriefingQuote, fetchBriefingQuote } from '../lib/briefingQuote'
import { welcomeTime } from '../lib/welcomeSky'
import { SkyMark } from './welcome/SkyMark'

function sessionNonce(): string {
  if (typeof window === 'undefined') return 'server'
  let nonce = window.sessionStorage.getItem(WELCOME_SESSION_KEY)
  if (!nonce) {
    nonce = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    window.sessionStorage.setItem(WELCOME_SESSION_KEY, nonce)
  }
  return nonce
}

function firstName(name?: string | null, fallback = 'there') {
  const clean = (name || '').trim()
  return clean ? clean.split(/\s+/)[0] : fallback
}

export function DashboardWelcome({
  name,
  userId,
  subtitle,
  variant = 'admin',
  className = '',
}: {
  name?: string | null
  userId?: string | null
  subtitle?: string
  variant?: 'admin' | 'portal'
  className?: string
}) {
  const time = useMemo(() => welcomeTime(), [])
  const displayName = firstName(name)
  const dateLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    [],
  )
  const [quote, setQuote] = useState(() => quoteFromSeed(`${userId || displayName}:${sessionNonce()}`))
  const quoteSeed = useMemo(() => `${userId || displayName}:${sessionNonce()}`, [userId, displayName])

  useEffect(() => {
    let cancelled = false
    void fetchBriefingQuote(quoteSeed).then((next) => {
      if (!cancelled) setQuote(next)
    })
    return () => { cancelled = true }
  }, [quoteSeed])

  async function anotherQuote() {
    const next = await fetchAnotherBriefingQuote(quoteSeed, quote.text)
    setQuote(next)
  }

  if (variant === 'portal') {
    return (
      <section className={`pmv-welcome relative overflow-hidden rounded-md border border-white/10 bg-navy-950/80 ${className}`} aria-label={`${time.label}, ${displayName}`}>
        <div className={`pointer-events-none absolute inset-0 pmv-welcome-wash pmv-welcome-wash-${time.period}`} />
        <div className="relative flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <SkyMark period={time.period} className="h-10 w-[60px] shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold/80">{time.label} · {dateLabel}</p>
              <h1 className="mt-0.5 font-display text-xl font-medium text-white">{displayName}, welcome in.</h1>
              {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600" title="EAGLE">
                <span className="text-gold/70">E</span>ndeavor <span className="text-gold/70">A</span>lways to <span className="text-gold/70">G</span>row, <span className="text-gold/70">L</span>earn and <span className="text-gold/70">E</span>nhance
              </p>
            </div>
          </div>
          <div className="min-w-0 max-w-md">
            <p className="text-xs leading-5 text-slate-400">
              <span className="text-slate-200">{quote.text}</span>
              <span className="ml-1.5 text-slate-500">{quote.author}</span>
            </p>
            <button type="button" onClick={() => void anotherQuote()} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-gold hover:text-gold-300">
              <RefreshCw size={11} /> Another
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className={`pmv-welcome relative overflow-hidden rounded-xl border border-white/10 bg-navy-950/80 ${className}`} aria-label={`${time.label}, ${displayName}`}>
      <div className={`pointer-events-none absolute inset-0 pmv-welcome-wash pmv-welcome-wash-${time.period}`} />
      <div className="relative grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(280px,.95fr)] xl:items-center xl:gap-10">
        <div className="flex items-center gap-4 sm:gap-5">
          <SkyMark period={time.period} className="h-14 w-[84px] shrink-0 shadow-[0_10px_24px_rgba(0,0,0,.24)] sm:h-[72px] sm:w-[108px] xl:h-[88px] xl:w-[132px]" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold/85">{time.label}</p>
            <h1 className="mt-1.5 font-display text-3xl font-medium tracking-[-.03em] text-white sm:text-[2.15rem]">
              {displayName}, welcome in.
            </h1>
            <p className="mt-1.5 text-xs font-medium text-slate-500">{dateLabel}</p>
            {subtitle && <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">{subtitle}</p>}
            <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">{time.caption}</p>
          </div>
        </div>

        <div className="border-t border-white/10 pt-5 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold/85">Quote of the day</p>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{quote.theme}</span>
          </div>
          <blockquote className="mt-3 font-display text-[1.05rem] font-medium leading-7 text-white sm:text-lg">
            {quote.text}
          </blockquote>
          <p className="mt-2 text-xs font-semibold text-slate-400">{quote.author}</p>
          {quote.prompt && (
            <p className="mt-3 border-l-2 border-gold/35 pl-3 text-xs leading-5 text-slate-400">
              <strong className="font-bold text-slate-200">Today: </strong>{quote.prompt}
            </p>
          )}
          <button type="button" onClick={() => void anotherQuote()} className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-gold transition hover:text-gold-300">
            <RefreshCw size={12} /> Another quote
          </button>
        </div>
      </div>
    </section>
  )
}
