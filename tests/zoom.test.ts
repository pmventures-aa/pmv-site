import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_lib/types'
import {
  createZoomMeeting,
  deleteZoomMeeting,
  getZoomToken,
  isZoomConfigured,
  updateZoomMeeting,
} from '../functions/_lib/zoom'

// The Zoom client has two jobs beyond calling the API: never leak the host
// start_url, and never let a Zoom problem become the caller's problem.

interface Call { url: string; init: RequestInit }
let calls: Call[] = []
let responder: (url: string, init: RequestInit) => Response

function env(overrides: Partial<Env> = {}, kv = new Map<string, string>()): Env {
  return {
    ZOOM_ACCOUNT_ID: 'acct-1',
    ZOOM_CLIENT_ID: 'client-1',
    ZOOM_CLIENT_SECRET: 'secret-1',
    ZOOM_HOST_EMAIL: 'cjenkins@pinnaclemanagementventures.com',
    SESSIONS: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => { kv.set(k, v) },
    },
    ...overrides,
  } as unknown as Env
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const TOKEN_OK = { access_token: 'tok-abc', expires_in: 3600 }
const CREATED = {
  id: 987654321,
  join_url: 'https://zoom.us/j/987654321?pwd=abc',
  // Zoom really does return this. Nothing downstream may ever see it.
  start_url: 'https://zoom.us/s/987654321?zak=SUPER_SECRET_HOST_TOKEN',
  password: '1234',
}

const INPUT = {
  topic: 'Pinnacle consultation: Dana Reyes',
  startsAt: '2026-06-01T13:00:00.000Z',
  durationMinutes: 60,
  timezone: 'America/New_York',
  agenda: 'STR turnover coverage',
}

beforeEach(() => {
  calls = []
  responder = (url) => (url.includes('/oauth/token') ? json(TOKEN_OK) : json(CREATED, 201))
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init })
    return responder(String(url), init)
  }))
})

afterEach(() => { vi.unstubAllGlobals() })

describe('configuration', () => {
  it('is off unless all three credentials are present', () => {
    expect(isZoomConfigured(env())).toBe(true)
    expect(isZoomConfigured(env({ ZOOM_CLIENT_SECRET: undefined }))).toBe(false)
    expect(isZoomConfigured(env({ ZOOM_ACCOUNT_ID: '  ' }))).toBe(false)
  })

  it('never touches the network when unconfigured', async () => {
    const res = await createZoomMeeting(env({ ZOOM_CLIENT_ID: undefined }), INPUT)
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toBe('not_configured')
    expect(calls).toHaveLength(0)
  })
})

describe('token exchange', () => {
  it('requests account credentials with basic auth', async () => {
    const res = await getZoomToken(env())
    expect(res.ok && res.value).toBe('tok-abc')
    expect(calls[0].url).toContain('grant_type=account_credentials')
    expect(calls[0].url).toContain('account_id=acct-1')
    expect(String(calls[0].init.headers && (calls[0].init.headers as Record<string, string>).Authorization))
      .toBe(`Basic ${btoa('client-1:secret-1')}`)
  })

  it('reuses a cached token instead of minting one per booking', async () => {
    const kv = new Map<string, string>()
    await getZoomToken(env({}, kv))
    await getZoomToken(env({}, kv))
    expect(calls.filter((c) => c.url.includes('/oauth/token'))).toHaveLength(1)
  })

  it('reports auth failure with the reason Zoom gave', async () => {
    responder = () => json({ reason: 'Invalid client_id or client_secret' }, 401)
    const res = await getZoomToken(env())
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.reason).toBe('auth_failed')
    expect(res.detail).toContain('401')
    // Withholding the body entirely used to be the rule here, and it left a
    // real failure reading "returned 400" with no way to tell a wrong account
    // id from an app that cannot use this grant at all. The reason is the
    // whole diagnosis and it names no values.
    expect(res.detail).toContain('Invalid client_id or client_secret')
  })

  it('never lets a credential value ride along in the detail', async () => {
    // The words client_id and client_secret are Zoom's vocabulary and are
    // safe. The configured VALUES are the thing that must never reach a log
    // or a settings page, whatever Zoom chose to echo back.
    responder = () => json({ reason: 'Invalid account_id acct-1, client secret-1, id client-1' }, 400)
    const res = await getZoomToken(env())
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.detail).not.toContain('secret-1')
    expect(res.detail).not.toContain('client-1')
    expect(res.detail).not.toContain('acct-1')
    expect(res.detail).toContain('[redacted]')
  })

  it('truncates a body that is trying to be a problem', async () => {
    responder = () => json({ reason: 'x'.repeat(5000) }, 400)
    const res = await getZoomToken(env())
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.detail.length).toBeLessThan(280)
  })

  it('survives a network failure rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connection reset') }))
    const res = await getZoomToken(env())
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toBe('request_failed')
  })
})

describe('creating a meeting', () => {
  it('returns the join url and the meeting id', async () => {
    const res = await createZoomMeeting(env(), INPUT)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.joinUrl).toBe(CREATED.join_url)
    expect(res.value.meetingId).toBe('987654321')
    expect(res.value.password).toBe('1234')
  })

  it('never surfaces the host start url', async () => {
    const res = await createZoomMeeting(env(), INPUT)
    expect(res.ok).toBe(true)
    // Serialize the whole result: nothing anywhere in it may carry the host token.
    const serialized = JSON.stringify(res)
    expect(serialized).not.toContain('SUPER_SECRET_HOST_TOKEN')
    expect(serialized).not.toContain('start_url')
    expect(serialized).not.toContain('zoom.us/s/')
  })

  it('books against the configured host', async () => {
    await createZoomMeeting(env(), INPUT)
    const create = calls.find((c) => c.url.includes('/meetings'))
    expect(create?.url).toContain(encodeURIComponent('cjenkins@pinnaclemanagementventures.com'))
  })

  it('falls back to the credential account when no host is set', async () => {
    await createZoomMeeting(env({ ZOOM_HOST_EMAIL: undefined }), INPUT)
    expect(calls.find((c) => c.url.includes('/meetings'))?.url).toContain('/users/me/meetings')
  })

  it('sends a start time Zoom accepts, with no milliseconds', async () => {
    await createZoomMeeting(env(), INPUT)
    const body = JSON.parse(String(calls.find((c) => c.url.includes('/meetings'))?.init.body))
    expect(body.start_time).toBe('2026-06-01T13:00:00Z')
    expect(body.type).toBe(2)
    expect(body.duration).toBe(60)
    expect(body.timezone).toBe('America/New_York')
  })

  it('turns the waiting room on so a forwarded link is not an open door', async () => {
    await createZoomMeeting(env(), INPUT)
    const body = JSON.parse(String(calls.find((c) => c.url.includes('/meetings'))?.init.body))
    expect(body.settings.waiting_room).toBe(true)
    expect(body.settings.join_before_host).toBe(false)
  })

  it('clamps an absurd duration rather than passing it through', async () => {
    await createZoomMeeting(env(), { ...INPUT, durationMinutes: 99999 })
    const body = JSON.parse(String(calls.find((c) => c.url.includes('/meetings'))?.init.body))
    expect(body.duration).toBe(480)
  })

  it('reports a refusal instead of throwing', async () => {
    responder = (url) => (url.includes('/oauth/token') ? json(TOKEN_OK) : json({ message: 'quota exceeded' }, 429))
    const res = await createZoomMeeting(env(), INPUT)
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.reason).toBe('request_failed')
  })

  it('reports a malformed success response instead of returning a bad link', async () => {
    responder = (url) => (url.includes('/oauth/token') ? json(TOKEN_OK) : json({ id: 1 }, 201))
    const res = await createZoomMeeting(env(), INPUT)
    expect(res.ok).toBe(false)
  })
})

describe('updating and deleting', () => {
  it('patches the meeting time', async () => {
    responder = (url) => (url.includes('/oauth/token') ? json(TOKEN_OK) : new Response(null, { status: 204 }))
    const res = await updateZoomMeeting(env(), '987654321', {
      startsAt: '2026-06-02T14:00:00.000Z', durationMinutes: 30, timezone: 'America/New_York',
    })
    expect(res.ok).toBe(true)
    const patch = calls.find((c) => c.init.method === 'PATCH')
    expect(JSON.parse(String(patch?.init.body)).start_time).toBe('2026-06-02T14:00:00Z')
  })

  it('treats an already-deleted meeting as deleted', async () => {
    responder = (url) => (url.includes('/oauth/token') ? json(TOKEN_OK) : new Response(null, { status: 404 }))
    expect((await deleteZoomMeeting(env(), 'gone')).ok).toBe(true)
    expect((await updateZoomMeeting(env(), 'gone', {
      startsAt: INPUT.startsAt, durationMinutes: 60, timezone: 'UTC',
    })).ok).toBe(true)
  })

  it('reports a real delete failure', async () => {
    responder = (url) => (url.includes('/oauth/token') ? json(TOKEN_OK) : new Response(null, { status: 500 }))
    const res = await deleteZoomMeeting(env(), '987654321')
    expect(res.ok).toBe(false)
  })
})
