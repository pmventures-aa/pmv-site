import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_lib/types'

// Email and audit are best-effort side channels; stub them so the D1 mock only
// has to model the booking tables.
const sent: Array<{ to: string; subject: string; text: string }> = []
const staffNotices: Array<{ kind: string; subject: string; html: string }> = []
vi.mock('../functions/_lib/email', () => ({
  escapeHtml: (s: string) => s,
  sendEmail: vi.fn(async (_env: Env, o: { to: string; subject: string; text?: string }) => {
    sent.push({ to: o.to, subject: o.subject, text: o.text ?? '' })
  }),
  notifyStaff: vi.fn(async (_env: Env, o: { kind: string; subject: string; html: string }) => {
    staffNotices.push({ kind: o.kind, subject: o.subject, html: o.html })
    return { recipients: [], usedFallback: true }
  }),
}))
const audits: Array<{ action: string }> = []
vi.mock('../functions/_lib/auditLog', () => ({
  logAudit: vi.fn(async (_env: Env, e: { action: string }) => { audits.push({ action: e.action }) }),
  actorIp: () => null,
  actorUserAgent: () => null,
  actorGeo: () => null,
}))

// Zoom is stubbed so the booking tests exercise the wiring, not the API.
// tests/zoom.test.ts covers the client itself.
let zoomOn = false
let zoomFails = false
const zoomCreated: Array<{ startsAt: string; durationMinutes: number }> = []
const zoomDeleted: string[] = []
vi.mock('../functions/_lib/zoom', () => ({
  isZoomConfigured: () => zoomOn,
  createZoomMeeting: vi.fn(async (_env: unknown, input: { startsAt: string; durationMinutes: number }) => {
    if (zoomFails) return { ok: false as const, reason: 'request_failed' as const, detail: 'simulated' }
    zoomCreated.push({ startsAt: input.startsAt, durationMinutes: input.durationMinutes })
    return { ok: true as const, value: { meetingId: 'zoom-1', joinUrl: 'https://zoom.us/j/zoom-1', password: '1234' } }
  }),
  deleteZoomMeeting: vi.fn(async (_env: unknown, id: string) => { zoomDeleted.push(id); return { ok: true as const, value: true as const } }),
  updateZoomMeeting: vi.fn(async () => ({ ok: true as const, value: true as const })),
}))

import { consultationBookingPublicRoutes } from '../functions/_lib/routes/consultationBooking'

interface Store {
  schedules: Array<Record<string, unknown>>
  windows: Array<Record<string, unknown>>
  blackouts: Array<Record<string, unknown>>
  events: Array<Record<string, unknown>>
  inquiries: Array<Record<string, unknown>>
  bookings: Array<Record<string, unknown>>
  calendarLinks: Array<Record<string, unknown>>
  clientProfiles: Array<Record<string, unknown>>
  users: Array<{ id: string; email: string }>
  kv: Map<string, string>
  failBookingInsert?: boolean
}

function schedule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched-1', slug: 'consultation', name: 'Consultation', description: null,
    host_user_id: null, timezone: 'America/New_York',
    slot_minutes: 60, increment_minutes: 60,
    buffer_before_minutes: 0, buffer_after_minutes: 0,
    min_notice_minutes: 0, max_advance_days: 365,
    event_type: 'consultation', location_type: 'virtual',
    public_bookable: 1, active: 1,
    ...overrides,
  }
}

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    schedules: [schedule()],
    windows: [{ schedule_id: 'sched-1', weekday: 1, start_minute: 9 * 60, end_minute: 17 * 60 }],
    blackouts: [],
    events: [],
    inquiries: [],
    bookings: [],
    calendarLinks: [],
    clientProfiles: [],
    users: [],
    kv: new Map(),
    ...overrides,
  }
}

function makeEnv(store: Store): Env {
  const prepare = (sql: string) => {
    const s = sql.trim().toLowerCase().replace(/\s+/g, ' ')
    let bound: unknown[] = []
    const api = {
      bind(...args: unknown[]) { bound = args; return api },
      async run() { return apply() },
      async first<T>(): Promise<T | null> {
        if (s.includes('from availability_schedules where slug')) {
          return (store.schedules.find((r) => r.slug === bound[0]) ?? null) as T | null
        }
        if (s.includes('from users where lower(email)')) {
          // Booking now reserves a client workspace, and that decision reads
          // role and password_hash to avoid crossing a staff account or
          // re-prompting someone who already has a password.
          const hit = store.users.find((u) => u.email.toLowerCase() === String(bound[0]).toLowerCase())
          return (hit ? { id: hit.id, role: hit.role ?? 'client', password_hash: hit.password_hash ?? null } : null) as T | null
        }
        if (s.includes('from consultation_bookings') && s.includes('public_token')) {
          const hit = store.bookings.find((b) => b.public_token === bound[0])
          if (!hit) return null
          // The cancel route joins the schedule for its host, so the Google
          // event can be deleted from the calendar it was written to.
          const schedule = store.schedules.find((r) => r.id === hit.schedule_id)
          return { ...hit, host_user_id: schedule?.host_user_id ?? null } as T | null
        }
        if (s.includes('from consultation_calendar_links')) {
          return (store.calendarLinks.find((l) => l.booking_id === bound[0]) ?? null) as T | null
        }
        throw new Error(`unhandled first SQL: ${sql}`)
      },
      async all<T>(): Promise<{ results: T[] }> {
        if (s.includes('from availability_windows')) {
          return { results: store.windows.filter((w) => w.schedule_id === bound[0]) as T[] }
        }
        if (s.includes('from availability_blackouts')) {
          return { results: store.blackouts.filter((b) => b.schedule_id === bound[0]) as T[] }
        }
        if (s.includes('from calendar_events')) {
          const scopeValue = bound[0]
          return {
            results: store.events.filter((e) =>
              (e.status === 'proposed' || e.status === 'confirmed') &&
              (e.assigned_user_id === scopeValue || e.event_type === scopeValue))
              .map((e) => ({ starts_at: e.starts_at, ends_at: e.ends_at })) as T[],
          }
        }
        throw new Error(`unhandled all SQL: ${sql}`)
      },
    }
    function apply() {
      if (s.startsWith('insert into users')) {
        const [id, email, full_name] = bound
        store.users.push({ id, email, full_name, role: 'client', password_hash: null })
        return { success: true }
      }
      if (s.startsWith('insert into client_profiles')) {
        const [id, user_id] = bound
        store.clientProfiles.push({ id, user_id })
        return { success: true }
      }
      if (s.startsWith('insert into calendar_events')) {
        const [id, title, description, starts_at, ends_at, timezone, event_type, location_type, meeting_url, assigned_user_id] = bound
        store.events.push({ id, title, description, starts_at, ends_at, timezone, event_type, status: 'proposed', location_type, meeting_url, visibility: 'internal', client_visible: 0, assigned_user_id })
        return { success: true }
      }
      if (s.startsWith('insert into contact_inquiries')) {
        const [id, name, email] = bound
        store.inquiries.push({ id, name, email })
        return { success: true }
      }
      if (s.startsWith('insert into consultation_bookings')) {
        if (store.failBookingInsert) throw new Error('simulated write failure')
        const [id, public_token, schedule_id, calendar_event_id, inquiry_id, contact_name, email, phone, topic, matched_user_id, starts_at, ends_at, timezone, , meeting_provider, meeting_external_id, meeting_url, meeting_format] = bound
        store.bookings.push({ id, public_token, schedule_id, calendar_event_id, inquiry_id, contact_name, email, phone, topic, matched_user_id, starts_at, ends_at, timezone, status: 'booked', meeting_provider, meeting_external_id, meeting_url, meeting_format })
        return { success: true }
      }
      if (s.startsWith('insert into consultation_calendar_links')) {
        const [booking_id, external_event_id, calendar_id, last_error] = bound
        const existing = store.calendarLinks.find((l) => l.booking_id === booking_id)
        if (existing) Object.assign(existing, { external_event_id, calendar_id, last_error })
        else store.calendarLinks.push({ booking_id, provider: 'google', external_event_id, calendar_id, last_error })
        return { success: true }
      }
      if (s.startsWith('update consultation_calendar_links')) {
        const [booking_id] = bound
        const row = store.calendarLinks.find((l) => l.booking_id === booking_id)
        if (row) Object.assign(row, { external_event_id: null })
        return { success: true }
      }
      if (s.startsWith('update consultation_bookings')) {
        const [reason, id] = bound
        const row = store.bookings.find((b) => b.id === id)
        if (row) Object.assign(row, { status: 'cancelled', cancelled_reason: reason, meeting_url: null })
        return { success: true }
      }
      if (s.startsWith('update calendar_events set status')) {
        const [id] = bound
        const row = store.events.find((e) => e.id === id)
        if (row) Object.assign(row, { status: 'cancelled', meeting_url: null })
        return { success: true }
      }
      throw new Error(`unhandled write SQL: ${sql}`)
    }
    return api
  }
  return {
    DB: {
      prepare,
      batch: async (statements: Array<{ run: () => Promise<unknown> }>) => {
        for (const stmt of statements) await stmt.run()
        return []
      },
    },
    SESSIONS: {
      get: async (k: string) => store.kv.get(k) ?? null,
      put: async (k: string, v: string) => { store.kv.set(k, v) },
    },
  } as unknown as Env
}

function post(env: Env, path: string, body: unknown, ip = '203.0.113.7') {
  return consultationBookingPublicRoutes.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  }, env)
}

// 2026-06-01 is a Monday; 13:00Z is 9:00 EDT, the first slot of the window.
const SLOT = '2026-06-01T13:00:00.000Z'
const VALID = { name: 'Dana Reyes', email: 'dana@example.com', startsAt: SLOT, topic: 'STR turnover coverage' }

beforeEach(() => {
  sent.length = 0
  staffNotices.length = 0
  audits.length = 0
  zoomCreated.length = 0
  zoomDeleted.length = 0
  zoomOn = false
  zoomFails = false
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-29T12:00:00Z'))
})

afterEach(() => { vi.useRealTimers() })

describe('taking a booking', () => {
  it('writes the calendar event, the lead, and the booking together', async () => {
    const store = makeStore()
    const res = await post(makeEnv(store), '/consultation/book', VALID)
    expect(res.status).toBe(201)
    const body = await res.json() as { booking: { ref: string; startsAt: string } }
    expect(body.booking.startsAt).toBe(SLOT)
    expect(store.events).toHaveLength(1)
    expect(store.inquiries).toHaveLength(1)
    expect(store.bookings).toHaveLength(1)
    expect(store.bookings[0].public_token).toBe(body.booking.ref)
  })

  it('confirms to the visitor and tells staff', async () => {
    await post(makeEnv(makeStore()), '/consultation/book', VALID)
    expect(sent.map((s) => s.to)).toEqual(['dana@example.com'])
    expect(staffNotices.map((n) => n.kind)).toEqual(['consultation_booked'])
    expect(audits.map((a) => a.action)).toContain('consultation_booked')
  })

  it('keeps the event internal even when the email matches an account', async () => {
    // The address is unverified, so a match must not put an event in that
    // person's portal.
    const store = makeStore({ users: [{ id: 'user-42', email: 'dana@example.com' }] })
    await post(makeEnv(store), '/consultation/book', VALID)
    expect(store.bookings[0].matched_user_id).toBe('user-42')
    expect(store.events[0].visibility).toBe('internal')
    expect(store.events[0].client_visible).toBe(0)
  })

  it('refuses a slot that is already taken', async () => {
    const store = makeStore({
      events: [{ starts_at: SLOT, ends_at: '2026-06-01T14:00:00Z', status: 'confirmed', assigned_user_id: null, event_type: 'consultation' }],
    })
    const res = await post(makeEnv(store), '/consultation/book', VALID)
    expect(res.status).toBe(409)
    expect((await res.json() as { code: string }).code).toBe('slot_taken')
    expect(store.bookings).toHaveLength(0)
  })

  it('refuses a time that is not on the schedule grid', async () => {
    const store = makeStore()
    // 03:00Z is 11pm the previous evening in New York, well outside the window.
    const res = await post(makeEnv(store), '/consultation/book', { ...VALID, startsAt: '2026-06-01T03:00:00.000Z' })
    expect(res.status).toBe(409)
    expect(store.bookings).toHaveLength(0)
  })

  it('refuses to book against an unpublished schedule', async () => {
    const store = makeStore({ schedules: [schedule({ public_bookable: 0 })] })
    const res = await post(makeEnv(store), '/consultation/book', VALID)
    expect(res.status).toBe(409)
    expect(store.bookings).toHaveLength(0)
  })

  it('validates the visitor input before touching the calendar', async () => {
    const store = makeStore()
    const env = makeEnv(store)
    expect((await post(env, '/consultation/book', { ...VALID, name: '' })).status).toBe(400)
    expect((await post(env, '/consultation/book', { ...VALID, email: 'not-an-email' })).status).toBe(400)
    expect((await post(env, '/consultation/book', { ...VALID, startsAt: 'whenever' })).status).toBe(400)
    expect(store.bookings).toHaveLength(0)
  })

  it('throttles repeated bookings from one address', async () => {
    const store = makeStore()
    const env = makeEnv(store)
    for (let i = 0; i < 6; i += 1) {
      // Each needs a distinct free slot, so walk along the Monday window.
      await post(env, '/consultation/book', { ...VALID, startsAt: `2026-06-01T${13 + i}:00:00.000Z` })
    }
    const res = await post(env, '/consultation/book', { ...VALID, startsAt: '2026-06-01T19:00:00.000Z' })
    expect(res.status).toBe(429)
  })

  it('keeps taking bookings when the throttle store is unavailable', async () => {
    const store = makeStore()
    const env = makeEnv(store)
    ;(env as unknown as { SESSIONS: Record<string, unknown> }).SESSIONS = {
      get: async () => { throw new Error('kv down') },
      put: async () => { throw new Error('kv down') },
    }
    expect((await post(env, '/consultation/book', VALID)).status).toBe(201)
  })
})

describe('zoom meeting generation', () => {
  it('attaches a join link to the booking, the calendar event, and the email', async () => {
    zoomOn = true
    const store = makeStore()
    await post(makeEnv(store), '/consultation/book', VALID)
    expect(zoomCreated).toHaveLength(1)
    expect(zoomCreated[0].startsAt).toBe(SLOT)
    expect(zoomCreated[0].durationMinutes).toBe(60)
    expect(store.bookings[0].meeting_url).toBe('https://zoom.us/j/zoom-1')
    expect(store.bookings[0].meeting_provider).toBe('zoom')
    expect(store.bookings[0].meeting_external_id).toBe('zoom-1')
    // The calendar row carries it too, which is what feeds the ICS invite.
    expect(store.events[0].meeting_url).toBe('https://zoom.us/j/zoom-1')
    expect(sent[0].text).toContain('https://zoom.us/j/zoom-1')
  })

  it('still takes the booking when Zoom is unavailable', async () => {
    zoomOn = true
    zoomFails = true
    const store = makeStore()
    const res = await post(makeEnv(store), '/consultation/book', VALID)
    expect(res.status).toBe(201)
    expect(store.bookings).toHaveLength(1)
    expect(store.bookings[0].meeting_url).toBeNull()
    expect(store.bookings[0].meeting_provider).toBeNull()
    // Staff are told loudly, so someone adds joining details before the call.
    expect(staffNotices[0].html).toContain('No Zoom link was generated')
  })

  it('promises joining details later rather than a broken link', async () => {
    zoomOn = true
    zoomFails = true
    await post(makeEnv(makeStore()), '/consultation/book', VALID)
    expect(sent[0].text).toContain('We will send joining details before the call')
    expect(sent[0].text).not.toContain('zoom.us')
  })

  it('creates nothing when Zoom is not configured', async () => {
    zoomOn = false
    const store = makeStore()
    await post(makeEnv(store), '/consultation/book', VALID)
    expect(zoomCreated).toHaveLength(0)
    expect(store.bookings[0].meeting_url).toBeNull()
    // Not configured is not a problem to nag staff about.
    expect(staffNotices[0].html).not.toContain('No Zoom link')
  })

  it('skips meeting generation for a schedule that is not virtual', async () => {
    zoomOn = true
    const store = makeStore({ schedules: [schedule({ location_type: 'phone' })] })
    await post(makeEnv(store), '/consultation/book', VALID)
    expect(zoomCreated).toHaveLength(0)
  })

  it('cleans up the meeting when the booking write fails', async () => {
    zoomOn = true
    const store = makeStore({ failBookingInsert: true })
    await post(makeEnv(store), '/consultation/book', VALID).catch(() => undefined)
    // No orphan left sitting on the host's Zoom calendar.
    expect(zoomDeleted).toEqual(['zoom-1'])
  })

  it('tears the meeting down on cancellation', async () => {
    zoomOn = true
    const store = makeStore()
    const env = makeEnv(store)
    const res = await post(env, '/consultation/book', VALID)
    const ref = (await res.json() as { booking: { ref: string } }).booking.ref
    await post(env, `/consultation/booking/${ref}/cancel`, {})
    expect(zoomDeleted).toEqual(['zoom-1'])
    // The dead link is cleared from both records, not just hidden.
    expect(store.bookings[0].meeting_url).toBeNull()
    expect(store.events[0].meeting_url).toBeNull()
  })
})

describe('managing a booking by token', () => {
  async function bookOne(store: Store) {
    const env = makeEnv(store)
    const res = await post(env, '/consultation/book', VALID)
    const body = await res.json() as { booking: { ref: string } }
    return { env, ref: body.booking.ref }
  }

  it('looks up a booking with its token', async () => {
    const store = makeStore()
    const { env, ref } = await bookOne(store)
    const res = await consultationBookingPublicRoutes.request(`/consultation/booking/${ref}`, {}, env)
    expect(res.status).toBe(200)
    const body = await res.json() as { booking: { status: string; startsAt: string } }
    expect(body.booking.status).toBe('booked')
    expect(body.booking.startsAt).toBe(SLOT)
  })

  it('does not resolve an unknown token', async () => {
    const res = await consultationBookingPublicRoutes.request('/consultation/booking/made-up', {}, makeEnv(makeStore()))
    expect(res.status).toBe(404)
  })

  it('cancels the booking and frees the calendar slot', async () => {
    const store = makeStore()
    const { env, ref } = await bookOne(store)
    const res = await post(env, `/consultation/booking/${ref}/cancel`, { reason: 'Conflict came up' })
    expect(res.status).toBe(200)
    expect(store.bookings[0].status).toBe('cancelled')
    // Cancelled rather than deleted, so the slot frees but history survives.
    expect(store.events[0].status).toBe('cancelled')
    expect(staffNotices.map((n) => n.kind)).toContain('consultation_cancelled')
  })

  it('treats a second cancel as a no-op rather than an error', async () => {
    const store = makeStore()
    const { env, ref } = await bookOne(store)
    await post(env, `/consultation/booking/${ref}/cancel`, {})
    const again = await post(env, `/consultation/booking/${ref}/cancel`, {})
    expect(again.status).toBe(200)
    expect((await again.json() as { status: string }).status).toBe('cancelled')
  })

  it('will not cancel from a token that does not exist', async () => {
    const res = await post(makeEnv(makeStore()), '/consultation/booking/made-up/cancel', {})
    expect(res.status).toBe(404)
  })

  it('stops surfacing a meeting link once cancelled', async () => {
    const store = makeStore()
    const { env, ref } = await bookOne(store)
    store.bookings[0].meeting_url = 'https://zoom.us/j/123'
    await post(env, `/consultation/booking/${ref}/cancel`, {})
    const res = await consultationBookingPublicRoutes.request(`/consultation/booking/${ref}`, {}, env)
    const body = await res.json() as { booking: { meetingUrl: string | null } }
    expect(body.booking.meetingUrl).toBeNull()
  })
})


describe('the visitor chooses the format', () => {
  it('defaults to video on a virtual schedule and generates a link', async () => {
    zoomOn = true
    const store = makeStore()
    await post(makeEnv(store), '/consultation/book', VALID)
    expect(store.bookings[0].meeting_format).toBe('virtual')
    expect(store.bookings[0].meeting_url).toBe('https://zoom.us/j/zoom-1')
  })

  it('skips Zoom entirely when the visitor picks phone', async () => {
    zoomOn = true
    const store = makeStore()
    await post(makeEnv(store), '/consultation/book', { ...VALID, meetingFormat: 'phone', phone: '561-555-0100' })
    expect(zoomCreated).toHaveLength(0)
    expect(store.bookings[0].meeting_format).toBe('phone')
    expect(store.bookings[0].meeting_url).toBeNull()
  })

  it('needs a number before it will book a phone call', async () => {
    // We cannot call someone we have no number for.
    const store = makeStore()
    const res = await post(makeEnv(store), '/consultation/book', { ...VALID, meetingFormat: 'phone' })
    expect(res.status).toBe(400)
    expect(store.bookings).toHaveLength(0)
  })

  it('tells a phone booker we will call them, not that a link is coming', async () => {
    const store = makeStore()
    await post(makeEnv(store), '/consultation/book', { ...VALID, meetingFormat: 'phone', phone: '561-555-0100' })
    expect(sent[0].text).toContain('We will call you on 561-555-0100')
    expect(sent[0].text).not.toContain('joining details')
  })

  it('does not nag staff about a missing Zoom link on a phone booking', async () => {
    zoomOn = true
    await post(makeEnv(makeStore()), '/consultation/book', { ...VALID, meetingFormat: 'phone', phone: '561-555-0100' })
    expect(staffNotices[0].html).toContain('Format: Phone call')
    expect(staffNotices[0].html).not.toContain('No Zoom link')
  })

  it('will not conjure a video call on a phone-only schedule', async () => {
    // The choice lets someone opt OUT of video, not into a format the host
    // never offered.
    zoomOn = true
    const store = makeStore({ schedules: [schedule({ location_type: 'phone' })] })
    await post(makeEnv(store), '/consultation/book', { ...VALID, meetingFormat: 'virtual', phone: '561-555-0100' })
    expect(zoomCreated).toHaveLength(0)
    expect(store.bookings[0].meeting_format).toBe('phone')
  })

  it('records the format on the calendar event too', async () => {
    const store = makeStore()
    await post(makeEnv(store), '/consultation/book', { ...VALID, meetingFormat: 'phone', phone: '561-555-0100' })
    expect(store.events[0].location_type).toBe('phone')
  })
})
