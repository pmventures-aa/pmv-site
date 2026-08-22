import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Env } from '../functions/_lib/types'
import { providerCalendarFeedPublic } from '../functions/_lib/routes/providerCalendarFeed'

// The feed URL is the whole credential: no login sits in front of it, because
// a calendar client cannot log in. It carries client names and site addresses,
// so the tests below are mostly about it being unguessable, unindexable,
// uncacheable, and revocable.

const REAL_TOKEN = 'a'.repeat(64)

let feeds: Array<{ vendor_user_id: string; token: string }> = []
let events: Array<Record<string, unknown>> = []

function env(): Env {
  const prepare = (sql: string) => {
    const s = sql.trim().toLowerCase().replace(/\s+/g, ' ')
    let bound: unknown[] = []
    const api = {
      bind(...a: unknown[]) { bound = a; return api },
      async first<T>() {
        if (s.includes('from provider_calendar_feeds where token')) {
          return (feeds.find((f) => f.token === bound[0]) ?? null) as T | null
        }
        throw new Error(`unhandled first: ${sql}`)
      },
      async all<T>() {
        if (s.includes('from calendar_events')) {
          return { results: events.filter((e) => e.vendor_user_id === bound[0]) as T[] }
        }
        throw new Error(`unhandled all: ${sql}`)
      },
    }
    return api
  }
  return { DB: { prepare } } as unknown as Env
}

async function fetchFeed(token: string) {
  return providerCalendarFeedPublic.fetch(new Request(`http://x/calendar/provider/${token}`), env())
}

function reset() {
  feeds = [{ vendor_user_id: 'vendor-1', token: REAL_TOKEN }]
  events = [{
    vendor_user_id: 'vendor-1', id: 'evt-1', title: 'Estate signing',
    starts_at: '2026-09-01T14:00:00.000Z', ends_at: '2026-09-01T15:00:00.000Z',
    address: '100 Main St', location_name: 'Client home',
    description: 'Two deeds', status: 'confirmed',
  }]
}

describe('a valid token returns a calendar', () => {
  it('serves text/calendar with the assignment in it', async () => {
    reset()
    const res = await fetchFeed(`${REAL_TOKEN}.ics`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/calendar')
    const body = await res.text()
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).toContain('Estate signing')
    // RFC 5545 escapes commas in text values, so the raw comma must NOT
    // survive: an unescaped one would split the property and corrupt the feed.
    expect(body).toContain('Client home\\, 100 Main St')
    expect(body).toContain('END:VCALENDAR')
  })

  it('works with or without the .ics suffix, since clients differ', async () => {
    reset()
    expect((await fetchFeed(REAL_TOKEN)).status).toBe(200)
    expect((await fetchFeed(`${REAL_TOKEN}.ics`)).status).toBe(200)
  })
})

// The URL is a credential. Anything that keeps or advertises a copy is a leak.
describe('the response refuses to be kept or indexed', () => {
  it('sets no-store and noindex', async () => {
    reset()
    const res = await fetchFeed(REAL_TOKEN)
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
  })
})

describe('a bad token gives nothing away', () => {
  it('404s a short guess without touching the database', async () => {
    reset()
    const res = await fetchFeed('short')
    expect(res.status).toBe(404)
  })

  // A rotated token and a token that never existed must be indistinguishable,
  // or the 404 becomes an oracle for which providers exist.
  it('404s a well-formed but unknown token the same way', async () => {
    reset()
    const res = await fetchFeed('b'.repeat(64))
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Not found')
  })

  it('stops working the moment the token is rotated', async () => {
    reset()
    expect((await fetchFeed(REAL_TOKEN)).status).toBe(200)
    feeds = [{ vendor_user_id: 'vendor-1', token: 'c'.repeat(64) }]
    expect((await fetchFeed(REAL_TOKEN)).status).toBe(404)
  })
})

describe('the feed only ever shows one provider their own work', () => {
  it('never leaks another provider events', async () => {
    reset()
    events.push({
      vendor_user_id: 'vendor-2', id: 'evt-2', title: 'Someone else job',
      starts_at: '2026-09-01T14:00:00.000Z', ends_at: null,
      address: null, location_name: null, description: null, status: 'confirmed',
    })
    const body = await (await fetchFeed(REAL_TOKEN)).text()
    expect(body).toContain('Estate signing')
    expect(body).not.toContain('Someone else job')
  })

  it('survives an event with no end time', async () => {
    reset()
    events = [{
      vendor_user_id: 'vendor-1', id: 'evt-3', title: 'Open ended',
      starts_at: '2026-09-01T14:00:00.000Z', ends_at: null,
      address: null, location_name: null, description: null, status: 'confirmed',
    }]
    const res = await fetchFeed(REAL_TOKEN)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Open ended')
  })
})

describe('the route and the surface', () => {
  const routes = readFileSync(new URL('../functions/_lib/routes/providerCalendarFeed.ts', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../src/pages/admin/ProviderAvailability.tsx', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../functions/api/[[route]].ts', import.meta.url), 'utf8')

  it('uses 32 bytes of randomness, not something derived from the user id', () => {
    expect(routes).toContain('new Uint8Array(32)')
    expect(routes).toContain('crypto.getRandomValues')
  })

  it('only ever hands a provider their own url', () => {
    expect(routes).toContain('await ensureToken(c.env, user.id)')
    expect(routes).not.toContain('req.param(\'vendorUserId\')')
  })

  it('mounts the public feed outside the admin gate', () => {
    expect(api).toContain("app.route('/', providerCalendarFeedPublic)")
  })

  it('tells the provider the link is a credential and how to revoke it', () => {
    expect(page).toContain('Treat it like a password')
    expect(page).toContain('Create a new link')
  })

  it('repeats that we still do not read their calendar', () => {
    expect(page).toContain('we still never read your calendar')
  })
})

describe('the migration stays re-runnable', () => {
  const sql = readFileSync(new URL('../migrations/0102_provider_calendar_feeds.sql', import.meta.url), 'utf8')
  const body = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')

  it('creates the table and index guarded, with no ALTER', () => {
    expect(body).toContain('CREATE TABLE IF NOT EXISTS provider_calendar_feeds')
    expect(body).toContain('CREATE INDEX IF NOT EXISTS idx_provider_calendar_feeds_token')
    expect(body).not.toMatch(/\bALTER\s+TABLE\b/i)
  })

  it('keeps one feed per provider and a unique token', () => {
    expect(body).toMatch(/vendor_user_id TEXT PRIMARY KEY/i)
    expect(body).toMatch(/token\s+TEXT NOT NULL UNIQUE/i)
  })
})
