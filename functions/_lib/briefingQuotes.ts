import { quotes as localQuotes, quoteFromSeed, type Quote as LocalQuote } from '../../src/data/quotes'

const QUOTABLE_BASE = 'https://api.quotable.io'
const POOL_CACHE_KEY_PREFIX = 'briefing-quote-pool:'
const POOL_TTL_SECONDS = 86_400

export type BriefingQuote = {
  text: string
  author: string
  theme: string
  prompt?: string
  source: 'quotable' | 'local'
}

type QuotableResponse = {
  content?: string
  author?: string
  tags?: string[]
}

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

function mapQuotable(item: QuotableResponse): BriefingQuote | null {
  const text = typeof item.content === 'string' ? item.content.trim() : ''
  const author = typeof item.author === 'string' ? item.author.trim() : ''
  if (!text || !author) return null
  const theme = Array.isArray(item.tags) && item.tags.length ? item.tags[0] : 'wisdom'
  return {
    text,
    author,
    theme,
    source: 'quotable',
  }
}

async function fetchQuotablePool(): Promise<BriefingQuote[]> {
  const url = `${QUOTABLE_BASE}/quotes/random?limit=24&tags=business|wisdom|success|inspirational|motivational`
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`quotable ${res.status}`)
  const payload = await res.json() as QuotableResponse[] | QuotableResponse
  const rows = Array.isArray(payload) ? payload : [payload]
  const mapped = rows.map(mapQuotable).filter((item): item is BriefingQuote => !!item)
  if (!mapped.length) throw new Error('quotable returned no quotes')
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

  try {
    const fresh = await fetchQuotablePool()
    try {
      await env.SESSIONS.put(cacheKey, JSON.stringify(fresh), { expirationTtl: POOL_TTL_SECONDS })
    } catch {
      // Cache write failure is non-fatal.
    }
    return fresh
  } catch {
    return localQuotes.map(localToBriefing)
  }
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
