import { useState } from 'react'
import { quotes, quoteOfTheDay } from '../../data/quotes'

// Legacy standalone quote panel kept for any secondary portal surface that
// still wants a calendar-day quote. The main dashboards now use the shared
// DashboardWelcome component and rotate their quote per login session.
export function QuoteOfTheDay({ className = '' }: { className?: string }) {
  const [quote, setQuote] = useState(quoteOfTheDay)

  function another() {
    let next = quote
    while (next === quote && quotes.length > 1) {
      next = quotes[Math.floor(Math.random() * quotes.length)]
    }
    setQuote(next)
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-gold/[0.09] via-white/[0.03] to-transparent p-6 ${className}`}
    >
      <p className="eyebrow">Quote of the day · {quote.theme}</p>
      <blockquote className="mt-3 font-display text-xl italic leading-relaxed text-white sm:text-2xl">“{quote.text}”</blockquote>
      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-400">: {quote.author}</p>
        <button onClick={another} className="shrink-0 text-xs font-medium text-gold hover:underline">
          Show me another
        </button>
      </div>
    </div>
  )
}
