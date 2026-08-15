import { RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { quoteOfTheDay } from '../../data/quotes'
import { fetchAnotherBriefingQuote, fetchBriefingQuote } from '../../lib/briefingQuote'

// Secondary briefing panel for portal surfaces that do not use DashboardWelcome.
export function QuoteOfTheDay({ className = '' }: { className?: string }) {
  const [quote, setQuote] = useState(quoteOfTheDay)

  useEffect(() => {
    let cancelled = false
    void fetchBriefingQuote(`portal:${new Date().toISOString().slice(0, 10)}`).then((next) => {
      if (!cancelled) setQuote(next)
    })
    return () => { cancelled = true }
  }, [])

  async function another() {
    const next = await fetchAnotherBriefingQuote('portal', quote.text)
    setQuote(next)
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-gold/[0.09] via-white/[0.03] to-transparent p-6 ${className}`}>
      <div className="flex items-center justify-between gap-4">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.18em] text-gold"><Sparkles size={12} /> Quote of the day</p>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{quote.theme}</span>
      </div>
      <blockquote className="mt-3 text-lg font-semibold leading-7 text-white sm:text-xl">“{quote.text}”</blockquote>
      <p className="mt-2 text-xs font-semibold text-slate-400">{quote.author}</p>
      {quote.prompt && <p className="mt-4 border-l-2 border-gold/35 pl-3 text-xs leading-5 text-slate-400"><strong className="font-bold text-slate-200">Today:</strong> {quote.prompt}</p>}
        <button type="button" onClick={() => void another()} className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-gold transition hover:text-gold-300"><RefreshCw size={12} /> Another quote</button>
    </div>
  )
}
