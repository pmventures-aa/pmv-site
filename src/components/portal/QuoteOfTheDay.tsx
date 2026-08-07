import { useState } from 'react'
import { quotes, quoteOfTheDay } from '../../data/quotes'

// A soft, relaxing "front door" panel for the portal dashboard — the
// day's quote by default (same for everyone, changes at midnight), with a
// "Show me another" escape hatch for anyone who wants a different one on
// the spot. Deliberately styled apart from the rest of the portal's
// utilitarian cards: a warm gradient wash and the serif display face
// (used elsewhere only on the public marketing site) to read as a small
// moment of calm, not another data panel.
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
      <p className="eyebrow">{quote.tone === 'funny' ? 'A little levity' : 'Quote of the day'}</p>
      <blockquote className="mt-3 font-display text-xl italic leading-relaxed text-white sm:text-2xl">“{quote.text}”</blockquote>
      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-400">— {quote.author}</p>
        <button onClick={another} className="shrink-0 text-xs font-medium text-gold hover:underline">
          Show me another
        </button>
      </div>
    </div>
  )
}
