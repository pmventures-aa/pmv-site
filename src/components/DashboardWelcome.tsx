import { useMemo, useState } from 'react'
import { quoteFromSeed, quotes } from '../data/quotes'
import { WELCOME_SESSION_KEY } from '../lib/auth'

function sessionNonce(): string {
  if (typeof window === 'undefined') return 'server'
  let nonce = window.sessionStorage.getItem(WELCOME_SESSION_KEY)
  if (!nonce) {
    nonce = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    window.sessionStorage.setItem(WELCOME_SESSION_KEY, nonce)
  }
  return nonce
}

function timeContext(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return { label: 'Good morning', icon: '☀', tone: 'from-amber-300/20 via-gold/10 to-transparent' }
  if (hour < 18) return { label: 'Good afternoon', icon: '☀', tone: 'from-gold/20 via-amber-100/5 to-transparent' }
  return { label: 'Good evening', icon: '☾', tone: 'from-sky-300/15 via-indigo-300/5 to-transparent' }
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
  const time = useMemo(() => timeContext(), [])
  const displayName = firstName(name)
  const [quote, setQuote] = useState(() => quoteFromSeed(`${userId || displayName}:${sessionNonce()}`))

  function anotherQuote() {
    let next = quote
    while (next === quote && quotes.length > 1) next = quotes[Math.floor(Math.random() * quotes.length)]
    setQuote(next)
  }

  const rounded = variant === 'portal' ? 'rounded-2xl' : 'rounded-md'

  return (
    <section
      className={`relative overflow-hidden border border-white/10 bg-navy-900/70 ${rounded} ${className}`}
      aria-label={`Welcome, ${displayName}`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${time.tone}`} />
      <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] lg:items-center lg:gap-8">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 text-2xl shadow-sm" aria-hidden="true">
            {time.icon}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">{time.label}</p>
            <h1 className="mt-1 font-display text-3xl font-medium text-white sm:text-4xl">Welcome, {displayName}!</h1>
            {subtitle && <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">{subtitle}</p>}
          </div>
        </div>

        <div className="border-t border-white/10 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Quote of the day</p>
            <span className="text-[10px] uppercase tracking-wide text-slate-600">{quote.theme}</span>
          </div>
          <blockquote className="mt-2 font-display text-lg italic leading-relaxed text-white sm:text-xl">“{quote.text}”</blockquote>
          <div className="mt-3 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-400">— {quote.author}</p>
            <button type="button" onClick={anotherQuote} className="shrink-0 text-xs font-medium text-gold transition hover:text-gold-300 hover:underline">
              Another quote
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
