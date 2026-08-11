import { RefreshCw, Sparkles } from 'lucide-react'
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
  if (hour < 12) return { label: 'Good Morning', icon: '☀', tone: 'from-amber-300/20 via-gold/10 to-transparent' }
  if (hour < 18) return { label: 'Good Afternoon', icon: '☀', tone: 'from-gold/20 via-amber-100/5 to-transparent' }
  return { label: 'Good Evening', icon: '☾', tone: 'from-sky-300/15 via-indigo-300/5 to-transparent' }
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
  const [quote, setQuote] = useState(() => quoteFromSeed(`${userId || displayName}:${sessionNonce()}:${Date.now()}`))

  function anotherQuote() {
    let next = quote
    while (next === quote && quotes.length > 1) next = quotes[Math.floor(Math.random() * quotes.length)]
    setQuote(next)
  }

  const rounded = variant === 'portal' ? 'rounded-2xl' : 'rounded-xl'

  return (
    <section className={`relative overflow-hidden border border-white/10 bg-navy-900/70 ${rounded} ${className}`} aria-label={`Welcome, ${displayName}`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${time.tone}`} />
      <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.86fr)] lg:items-center lg:gap-8">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-2xl shadow-sm" aria-hidden="true">{time.icon}</div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">{time.label}</p>
            <h1 className="mt-1.5 text-3xl font-extrabold tracking-[-.03em] text-white sm:text-4xl">Welcome, {displayName}</h1>
            {subtitle && <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">{subtitle}</p>}
          </div>
        </div>

        <div className="border-t border-white/10 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div className="flex items-center justify-between gap-4">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-gold"><Sparkles size={12} /> Pinnacle Briefing</p>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{quote.theme}</span>
          </div>
          <blockquote className="mt-3 text-[17px] font-semibold leading-7 text-white sm:text-lg">“{quote.text}”</blockquote>
          <p className="mt-2 text-xs font-semibold text-slate-400">{quote.author}</p>
          {quote.prompt && <p className="mt-3 border-l-2 border-gold/35 pl-3 text-xs leading-5 text-slate-400"><strong className="font-bold text-slate-200">Today:</strong> {quote.prompt}</p>}
          <button type="button" onClick={anotherQuote} className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-gold transition hover:text-gold-300"><RefreshCw size={12} /> New Briefing</button>
        </div>
      </div>
    </section>
  )
}
