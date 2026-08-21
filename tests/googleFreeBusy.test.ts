import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_lib/types'
import { googleBusySpans, readToken, writeToken } from '../functions/_lib/googleFreeBusy'
import { encryptSensitive } from '../functions/_lib/crypto'

// Blocking a slot needs busy spans, not event sync. These cover the three
// things that decide whether the booking page is trustworthy: the tokens are
// encrypted, only spans are requested, and a Google outage fails OPEN.

const KEY = 'test-payment-encryption-key'
let calls: Array<{ url: string; init: RequestInit }> = []
let responder: () => Response

interface Account {
  id: string
  access_token_enc: string | null
  refresh_token_enc: string | null
  access_token_expires: string | null
  target_calendar_id: string
  status: string
}

function makeEnv(account: Account | null, kv = new Map<string, string>()): Env {
  return {
    PAYMENT_ENCRYPTION_KEY: KEY,
    GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_REDIRECT_URI: 'https://x/cb',
    DB: {
      prepare: () => ({
        bind: () => ({
          first: async () => account,
          run: async () => ({ success: true }),
          all: async () => ({ results: [] }),
        }),
      }),
    },
    SESSIONS: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => { kv.set(k, v) },
    },
  } as unknown as Env
}

const future = () => new Date(Date.now() + 30 * 60_000).toISOString()

async function liveAccount(): Promise<Account> {
  return {
    id: 'acct-1',
    access_token_enc: await encryptSensitive('live-access-token', KEY),
    refresh_token_enc: await encryptSensitive('refresh-token', KEY),
    access_token_expires: future(),
    target_calendar_id: 'primary',
    status: 'active',
  }
}

const busyBody = {
  calendars: { primary: { busy: [{ start: '2026-06-01T15:00:00Z', end: '2026-06-01T16:00:00Z' }] } },
}

beforeEach(() => {
  calls = []
  responder = () => new Response(JSON.stringify(busyBody), { status: 200, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init })
    return responder()
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('token storage', () => {
  it('round-trips through encryption', async () => {
    const env = makeEnv(null)
    const stored = await writeToken(env, 'a-refresh-token')
    expect(stored).not.toBe('a-refresh-token')
    expect(await readToken(env, stored)).toBe('a-refresh-token')
  })

  it('still reads tokens written before encryption existed', async () => {
    // Existing connections must keep working rather than silently breaking.
    expect(await readToken(makeEnv(null), 'plaintext-legacy-token')).toBe('plaintext-legacy-token')
  })

  it('treats an undecryptable token as absent rather than throwing', async () => {
    // Shaped like real ciphertext (16-char base64 IV) but not decryptable.
    // A short prefix is treated as legacy plaintext instead, which is the
    // case the previous assertion accidentally exercised.
    expect(await readToken(makeEnv(null), 'AAAAAAAAAAAAAAAA.QUJDREVGR0g')).toBeNull()
  })

  it('handles a missing token', async () => {
    expect(await readToken(makeEnv(null), null)).toBeNull()
    expect(await writeToken(makeEnv(null), null)).toBeNull()
  })
})

describe('busy spans', () => {
  it('returns the spans Google reports', async () => {
    const spans = await googleBusySpans(await makeEnvWithAccount(), 'user-1', '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z')
    expect(spans).toEqual([{ startsAt: '2026-06-01T15:00:00.000Z', endsAt: '2026-06-01T16:00:00.000Z' }])
  })

  it('asks only for freebusy, never for event contents', async () => {
    await googleBusySpans(await makeEnvWithAccount(), 'user-1', '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z')
    expect(calls[0].url).toContain('/freeBusy')
    expect(calls[0].url).not.toContain('/events')
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.items).toEqual([{ id: 'primary' }])
  })

  it('sends the access token, decrypted', async () => {
    await googleBusySpans(await makeEnvWithAccount(), 'user-1', '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer live-access-token')
  })

  it('caches so a burst of visitors is not a burst of Google calls', async () => {
    const kv = new Map<string, string>()
    const env = makeEnv(await liveAccount(), kv)
    await googleBusySpans(env, 'user-1', '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z')
    await googleBusySpans(env, 'user-1', '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z')
    expect(calls.filter((c) => c.url.includes('/freeBusy'))).toHaveLength(1)
  })
})

describe('failing open', () => {
  // Every one of these must yield an empty list, not an exception and not a
  // "everything is busy" result. Failing closed would render an empty booking
  // page that looks exactly like being fully booked.
  it('when Google returns an error', async () => {
    responder = () => new Response('nope', { status: 500 })
    expect(await googleBusySpans(await makeEnvWithAccount(), 'u', '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z')).toEqual([])
  })

  it('when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connection reset') }))
    expect(await googleBusySpans(await makeEnvWithAccount(), 'u', '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z')).toEqual([])
  })

  it('when no calendar is connected', async () => {
    expect(await googleBusySpans(makeEnv(null), 'u', '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z')).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('when Google OAuth is not configured on the deployment', async () => {
    const env = makeEnv(await liveAccount())
    ;(env as unknown as Record<string, unknown>).GOOGLE_CLIENT_ID = undefined
    expect(await googleBusySpans(env, 'u', '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z')).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('when the response is malformed', async () => {
    responder = () => new Response('{"calendars":{}}', { status: 200, headers: { 'content-type': 'application/json' } })
    expect(await googleBusySpans(await makeEnvWithAccount(), 'u', '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z')).toEqual([])
  })

  it('drops incomplete spans rather than inventing bounds', async () => {
    responder = () => new Response(JSON.stringify({ calendars: { primary: { busy: [{ start: '2026-06-01T15:00:00Z' }] } } }), { status: 200 })
    expect(await googleBusySpans(await makeEnvWithAccount(), 'u', '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z')).toEqual([])
  })
})

async function makeEnvWithAccount(): Promise<Env> {
  return makeEnv(await liveAccount())
}
