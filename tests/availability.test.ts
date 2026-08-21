import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCHEDULE,
  type AvailabilitySchedule,
  addDaysToDateKey,
  dateKeyWeekday,
  defaultBusinessWindows,
  enumerateDateKeys,
  formatHhMm,
  generateAvailableSlots,
  groupSlotsByDay,
  isSlotBookable,
  isValidDateKey,
  isValidTimezone,
  normalizeSchedule,
  normalizeWindows,
  parseHhMm,
  tzOffsetMs,
  utcMsToDateKey,
  zonedWallTimeToUtcMs,
} from '../shared/availability'

const NY = 'America/New_York'

// A schedule with no notice/advance friction, so a test can assert purely on
// window math without also reasoning about the clock.
function schedule(overrides: Partial<AvailabilitySchedule> = {}): AvailabilitySchedule {
  return {
    ...DEFAULT_SCHEDULE,
    windows: defaultBusinessWindows(),
    minNoticeMinutes: 0,
    maxAdvanceDays: 365,
    bufferAfterMinutes: 0,
    incrementMinutes: 60,
    ...overrides,
  }
}

// 2026-06-01 is a Monday, comfortably inside EDT.
const MONDAY = '2026-06-01'
const NOW = Date.UTC(2026, 4, 1) // 2026-05-01, well before every fixture date.

describe('date key helpers', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(isValidDateKey('2026-06-01')).toBe(true)
    expect(isValidDateKey('2026-02-30')).toBe(false)
    expect(isValidDateKey('2026-13-01')).toBe(false)
    expect(isValidDateKey('06-01-2026')).toBe(false)
  })

  it('knows the weekday of a date key', () => {
    expect(dateKeyWeekday('2026-06-01')).toBe(1) // Monday
    expect(dateKeyWeekday('2026-06-06')).toBe(6) // Saturday
  })

  it('walks days across a month boundary', () => {
    expect(addDaysToDateKey('2026-05-31', 1)).toBe('2026-06-01')
    expect(addDaysToDateKey('2026-01-01', -1)).toBe('2025-12-31')
    expect(enumerateDateKeys('2026-06-01', '2026-06-03')).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
    expect(enumerateDateKeys('2026-06-03', '2026-06-01')).toEqual([])
  })

  it('validates timezones without throwing', () => {
    expect(isValidTimezone(NY)).toBe(true)
    expect(isValidTimezone('Not/AZone')).toBe(false)
    expect(isValidTimezone('')).toBe(false)
  })
})

describe('wall time to UTC conversion', () => {
  it('applies the standard-time offset in winter', () => {
    // 9:00 AM EST is 14:00 UTC.
    const ms = zonedWallTimeToUtcMs('2026-01-05', 9 * 60, NY)
    expect(new Date(ms).toISOString()).toBe('2026-01-05T14:00:00.000Z')
  })

  it('applies the daylight offset in summer', () => {
    // The same 9:00 AM wall time is 13:00 UTC once EDT starts.
    const ms = zonedWallTimeToUtcMs(MONDAY, 9 * 60, NY)
    expect(new Date(ms).toISOString()).toBe('2026-06-01T13:00:00.000Z')
  })

  it('handles a half-hour offset zone', () => {
    const ms = zonedWallTimeToUtcMs('2026-06-01', 9 * 60, 'Asia/Kolkata')
    expect(new Date(ms).toISOString()).toBe('2026-06-01T03:30:00.000Z')
  })

  it('rolls a midnight end boundary into the next day', () => {
    const ms = zonedWallTimeToUtcMs(MONDAY, 1440, NY)
    expect(new Date(ms).toISOString()).toBe('2026-06-02T04:00:00.000Z')
  })

  it('reports offsets as the shift from UTC to local', () => {
    expect(tzOffsetMs(Date.UTC(2026, 0, 5, 12), NY)).toBe(-5 * 3600_000)
    expect(tzOffsetMs(Date.UTC(2026, 5, 1, 12), NY)).toBe(-4 * 3600_000)
  })

  it('maps an instant back to its local calendar date', () => {
    // 01:00 UTC is still the previous evening in New York.
    expect(utcMsToDateKey(Date.parse('2026-06-02T01:00:00Z'), NY)).toBe('2026-06-01')
  })
})

describe('slot generation', () => {
  it('fills a weekday window with back-to-back slots', () => {
    const slots = generateAvailableSlots(schedule(), [], { from: MONDAY, to: MONDAY, now: NOW })
    expect(slots).toHaveLength(8) // 9:00 through 16:00
    expect(slots[0].startsAt).toBe('2026-06-01T13:00:00.000Z') // 9:00 EDT
    expect(slots[0].endsAt).toBe('2026-06-01T14:00:00.000Z')
    expect(slots[7].startsAt).toBe('2026-06-01T20:00:00.000Z') // 16:00 EDT
  })

  it('skips days with no configured window', () => {
    // 2026-06-06 is a Saturday and the default windows are weekdays only.
    const slots = generateAvailableSlots(schedule(), [], { from: '2026-06-06', to: '2026-06-07', now: NOW })
    expect(slots).toEqual([])
  })

  it('offers overlapping start times when the increment is shorter than the slot', () => {
    const slots = generateAvailableSlots(
      schedule({ incrementMinutes: 30 }),
      [],
      { from: MONDAY, to: MONDAY, now: NOW },
    )
    // 9:00 through 16:00 every half hour.
    expect(slots).toHaveLength(15)
    expect(slots[1].startsAt).toBe('2026-06-01T13:30:00.000Z')
  })

  it('never runs a slot past the end of its window', () => {
    const slots = generateAvailableSlots(
      schedule({ windows: [{ weekday: 1, startMinute: 9 * 60, endMinute: 10 * 60 + 30 }] }),
      [],
      { from: MONDAY, to: MONDAY, now: NOW },
    )
    // Only 9:00 fits a full hour before 10:30.
    expect(slots).toHaveLength(1)
    expect(slots[0].endsAt).toBe('2026-06-01T14:00:00.000Z')
  })

  it('returns slots in chronological order across days', () => {
    const slots = generateAvailableSlots(schedule(), [], { from: MONDAY, to: '2026-06-02', now: NOW })
    const times = slots.map((s) => s.startsAt)
    expect([...times].sort()).toEqual(times)
    expect(slots).toHaveLength(16)
  })

  it('honours the limit without breaking ordering', () => {
    const slots = generateAvailableSlots(schedule(), [], { from: MONDAY, to: '2026-06-05', now: NOW, limit: 5 })
    expect(slots).toHaveLength(5)
    expect(slots[0].startsAt).toBe('2026-06-01T13:00:00.000Z')
  })
})

describe('booking guardrails', () => {
  it('hides slots inside the minimum notice period', () => {
    // Standing at 9:00 EDT Monday with 24 hours notice required, nothing on
    // Monday survives and Tuesday starts clean.
    const now = Date.parse('2026-06-01T13:00:00Z')
    const slots = generateAvailableSlots(
      schedule({ minNoticeMinutes: 24 * 60 }),
      [],
      { from: MONDAY, to: '2026-06-02', now },
    )
    expect(slots.every((s) => Date.parse(s.startsAt) >= now + 24 * 60 * 60_000)).toBe(true)
    expect(slots[0].startsAt).toBe('2026-06-02T13:00:00.000Z')
  })

  it('hides slots beyond the maximum advance window', () => {
    const now = Date.parse('2026-06-01T12:00:00Z')
    const slots = generateAvailableSlots(
      schedule({ maxAdvanceDays: 2 }),
      [],
      { from: MONDAY, to: '2026-06-30', now },
    )
    expect(slots.length).toBeGreaterThan(0)
    expect(Math.max(...slots.map((s) => Date.parse(s.startsAt)))).toBeLessThanOrEqual(now + 2 * 86_400_000)
  })

  it('removes slots that collide with an existing commitment', () => {
    const busy = [{ startsAt: '2026-06-01T15:00:00Z', endsAt: '2026-06-01T16:00:00Z' }] // 11:00 EDT
    const slots = generateAvailableSlots(schedule(), busy, { from: MONDAY, to: MONDAY, now: NOW })
    expect(slots.map((s) => s.startsAt)).not.toContain('2026-06-01T15:00:00.000Z')
    expect(slots).toHaveLength(7)
  })

  it('extends a collision by the configured buffers', () => {
    const busy = [{ startsAt: '2026-06-01T15:00:00Z', endsAt: '2026-06-01T16:00:00Z' }]
    const slots = generateAvailableSlots(
      schedule({ bufferBeforeMinutes: 15, bufferAfterMinutes: 15 }),
      busy,
      { from: MONDAY, to: MONDAY, now: NOW },
    )
    const starts = slots.map((s) => s.startsAt)
    // The 15-minute pad reaches back into the 10:00 slot and forward into 12:00.
    expect(starts).not.toContain('2026-06-01T14:00:00.000Z')
    expect(starts).not.toContain('2026-06-01T15:00:00.000Z')
    expect(starts).not.toContain('2026-06-01T16:00:00.000Z')
    expect(starts).toContain('2026-06-01T13:00:00.000Z')
  })

  it('treats a commitment that merely touches a slot edge as no collision', () => {
    // Ends exactly when the 10:00 EDT slot starts, with no buffer configured.
    const busy = [{ startsAt: '2026-06-01T13:00:00Z', endsAt: '2026-06-01T14:00:00Z' }]
    const slots = generateAvailableSlots(schedule(), busy, { from: MONDAY, to: MONDAY, now: NOW })
    expect(slots.map((s) => s.startsAt)).toContain('2026-06-01T14:00:00.000Z')
  })

  it('accepts the space-separated timestamps D1 stores', () => {
    const busy = [{ startsAt: '2026-06-01 15:00:00', endsAt: '2026-06-01 16:00:00' }]
    const slots = generateAvailableSlots(schedule(), busy, { from: MONDAY, to: MONDAY, now: NOW })
    expect(slots.map((s) => s.startsAt)).not.toContain('2026-06-01T15:00:00.000Z')
  })

  it('removes slots inside a blackout', () => {
    const slots = generateAvailableSlots(
      schedule({ blackouts: [{ startsAt: '2026-06-01T13:00:00Z', endsAt: '2026-06-01T17:00:00Z', reason: 'Offsite' }] }),
      [],
      { from: MONDAY, to: MONDAY, now: NOW },
    )
    // The morning is gone; the afternoon survives.
    expect(slots).toHaveLength(4)
    expect(slots[0].startsAt).toBe('2026-06-01T17:00:00.000Z')
  })
})

// 2026 US transitions: forward on March 8, back on November 1.
describe('daylight saving transitions', () => {
  it('does not offer the wall hour that never happens', () => {
    const slots = generateAvailableSlots(
      schedule({ windows: [{ weekday: 0, startMinute: 60, endMinute: 5 * 60 }] }),
      [],
      { from: '2026-03-08', to: '2026-03-08', now: Date.UTC(2026, 1, 1) },
    )
    // 1:00 EST, then 3:00 and 4:00 EDT. 2:00 does not exist that morning.
    expect(slots.map((s) => s.startsAt)).toEqual([
      '2026-03-08T06:00:00.000Z',
      '2026-03-08T07:00:00.000Z',
      '2026-03-08T08:00:00.000Z',
    ])
  })

  it('keeps every slot exactly one hour of real time on the fall-back day', () => {
    const slots = generateAvailableSlots(
      schedule({ windows: [{ weekday: 0, startMinute: 60, endMinute: 5 * 60 }] }),
      [],
      { from: '2026-11-01', to: '2026-11-01', now: Date.UTC(2026, 9, 1) },
    )
    expect(slots.length).toBeGreaterThan(0)
    for (const slot of slots) {
      expect(Date.parse(slot.endsAt) - Date.parse(slot.startsAt)).toBe(3_600_000)
    }
    // The window is a real hour longer that day, so the repeated 1:00 AM does
    // not produce a duplicate offer.
    expect(new Set(slots.map((s) => s.startsAt)).size).toBe(slots.length)
  })

  it('keeps the same wall-clock start before and after a transition', () => {
    const before = generateAvailableSlots(schedule(), [], { from: '2026-03-06', to: '2026-03-06', now: Date.UTC(2026, 1, 1) })
    const after = generateAvailableSlots(schedule(), [], { from: '2026-03-09', to: '2026-03-09', now: Date.UTC(2026, 1, 1) })
    // 9:00 AM local both times, an hour apart in UTC.
    expect(before[0].startsAt).toBe('2026-03-06T14:00:00.000Z')
    expect(after[0].startsAt).toBe('2026-03-09T13:00:00.000Z')
  })
})

describe('schedule normalization', () => {
  it('merges overlapping and adjacent windows on the same day', () => {
    const merged = normalizeWindows([
      { weekday: 1, startMinute: 540, endMinute: 720 },
      { weekday: 1, startMinute: 660, endMinute: 900 },
      { weekday: 1, startMinute: 900, endMinute: 1020 },
      { weekday: 2, startMinute: 540, endMinute: 600 },
    ])
    expect(merged).toEqual([
      { weekday: 1, startMinute: 540, endMinute: 1020 },
      { weekday: 2, startMinute: 540, endMinute: 600 },
    ])
  })

  it('drops windows that are backwards, empty, or on an impossible day', () => {
    expect(normalizeWindows([
      { weekday: 1, startMinute: 720, endMinute: 540 },
      { weekday: 1, startMinute: 540, endMinute: 540 },
      { weekday: 9, startMinute: 540, endMinute: 600 },
      { weekday: -1, startMinute: 540, endMinute: 600 },
    ])).toEqual([])
  })

  it('clamps nonsense config instead of trusting it', () => {
    const normalized = normalizeSchedule({
      ...schedule(),
      timezone: 'Not/AZone',
      slotMinutes: 0,
      incrementMinutes: -30,
      maxAdvanceDays: 9999,
      minNoticeMinutes: -60,
    })
    expect(normalized.timezone).toBe(DEFAULT_SCHEDULE.timezone)
    expect(normalized.slotMinutes).toBeGreaterThanOrEqual(5)
    expect(normalized.incrementMinutes).toBeGreaterThanOrEqual(5)
    expect(normalized.maxAdvanceDays).toBe(365)
    expect(normalized.minNoticeMinutes).toBe(0)
  })

  it('generates nothing when no window is configured', () => {
    expect(generateAvailableSlots(schedule({ windows: [] }), [], { from: MONDAY, to: MONDAY, now: NOW })).toEqual([])
  })
})

describe('booking-time revalidation', () => {
  it('confirms a slot that is still open', () => {
    expect(isSlotBookable(schedule(), [], '2026-06-01T13:00:00.000Z', NOW)).toBe(true)
  })

  it('rejects a slot that was taken since the list was rendered', () => {
    const busy = [{ startsAt: '2026-06-01T13:00:00Z', endsAt: '2026-06-01T14:00:00Z' }]
    expect(isSlotBookable(schedule(), busy, '2026-06-01T13:00:00.000Z', NOW)).toBe(false)
  })

  it('rejects a time that is not on the schedule grid at all', () => {
    expect(isSlotBookable(schedule(), [], '2026-06-01T13:17:00.000Z', NOW)).toBe(false)
    expect(isSlotBookable(schedule(), [], '2026-06-06T13:00:00.000Z', NOW)).toBe(false) // Saturday
  })

  it('rejects an unparseable time rather than throwing', () => {
    expect(isSlotBookable(schedule(), [], 'not-a-time', NOW)).toBe(false)
  })

  it('finds a slot that sits near local midnight', () => {
    const late = schedule({ windows: [{ weekday: 1, startMinute: 23 * 60, endMinute: 1440 }] })
    // 23:00 EDT Monday is 03:00 UTC Tuesday, a different UTC calendar day.
    expect(isSlotBookable(late, [], '2026-06-02T03:00:00.000Z', NOW)).toBe(true)
  })
})

describe('presentation helpers', () => {
  it('round-trips hh:mm', () => {
    expect(parseHhMm('09:00')).toBe(540)
    expect(parseHhMm('9:30')).toBe(570)
    expect(parseHhMm('24:00')).toBe(1440)
    expect(parseHhMm('24:30')).toBeNull()
    expect(parseHhMm('nope')).toBeNull()
    expect(formatHhMm(540)).toBe('09:00')
    expect(formatHhMm(1440)).toBe('24:00')
  })

  it('groups slots into local days', () => {
    const slots = generateAvailableSlots(schedule(), [], { from: MONDAY, to: '2026-06-02', now: NOW })
    const days = groupSlotsByDay(slots, NY)
    expect(days.map((d) => d.dateKey)).toEqual(['2026-06-01', '2026-06-02'])
    expect(days[0].slots).toHaveLength(8)
  })

  it('groups by the viewer timezone, not UTC', () => {
    // 20:00 EDT Monday is 00:00 UTC Tuesday; it must still group under Monday.
    const evening = schedule({ windows: [{ weekday: 1, startMinute: 20 * 60, endMinute: 21 * 60 }] })
    const slots = generateAvailableSlots(evening, [], { from: MONDAY, to: MONDAY, now: NOW })
    expect(slots[0].startsAt).toBe('2026-06-02T00:00:00.000Z')
    expect(groupSlotsByDay(slots, NY)[0].dateKey).toBe('2026-06-01')
  })
})
