import { quotes as localQuotes, quoteFromSeed, type Quote as LocalQuote } from '../../src/data/quotes'

// Live briefing quote source. Quotable.io went dark late 2024, so we now
// call ZenQuotes (https://zenquotes.io/api) which is free, no auth, and
// returns a batch of 50 quotes in one call. We cache that batch in KV for
// 24h so a single fetch serves every user for the day. If ZenQuotes is
// unreachable we fall back to a well-known public dataset (DummyJSON)
// before finally falling back to the local Pinnacle library. The local
// library is only ever seen on total network failure.
const ZEN_BATCH_URL = 'https://zenquotes.io/api/quotes'
const DUMMY_BATCH_URL = 'https://dummyjson.com/quotes?limit=100'
const POOL_CACHE_KEY_PREFIX = 'briefing-quote-pool:'
const POOL_TTL_SECONDS = 86_400

export type BriefingQuote = {
  text: string
  author: string
  theme: string
  prompt?: string
  source: 'zenquotes' | 'dummyjson' | 'local'
}

type ZenQuote = { q?: string; a?: string }
type DummyQuote = { quote?: string; author?: string }

function poolCacheKey(date = new Date()): string {
  return `${POOL_CACHE_KEY_PREFIX}${date.toISOString().slice(0, 10)}`
}

function hashSeed(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function localToBriefing(quote: LocalQuote): BriefingQuote {
  return {
    text: quote.text,
    author: quote.author,
    theme: quote.theme,
    prompt: quote.prompt,
    source: 'local',
  }
}

function mapZen(item: ZenQuote): BriefingQuote | null {
  const text = typeof item.q === 'string' ? item.q.trim() : ''
  const author = typeof item.a === 'string' ? item.a.trim() : ''
  if (!text || !author) return null
  return { text, author, theme: 'wisdom', source: 'zenquotes' }
}

function mapDummy(item: DummyQuote): BriefingQuote | null {
  const text = typeof item.quote === 'string' ? item.quote.trim() : ''
  const author = typeof item.author === 'string' ? item.author.trim() : ''
  if (!text || !author) return null
  return { text, author, theme: 'wisdom', source: 'dummyjson' }
}

async function fetchZenQuotesPool(): Promise<BriefingQuote[]> {
  const res = await fetch(ZEN_BATCH_URL, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`zenquotes ${res.status}`)
  const payload = await res.json() as ZenQuote[]
  const rows = Array.isArray(payload) ? payload : []
  const mapped = rows.map(mapZen).filter((item): item is BriefingQuote => !!item)
  if (!mapped.length) throw new Error('zenquotes returned no quotes')
  return mapped
}

async function fetchDummyJsonPool(): Promise<BriefingQuote[]> {
  const res = await fetch(DUMMY_BATCH_URL, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`dummyjson ${res.status}`)
  const payload = await res.json() as { quotes?: DummyQuote[] }
  const rows = Array.isArray(payload?.quotes) ? payload.quotes : []
  const mapped = rows.map(mapDummy).filter((item): item is BriefingQuote => !!item)
  if (!mapped.length) throw new Error('dummyjson returned no quotes')
  return mapped
}

async function loadQuotePool(env: { SESSIONS: KVNamespace }): Promise<BriefingQuote[]> {
  const cacheKey = poolCacheKey()
  try {
    const cached = await env.SESSIONS.get(cacheKey, 'json') as BriefingQuote[] | null
    if (Array.isArray(cached) && cached.length) return cached
  } catch {
    // KV read issues should not block the endpoint.
  }

  // Preferred source first, then a documented public fallback, then finally
  // the local Pinnacle library. Every successful upstream fetch is cached
  // in KV for 24h so the outbound network cost is one call per day per
  // deployment.
  for (const fetchFn of [fetchZenQuotesPool, fetchDummyJsonPool]) {
    try {
      const fresh = await fetchFn()
      try {
        await env.SESSIONS.put(cacheKey, JSON.stringify(fresh), { expirationTtl: POOL_TTL_SECONDS })
      } catch {}
      return fresh
    } catch (err) {
      console.warn('[briefing-quote] upstream failed', err)
    }
  }
  return localQuotes.map(localToBriefing)
}

export async function getBriefingQuote(env: { SESSIONS: KVNamespace }, seed = ''): Promise<BriefingQuote> {
  const pool = await loadQuotePool(env)
  if (!pool.length) return localToBriefing(quoteFromSeed(seed || String(Date.now())))
  if (!seed.trim()) return pool[hashSeed(String(Date.now())) % pool.length]
  return pool[hashSeed(seed) % pool.length]
}

export async function getAnotherBriefingQuote(
  env: { SESSIONS: KVNamespace },
  currentText: string,
  seed = '',
): Promise<BriefingQuote> {
  const pool = await loadQuotePool(env)
  if (pool.length <= 1) return getBriefingQuote(env, `${seed}:another:${Date.now()}`)
  let next = pool[hashSeed(`${seed}:${currentText}:${Date.now()}`) % pool.length]
  let guard = 0
  while (next.text === currentText && guard < 8) {
    next = pool[Math.floor(Math.random() * pool.length)]
    guard += 1
  }
  return next
}
