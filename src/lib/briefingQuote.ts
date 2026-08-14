import type { Quote as LocalQuote } from '../data/quotes'
import { quoteFromSeed } from '../data/quotes'

export type BriefingQuote = {
  text: string
  author: string
  theme: string
  prompt?: string
  source?: 'quotable' | 'local'
}

function toLocalQuote(quote: BriefingQuote): LocalQuote {
  return {
    text: quote.text,
    author: quote.author,
    theme: (quote.theme || 'perspective') as LocalQuote['theme'],
    prompt: quote.prompt,
  }
}

export async function fetchBriefingQuote(seed: string): Promise<LocalQuote> {
  try {
    const res = await fetch(`/api/briefing-quote?seed=${encodeURIComponent(seed)}`)
    if (!res.ok) throw new Error('briefing unavailable')
    const data = await res.json() as { quote?: BriefingQuote }
    if (!data.quote?.text) throw new Error('briefing empty')
    return toLocalQuote(data.quote)
  } catch {
    return quoteFromSeed(seed)
  }
}

export async function fetchAnotherBriefingQuote(seed: string, currentText: string): Promise<LocalQuote> {
  try {
    const params = new URLSearchParams({ seed, current: currentText })
    const res = await fetch(`/api/briefing-quote/another?${params.toString()}`)
    if (!res.ok) throw new Error('briefing unavailable')
    const data = await res.json() as { quote?: BriefingQuote }
    if (!data.quote?.text) throw new Error('briefing empty')
    return toLocalQuote(data.quote)
  } catch {
    let next = quoteFromSeed(`${seed}:${Date.now()}`)
    while (next.text === currentText) next = quoteFromSeed(`${seed}:${Math.random()}`)
    return next
  }
}
