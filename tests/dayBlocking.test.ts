import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  WEEKDAY_INITIALS,
  blackoutsForDay,
  blockingIdsForDay,
  dayBlockState,
  firstOfMonth,
  groupConsecutive,
  isPast,
  monthGrid,
  shiftMonth,
  todayKeyIn,
  type BlackoutSpan,
} from '../shared/dayBlocking'

const TZ = 'America/New_York'

/** A whole day off, the way the Block button writes it. */
function fullDay(id: string, dateKey: string, nextKey: string): BlackoutSpan {
  return { id, startsAt: `${dateKey}T04:00:00.000Z`, endsAt: `${nextKey}T04:00:00.000Z` }
}

describe('what a day looks like on the grid', () => {
  const blocked = fullDay('b1', '2026-03-10', '2026-03-11')

  it('reports a free day as free', () => {
    expect(dayBlockState('2026-03-09', [blocked], TZ)).toBe('free')
    expect(dayBlockState('2026-03-11', [blocked], TZ)).toBe('free')
  })

  it('reports a day covered end to end as full', () => {
    expect(dayBlockState('2026-03-10', [blocked], TZ)).toBe('full')
  })

  // A two-hour block must not make the day look unbookable, or the calendar
  // is lying about what a client can still take.
  it('reports an afternoon off as partial, not full', () => {
    const afternoon: BlackoutSpan = { id: 'b2', startsAt: '2026-03-12T18:00:00.000Z', endsAt: '2026-03-12T21:00:00.000Z' }
    expect(dayBlockState('2026-03-12', [afternoon], TZ)).toBe('partial')
  })

  // Two abutting halves are not evidence that anyone meant a whole day, and
  // calling them full would hide a gap the schedule would still offer.
  it('does not add two half-days up into a full one', () => {
    const spans: BlackoutSpan[] = [
      { id: 'a', startsAt: '2026-03-13T05:00:00.000Z', endsAt: '2026-03-13T17:00:00.000Z' },
      { id: 'b', startsAt: '2026-03-13T17:00:00.000Z', endsAt: '2026-03-14T04:00:00.000Z' },
    ]
    expect(dayBlockState('2026-03-13', spans, TZ)).toBe('partial')
  })

  it('ignores spans with unparseable dates instead of throwing', () => {
    const junk: BlackoutSpan = { id: 'x', startsAt: 'not a date', endsAt: 'also not' }
    expect(dayBlockState('2026-03-10', [junk], TZ)).toBe('free')
    expect(blackoutsForDay('2026-03-10', [junk], TZ)).toEqual([])
  })

  it('names every row that has to go for the day to be free', () => {
    const spans: BlackoutSpan[] = [
      fullDay('week', '2026-03-09', '2026-03-16'),
      { id: 'lunch', startsAt: '2026-03-10T16:00:00.000Z', endsAt: '2026-03-10T17:00:00.000Z' },
      fullDay('other', '2026-04-01', '2026-04-02'),
    ]
    expect(blockingIdsForDay('2026-03-10', spans, TZ)).toEqual(['week', 'lunch'])
    expect(blockingIdsForDay('2026-04-01', spans, TZ)).toEqual(['other'])
  })

  // The whole point of resolving in the schedule's zone: the same instant is
  // a different calendar day depending on where you read it.
  it('resolves the day in the schedule zone, not the reader zone', () => {
    // 2026-03-11T02:00Z is still the 10th in New York.
    const lateNight: BlackoutSpan = { id: 'z', startsAt: '2026-03-11T02:00:00.000Z', endsAt: '2026-03-11T03:00:00.000Z' }
    expect(dayBlockState('2026-03-10', [lateNight], TZ)).toBe('partial')
    expect(dayBlockState('2026-03-11', [lateNight], TZ)).toBe('free')
    expect(dayBlockState('2026-03-11', [lateNight], 'UTC')).toBe('partial')
  })
})

describe('the month grid', () => {
  it('lays a month out Sunday first with the right lead padding', () => {
    // March 1 2026 is a Sunday, so no lead cells.
    const march = monthGrid('2026-03-17')
    expect(march.anchor).toBe('2026-03-01')
    expect(march.label).toBe('March 2026')
    expect(march.weeks[0][0]).toBe('2026-03-01')

    // April 1 2026 is a Wednesday: three blanks first.
    const april = monthGrid('2026-04-20')
    expect(april.weeks[0].slice(0, 3)).toEqual([null, null, null])
    expect(april.weeks[0][3]).toBe('2026-04-01')
  })

  it('always renders six whole weeks so the grid never reflows', () => {
    for (const key of ['2026-02-01', '2026-03-01', '2026-04-01', '2026-12-01', '2024-02-01']) {
      const grid = monthGrid(key)
      expect(grid.weeks).toHaveLength(6)
      for (const week of grid.weeks) expect(week).toHaveLength(7)
    }
  })

  it('gets month lengths right, leap years included', () => {
    const days = (key: string) => monthGrid(key).weeks.flat().filter(Boolean).length
    expect(days('2026-02-01')).toBe(28)
    expect(days('2024-02-01')).toBe(29)
    expect(days('2026-04-01')).toBe(30)
    expect(days('2026-12-01')).toBe(31)
  })

  it('steps months and rolls over years in both directions', () => {
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01')
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01')
    expect(shiftMonth('2026-03-17', 0)).toBe('2026-03-01')
    expect(shiftMonth('2026-06-01', 12)).toBe('2027-06-01')
    expect(shiftMonth('2026-06-01', -12)).toBe('2025-06-01')
  })

  it('snaps any day to the first of its month', () => {
    expect(firstOfMonth('2026-03-31')).toBe('2026-03-01')
    expect(firstOfMonth('2026-03-01')).toBe('2026-03-01')
  })

  it('labels seven weekday columns', () => {
    expect(WEEKDAY_INITIALS).toHaveLength(7)
  })
})

// Clicking five days in a line means "I am away that week", not five
// separate entries the user then deletes one at a time.
describe('collapsing picked days into blocks', () => {
  it('turns a run into one range with an exclusive end', () => {
    expect(groupConsecutive(['2026-03-02', '2026-03-03', '2026-03-04'])).toEqual([
      { from: '2026-03-02', toExclusive: '2026-03-05', days: 3 },
    ])
  })

  it('keeps separate days separate', () => {
    const ranges = groupConsecutive(['2026-03-02', '2026-03-05'])
    expect(ranges).toHaveLength(2)
    expect(ranges.map((r) => r.days)).toEqual([1, 1])
  })

  it('sorts and de-duplicates whatever order they were clicked in', () => {
    expect(groupConsecutive(['2026-03-04', '2026-03-02', '2026-03-03', '2026-03-02'])).toEqual([
      { from: '2026-03-02', toExclusive: '2026-03-05', days: 3 },
    ])
  })

  it('walks across a month boundary as one run', () => {
    expect(groupConsecutive(['2026-03-30', '2026-03-31', '2026-04-01'])).toEqual([
      { from: '2026-03-30', toExclusive: '2026-04-02', days: 3 },
    ])
  })

  it('returns nothing for nothing', () => {
    expect(groupConsecutive([])).toEqual([])
  })
})

describe('past days', () => {
  const now = Date.parse('2026-03-10T15:00:00.000Z')

  it('cannot be blocked, because there is nothing left to remove', () => {
    expect(isPast('2026-03-09', TZ, now)).toBe(true)
    expect(isPast('2026-03-10', TZ, now)).toBe(false)
    expect(isPast('2026-03-11', TZ, now)).toBe(false)
  })

  it('reads today in the schedule zone', () => {
    expect(todayKeyIn(TZ, now)).toBe('2026-03-10')
    // 03:00Z on the 11th is still the 10th in New York.
    expect(todayKeyIn(TZ, Date.parse('2026-03-11T03:00:00.000Z'))).toBe('2026-03-10')
  })
})

describe('the settings page uses it', () => {
  const page = readFileSync(new URL('../src/pages/admin/settings/ConsultationBookingSettings.tsx', import.meta.url), 'utf8')

  it('renders the calendar with the schedule zone, not the browser zone', () => {
    expect(page).toContain("from '../../../../shared/dayBlocking'")
    expect(page).toContain('<BlockCalendar')
    expect(page).toContain('timezone={schedule.timezone}')
  })

  it('keeps the older ways of blocking a day', () => {
    expect(page).toContain('blockDays')
    expect(page).toContain('Block part of a day instead')
  })

  it('writes one blackout per contiguous run and can free a day again', () => {
    expect(page).toContain('async function blockRanges')
    expect(page).toContain('async function unblockDay')
    expect(page).toContain('onUnblockDay={unblockDay}')
  })
})
