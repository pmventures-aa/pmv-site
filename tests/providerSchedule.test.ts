import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_lib/types'

// A provider was previously just "available" or not - one flag that says
// nothing about Tuesday afternoons or the week they are away. This adds real
// hours WITHOUT adding tables: availability_schedules is already per-host with
// public_bookable off by default, so a provider's week is another schedule row
// running through the same engine as the public consultation page.
//
// The thing this must never become: a read of anyone's personal calendar. We
// only ever know what the provider told us.

let idCounter = 0
vi.mock('../functions/_lib/crypto', () => ({ uuid: () => `id-${++idCounter}` }))

import {
  getOrCreateProviderSchedule,
  providerFitness,
  providerScheduleSlug,
} from '../functions/_lib/providerSchedule'

type Row = Record<string, unknown>
let schedules: Row[] = []
let windows: Row[] = []
let blackouts: Row[] = []
let events: Row[] = []

function env(): Env {
  const prepare = (sql: string) => {
    const s = sql.trim().toLowerCase().replace(/\s+/g, ' ')
    let bound: unknown[] = []
    const api = {
      bind(...a: unknown[]) { bound = a; return api },
      async first<T>() {
        if (s.includes('from availability_schedules where slug')) {
          return (schedules.find((r) => r.slug === bound[0]) ?? null) as T | null
        }
        if (s.includes('from availability_schedules where id')) {
          return (schedules.find((r) => r.id === bound[0]) ?? null) as T | null
        }
        throw new Error(`unhandled first: ${sql}`)
      },
      async all<T>() {
        if (s.includes('from availability_windows')) {
          return { results: windows.filter((w) => w.schedule_id === bound[0]) as T[] }
        }
        if (s.includes('from availability_blackouts')) {
          return { results: blackouts.filter((b) => b.schedule_id === bound[0]) as T[] }
        }
        if (s.includes('from calendar_events')) {
          return { results: events.filter((e) => e.vendor_user_id === bound[0]) as T[] }
        }
        throw new Error(`unhandled all: ${sql}`)
      },
      async run() {
        if (s.startsWith('insert into availability_schedules')) {
          schedules.push({
            id: bound[0], slug: bound[1], host_user_id: bound[2],
            timezone: 'America/New_York', slot_minutes: 60, increment_minutes: 30,
            buffer_before_minutes: 0, buffer_after_minutes: 15,
            min_notice_minutes: 240, max_advance_days: 60, active: 1,
          })
          return { success: true }
        }
        throw new Error(`unhandled run: ${sql}`)
      },
    }
    return api
  }
  return { DB: { prepare } } as unknown as Env
}

function reset() {
  schedules = []; windows = []; blackouts = []; events = []; idCounter = 0
}

function giveHours(scheduleId: string, weekday: number, start = 9 * 60, end = 17 * 60) {
  windows.push({ schedule_id: scheduleId, weekday, start_minute: start, end_minute: end })
}

describe('a provider schedule needs no new tables', () => {
  it('is addressed by a slug derived from the provider id', () => {
    expect(providerScheduleSlug('vendor-1')).toBe('provider-vendor-1')
  })

  it('is created on first read and reused after', async () => {
    reset()
    const first = await getOrCreateProviderSchedule(env(), 'vendor-1')
    const second = await getOrCreateProviderSchedule(env(), 'vendor-1')
    expect(first.id).toBe(second.id)
    expect(schedules).toHaveLength(1)
    expect(first.host_user_id).toBe('vendor-1')
  })

  // Seeding nine-to-five would invent a claim about someone's working hours
  // that they never made, and dispatch would act on it.
  it('starts with an empty week rather than an invented one', async () => {
    reset()
    const row = await getOrCreateProviderSchedule(env(), 'vendor-1')
    expect(windows.filter((w) => w.schedule_id === row.id)).toHaveLength(0)
  })
})

describe('fitness tells apart the reasons a provider is not free', () => {
  // "Has not told us" is a person to ask. "Not free" is a person to skip.
  // Collapsing them into one false is how a network quietly stops offering
  // work to everyone who has not filled in a form.
  it('reports no_hours before anything else', async () => {
    reset()
    const res = await providerFitness(env(), 'vendor-1', '2026-09-01T14:00:00.000Z', '2026-09-01T15:00:00.000Z')
    expect(res).toEqual({ hasHours: false, free: false, reason: 'no_hours' })
  })

  it('says free when the span sits inside a working window', async () => {
    reset()
    const row = await getOrCreateProviderSchedule(env(), 'vendor-1')
    giveHours(row.id, 2) // Tuesday
    // 2026-09-01 is a Tuesday. 14:00Z is 10:00 in New York.
    const res = await providerFitness(env(), 'vendor-1', '2026-09-01T14:00:00.000Z', '2026-09-01T15:00:00.000Z')
    expect(res.hasHours).toBe(true)
    expect(res.free).toBe(true)
    expect(res.reason).toBeNull()
  })

  it('says outside_hours on a day they do not work', async () => {
    reset()
    const row = await getOrCreateProviderSchedule(env(), 'vendor-1')
    giveHours(row.id, 2)
    // 2026-09-02 is a Wednesday.
    const res = await providerFitness(env(), 'vendor-1', '2026-09-02T14:00:00.000Z', '2026-09-02T15:00:00.000Z')
    expect(res.free).toBe(false)
    expect(res.reason).toBe('outside_hours')
  })

  // "I am away" has to beat a weekly window that would otherwise look open.
  it('lets time off win over the usual week', async () => {
    reset()
    const row = await getOrCreateProviderSchedule(env(), 'vendor-1')
    giveHours(row.id, 2)
    blackouts.push({ schedule_id: row.id, id: 'b1', starts_at: '2026-09-01T00:00:00.000Z', ends_at: '2026-09-03T00:00:00.000Z', reason: 'Away' })
    const res = await providerFitness(env(), 'vendor-1', '2026-09-01T14:00:00.000Z', '2026-09-01T15:00:00.000Z')
    expect(res.free).toBe(false)
    expect(res.reason).toBe('time_off')
  })

  it('says already_booked when work is on the calendar', async () => {
    reset()
    const row = await getOrCreateProviderSchedule(env(), 'vendor-1')
    giveHours(row.id, 2)
    events.push({ vendor_user_id: 'vendor-1', starts_at: '2026-09-01T14:30:00.000Z', ends_at: '2026-09-01T15:30:00.000Z' })
    const res = await providerFitness(env(), 'vendor-1', '2026-09-01T14:00:00.000Z', '2026-09-01T15:00:00.000Z')
    expect(res.free).toBe(false)
    expect(res.reason).toBe('already_booked')
  })

  it('does not throw on unparseable times', async () => {
    reset()
    const row = await getOrCreateProviderSchedule(env(), 'vendor-1')
    giveHours(row.id, 2)
    const res = await providerFitness(env(), 'vendor-1', 'not-a-date', 'also-not')
    expect(res.free).toBe(false)
  })
})

describe('who may change a providers hours', () => {
  const routes = readFileSync(new URL('../functions/_lib/routes/providerAvailability.ts', import.meta.url), 'utf8')

  // Hours are a statement about someone's life. A coordinator quietly widening
  // them would produce assignments the provider never agreed to be free for.
  it('lets only the provider edit, including against admins', () => {
    expect(routes).toContain('function canEdit(user: SessionUser, vendorUserId: string): boolean {\n  return user.id === vendorUserId\n}')
    expect(routes).toContain('only the provider can set their own hours')
  })

  it('lets staff read them, because dispatch needs to', () => {
    expect(routes).toContain('if (user.id === vendorUserId) return true')
    expect(routes).toContain("return user.party_type !== 'vendor'")
  })

  it('scopes a time-off delete to the provider own schedule', () => {
    expect(routes).toContain('DELETE FROM availability_blackouts WHERE id = ? AND schedule_id = ?')
  })
})

describe('the page says what it does and does not look at', () => {
  const page = readFileSync(new URL('../src/pages/admin/ProviderAvailability.tsx', import.meta.url), 'utf8')

  it('promises we never read a personal calendar', () => {
    expect(page).toContain('We never look at your personal calendar')
  })

  it('treats an empty week as a prompt, not a setting', () => {
    expect(page).toContain('You have not set any hours yet')
    expect(page).toContain('!data.configured')
  })

  it('reuses the shared day-blocking calendar', () => {
    expect(page).toContain("from '../../../shared/dayBlocking'")
  })
})
