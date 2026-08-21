import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_lib/types'
import { availabilityPublicRoutes } from '../functions/_lib/routes/availability'

// The public slot endpoint is the only unauthenticated surface here, so these
// tests focus on what it is allowed to say: slot instants, and nothing about
// the host or about what fills the rest of the calendar.

interface ScheduleRecord {
  id: string
  slug: string
  name: string
  description: string | null
  host_user_id: string | null
  timezone: string
  slot_minutes: number
  increment_minutes: number
  buffer_before_minutes: number
  buffer_after_minutes: number
  min_notice_minutes: number
  max_advance_days: number
  event_type: string
  location_type: string
  public_bookable: number
  active: number
}

interface Store {
  schedules: ScheduleRecord[]
  windows: Array<{ schedule_id: string; weekday: number; start_minute: number; end_minute: number }>
  blackouts: Array<{ id: string; schedule_id: string; starts_at: string; ends_at: string; reason: string | null }>
  events: Array<{ starts_at: string; ends_at: string | null; status: string; assigned_user_id: string | null; event_type: string }>
}

function baseSchedule(overrides: Partial<ScheduleRecord> = {}): ScheduleRecord {
  return {
    id: 'sched-1',
    slug: 'consultation',
    name: 'Consultation',
    description: 'Intro call',
    host_user_id: null,
    timezone: 'America/New_York',
    slot_minutes: 60,
    increment_minutes: 60,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    min_notice_minutes: 0,
    max_advance_days: 365,
    event_type: 'consultation',
    location_type: 'virtual',
    public_bookable: 1,
    active: 1,
    ...overrides,
  }
}

function emptyStore(overrides: Partial<Store> = {}): Store {
  return {
    schedules: [baseSchedule()],
    windows: [{ schedule_id: 'sched-1', weekday: 1, start_minute: 9 * 60, end_minute: 17 * 60 }],
    blackouts: [],
    events: [],
    ...overrides,
  }
}

function makeEnv(store: Store): Env {
  const preparer = (sql: string) => {
    const s = sql.trim().toLowerCase().replace(/\s+/g, ' ')
    let bound: unknown[] = []
    const api = {
      bind(...args: unknown[]) { bound = args; return api },
      async run() {
        if (s.startsWith('insert into availability_schedules')) {
          const [id, slug, name, description, timezone, slot, inc, bBefore, bAfter, notice, advance] = bound as never[]
          store.schedules.push(baseSchedule({
            id, slug, name, description, timezone,
            slot_minutes: slot, increment_minutes: inc,
            buffer_before_minutes: bBefore, buffer_after_minutes: bAfter,
            min_notice_minutes: notice, max_advance_days: advance,
            // Seeded schedules are explicitly not public until reviewed.
            public_bookable: 0,
          }))
          return { success: true }
        }
        if (s.startsWith('insert into availability_windows')) {
          const [, schedule_id, weekday, start_minute, end_minute] = bound as never[]
          store.windows.push({ schedule_id, weekday, start_minute, end_minute })
          return { success: true }
        }
        throw new Error(`unhandled run SQL: ${sql}`)
      },
      async first<T>(): Promise<T | null> {
        if (s.includes('from availability_schedules where slug')) {
          return (store.schedules.find((r) => r.slug === bound[0]) ?? null) as T | null
        }
        if (s.includes('from availability_schedules where id')) {
          return (store.schedules.find((r) => r.id === bound[0]) ?? null) as T | null
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
          // The route binds either the host id or the event type, then the
          // range bounds. Model both shapes.
          const scopeValue = bound[0]
          const matches = store.events.filter((e) =>
            (e.status === 'proposed' || e.status === 'confirmed') &&
            (e.assigned_user_id === scopeValue || e.event_type === scopeValue))
          return { results: matches.map((e) => ({ starts_at: e.starts_at, ends_at: e.ends_at })) as T[] }
        }
        throw new Error(`unhandled all SQL: ${sql}`)
      },
    }
    return api
  }
  return {
    DB: {
      prepare: (sql: string) => preparer(sql),
      batch: async (statements: Array<{ run: () => Promise<unknown> }>) => {
        for (const stmt of statements) await stmt.run()
        return []
      },
    },
  } as unknown as Env
}

async function getAvailability(env: Env, query = '') {
  const res = await availabilityPublicRoutes.request(`/consultation/availability${query}`, {}, env)
  return { status: res.status, body: await res.json() as Record<string, never> }
}

beforeEach(() => {
  vi.useFakeTimers()
  // A Friday in EDT, so the following Monday sits inside the default range.
  vi.setSystemTime(new Date('2026-05-29T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('public consultation availability', () => {
  it('offers slots from the configured window', async () => {
    const body = await getAvailability(makeEnv(emptyStore()))
    expect(body.status).toBe(200)
    expect(body.body.bookable).toBe(true)
    const days = body.body.days as Array<{ dateKey: string; slots: Array<{ startsAt: string }> }>
    const monday = days.find((d) => d.dateKey === '2026-06-01')
    expect(monday?.slots).toHaveLength(8)
    expect(monday?.slots[0].startsAt).toBe('2026-06-01T13:00:00.000Z')
  })

  it('stays silent when the schedule is not published', async () => {
    const store = emptyStore({ schedules: [baseSchedule({ public_bookable: 0 })] })
    const body = await getAvailability(makeEnv(store))
    expect(body.status).toBe(200)
    expect(body.body.bookable).toBe(false)
    expect(body.body.days).toEqual([])
    expect(body.body.schedule).toBeNull()
  })

  it('stays silent when the schedule is deactivated', async () => {
    const store = emptyStore({ schedules: [baseSchedule({ active: 0 })] })
    expect((await getAvailability(makeEnv(store))).body.bookable).toBe(false)
  })

  it('never reveals the host or what is blocking a slot', async () => {
    const store = emptyStore({
      schedules: [baseSchedule({ host_user_id: 'user-owner' })],
      events: [{
        starts_at: '2026-06-01T15:00:00Z',
        ends_at: '2026-06-01T16:00:00Z',
        status: 'confirmed',
        assigned_user_id: 'user-owner',
        event_type: 'client_meeting',
      }],
    })
    const { body } = await getAvailability(makeEnv(store))
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('user-owner')
    expect(serialized).not.toContain('client_meeting')
    expect(serialized).not.toContain('hostUserId')
    // The blocked hour is simply absent; no reason is given.
    const days = body.days as Array<{ dateKey: string; slots: Array<{ startsAt: string }> }>
    const monday = days.find((d) => d.dateKey === '2026-06-01')
    expect(monday?.slots.map((s) => s.startsAt)).not.toContain('2026-06-01T15:00:00.000Z')
    expect(monday?.slots).toHaveLength(7)
  })

  it('blocks a slot already taken through the same offering when there is no named host', async () => {
    const store = emptyStore({
      events: [{
        starts_at: '2026-06-01T14:00:00Z',
        ends_at: '2026-06-01T15:00:00Z',
        status: 'proposed',
        assigned_user_id: null,
        event_type: 'consultation',
      }],
    })
    const { body } = await getAvailability(makeEnv(store))
    const days = body.days as Array<{ dateKey: string; slots: Array<{ startsAt: string }> }>
    const monday = days.find((d) => d.dateKey === '2026-06-01')
    expect(monday?.slots.map((s) => s.startsAt)).not.toContain('2026-06-01T14:00:00.000Z')
  })

  it('ignores cancelled events when deciding what is free', async () => {
    const store = emptyStore({
      events: [{
        starts_at: '2026-06-01T14:00:00Z',
        ends_at: '2026-06-01T15:00:00Z',
        status: 'cancelled',
        assigned_user_id: null,
        event_type: 'consultation',
      }],
    })
    const { body } = await getAvailability(makeEnv(store))
    const days = body.days as Array<{ dateKey: string; slots: Array<{ startsAt: string }> }>
    expect(days.find((d) => d.dateKey === '2026-06-01')?.slots).toHaveLength(8)
  })

  it('caps an over-wide date range instead of walking the whole calendar', async () => {
    const { body } = await getAvailability(makeEnv(emptyStore()), '?from=2026-06-01&to=2027-06-01')
    const range = body.range as { from: string; to: string }
    expect(range.from).toBe('2026-06-01')
    // 62-day ceiling from the first day of the range.
    expect(range.to).toBe('2026-08-01')
  })

  it('ignores a start date in the past', async () => {
    const { body } = await getAvailability(makeEnv(emptyStore()), '?from=2020-01-01&to=2026-06-02')
    expect((body.range as { from: string }).from).toBe('2026-05-29')
  })

  it('ignores a malformed date instead of erroring', async () => {
    const { body } = await getAvailability(makeEnv(emptyStore()), '?from=garbage&to=also-garbage')
    expect(body.bookable).toBe(true)
    expect((body.range as { from: string }).from).toBe('2026-05-29')
  })

  it('seeds a consultation schedule on first read but does not publish it', async () => {
    const store = emptyStore({ schedules: [], windows: [] })
    const { body } = await getAvailability(makeEnv(store))
    expect(store.schedules).toHaveLength(1)
    expect(store.schedules[0].slug).toBe('consultation')
    // Seeded with weekday windows, but off until someone reviews the hours.
    expect(store.windows).toHaveLength(5)
    expect(body.bookable).toBe(false)
  })

  it('reports the timezone and slot length the visitor is booking against', async () => {
    const { body } = await getAvailability(makeEnv(emptyStore()))
    const schedule = body.schedule as Record<string, unknown>
    expect(schedule.timezone).toBe('America/New_York')
    expect(schedule.slotMinutes).toBe(60)
    expect(schedule.locationType).toBe('virtual')
  })
})
