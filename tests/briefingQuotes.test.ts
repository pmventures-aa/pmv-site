import { describe, it, expect, afterEach, vi } from 'vitest'
import { getAnotherBriefingQuote, getBriefingQuote } from '../functions/_lib/briefingQuotes'

function makeEnv() {
  const store = new Map<string, string>()
  return {
    SESSIONS: {
      async get(key: string, type?: string) {
        const raw = store.get(key)
        if (raw == null) return null
        if (type === 'json') return JSON.parse(raw)
        return raw
      },
      async put(key: string, value: string) { store.set(key, value) },
    } as any,
  }
}

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('briefing quotes upstream', () => {
  it('uses ZenQuotes as the primary source', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      if (String(url).includes('zenquotes.io')) {
        return new Response(JSON.stringify([
          { q: 'The best way to predict the future is to invent it.', a: 'Alan Kay' },
          { q: 'Simplicity is the soul of efficiency.', a: 'Austin Freeman' },
        ]), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response('', { status: 500 })
    }) as any
    const env = makeEnv()
    const q = await getBriefingQuote(env, 'seed-abc')
    expect(q.text.length).toBeGreaterThan(0)
    expect(q.source).toBe('zenquotes')
    expect(['Alan Kay', 'Austin Freeman']).toContain(q.author)
  })

  it('falls back to DummyJSON when ZenQuotes is unreachable', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      if (String(url).includes('zenquotes.io')) return new Response('', { status: 502 })
      if (String(url).includes('dummyjson.com')) {
        return new Response(JSON.stringify({
          quotes: [
            { quote: 'Do not confuse motion with progress.', author: 'Ancient Proverb' },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response('', { status: 500 })
    }) as any
    const env = makeEnv()
    const q = await getBriefingQuote(env, 'seed-xyz')
    expect(q.source).toBe('dummyjson')
    expect(q.author).toBe('Ancient Proverb')
  })

  it('falls back to the local Pinnacle library when every upstream fails', async () => {
    globalThis.fetch = vi.fn(async () => new Response('', { status: 502 })) as any
    const env = makeEnv()
    const q = await getBriefingQuote(env, 'seed-local')
    expect(q.source).toBe('local')
    expect(q.text.length).toBeGreaterThan(0)
  })

  it('caches the pool in KV so subsequent requests do not refetch', async () => {
    let calls = 0
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      calls += 1
      if (String(url).includes('zenquotes.io')) {
        return new Response(JSON.stringify([{ q: 'Cached quote.', a: 'Cache Master' }]), { status: 200 })
      }
      return new Response('', { status: 500 })
    }) as any
    const env = makeEnv()
    const a = await getBriefingQuote(env, 'x')
    const b = await getAnotherBriefingQuote(env, a.text, 'x')
    expect(calls).toBe(1) // second call served from KV
    expect(b.text).toBe('Cached quote.') // pool of one, so we get the same one
    expect(a.source).toBe('zenquotes')
  })
})
