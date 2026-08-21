import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addDaysToDateKey, utcMsToDateKey, zonedWallTimeToUtcMs } from '../shared/availability'

const ui = readFileSync(new URL('../src/pages/admin/settings/ConsultationBookingSettings.tsx', import.meta.url), 'utf8')

// Blocking a day meant typing two datetime-local values, and both were read in
// the BROWSER's timezone rather than the schedule's, so the same input meant
// different hours depending on where the admin was standing.

describe('blocking whole days', () => {
  it('offers one-tap blocks for the common cases', () => {
    expect(ui).toContain("['Today'")
    expect(ui).toContain("['Tomorrow'")
    expect(ui).toContain("['This weekend'")
    expect(ui).toContain("['Next week'")
  })

  it('takes a date and a day count rather than two timestamps', () => {
    expect(ui).toContain('type="date"')
    expect(ui).toContain('blockDays(dayDraft.date, dayDraft.days, dayDraft.reason)')
  })

  it('will not offer a past date', () => {
    expect(ui).toContain('min={todayKey(schedule.timezone)}')
  })

  it('keeps partial-day entry available, just not first', () => {
    expect(ui).toContain('Block part of a day instead')
    expect(ui).toContain('type="datetime-local"')
  })
})

describe('days mean days in the schedule zone', () => {
  it('resolves both entry paths through the schedule timezone', () => {
    expect(ui).toContain('dayStartIso(dateKey, schedule.timezone)')
    expect(ui).toContain('wallTimeToIso(blackoutDraft.startsAt, schedule.timezone)')
    // The browser-zone reading is gone from both.
    expect(ui).not.toContain('new Date(blackoutDraft.startsAt).toISOString()')
  })

  it('rejects an unparseable time rather than posting an Invalid Date', () => {
    expect(ui).toContain("setError('Enter a valid start and end time.')")
  })
})

describe('the day arithmetic the UI relies on', () => {
  const tz = 'America/New_York'

  it('spans exactly one local day', () => {
    const start = zonedWallTimeToUtcMs('2026-08-25', 0, tz)
    const end = zonedWallTimeToUtcMs(addDaysToDateKey('2026-08-25', 1), 0, tz)
    expect((end - start) / 3_600_000).toBe(24)
    expect(utcMsToDateKey(start, tz)).toBe('2026-08-25')
  })

  it('stays a real day across the spring-forward boundary', () => {
    // 2026-03-08 is 23 hours long in New York. A day block has to cover the
    // whole civil day, not a fixed 24 hours from midnight.
    const start = zonedWallTimeToUtcMs('2026-03-08', 0, tz)
    const end = zonedWallTimeToUtcMs(addDaysToDateKey('2026-03-08', 1), 0, tz)
    expect((end - start) / 3_600_000).toBe(23)
    expect(utcMsToDateKey(end - 1, tz)).toBe('2026-03-08')
  })

  it('stays a real day across the fall-back boundary', () => {
    const start = zonedWallTimeToUtcMs('2026-11-01', 0, tz)
    const end = zonedWallTimeToUtcMs(addDaysToDateKey('2026-11-01', 1), 0, tz)
    expect((end - start) / 3_600_000).toBe(25)
  })

  it('covers a multi-day block end to end', () => {
    const start = zonedWallTimeToUtcMs('2026-08-25', 0, tz)
    const end = zonedWallTimeToUtcMs(addDaysToDateKey('2026-08-25', 3), 0, tz)
    // The last blocked instant is still inside the third day.
    expect(utcMsToDateKey(end - 1, tz)).toBe('2026-08-27')
  })
})

describe('the list reads back as days', () => {
  it('describes blackouts in the schedule zone, not the browser locale default', () => {
    expect(ui).toContain('describeBlackout(b, schedule.timezone)')
    expect(ui).toContain('timeZone: timezone')
    expect(ui).not.toContain('new Date(b.startsAt).toLocaleString()')
  })

  it('names the last blocked day rather than the exclusive end', () => {
    // Stored end is midnight of the following day; showing that raw would read
    // as one day more than was actually blocked.
    expect(ui).toContain("addDaysToDateKey(utcMsToDateKey(endMs, timezone), -1)")
  })
})
