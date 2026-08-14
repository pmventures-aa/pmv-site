import { describe, expect, it } from 'vitest'
import { getBriefingQuote } from '../functions/_lib/briefingQuotes'

describe('briefing quotes', () => {
  it('falls back to local quotes when KV is unavailable', async () => {
    const quote = await getBriefingQuote({ SESSIONS: {
      get: async () => null,
      put: async () => undefined,
    } as unknown as KVNamespace }, 'seed-1')
    expect(quote.text.length).toBeGreaterThan(12)
    expect(quote.author.length).toBeGreaterThan(2)
    expect(['quotable', 'local']).toContain(quote.source)
  })
})
