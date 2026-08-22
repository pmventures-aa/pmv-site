// Calendar-grid logic for blocking days off the consultation schedule.
//
// The settings page already had quick chips (Today, Tomorrow, This weekend)
// and a date-plus-count row. Both require knowing the date before you can
// block it. This module backs the missing third way: look at a month, click
// the days, done - which is how someone actually decides they are away on the
// 3rd, the 7th, and the week of the 15th.
//
// Every date here is a 'YYYY-MM-DD' key resolved in the SCHEDULE'S timezone,
// never the browser's. A block set from a laptop in another state has to mean
// the same day as one set at the desk.

import { addDaysToDateKey, dateKeyWeekday, utcMsToDateKey, zonedWallTimeToUtcMs } from './availability'

export interface BlackoutSpan {
  id: string
  startsAt: string
  endsAt: string
  reason?: string | null
}

/**
 * free    - nothing removed from this day
 * partial - some of the day is gone, but bookable time remains
 * full    - the whole day is gone
 *
 * The distinction matters on the grid: a day with a two-hour block should not
 * look identical to a day that is entirely unavailable, or the calendar is
 * lying about what a client can still book.
 */
export type DayBlockState = 'free' | 'partial' | 'full'

function dayBoundsMs(dateKey: string, timeZone: string): { start: number; end: number } {
  return {
    start: zonedWallTimeToUtcMs(dateKey, 0, timeZone),
    end: zonedWallTimeToUtcMs(addDaysToDateKey(dateKey, 1), 0, timeZone),
  }
}

/** The blackouts touching this day at all, in the order given. */
export function blackoutsForDay(dateKey: string, blackouts: BlackoutSpan[], timeZone: string): BlackoutSpan[] {
  const { start, end } = dayBoundsMs(dateKey, timeZone)
  return blackouts.filter((b) => {
    const from = Date.parse(b.startsAt)
    const to = Date.parse(b.endsAt)
    if (!Number.isFinite(from) || !Number.isFinite(to)) return false
    return from < end && to > start
  })
}

export function dayBlockState(dateKey: string, blackouts: BlackoutSpan[], timeZone: string): DayBlockState {
  const touching = blackoutsForDay(dateKey, blackouts, timeZone)
  if (!touching.length) return 'free'
  const { start, end } = dayBoundsMs(dateKey, timeZone)
  // A single span covering the day end to end is the common case (that is what
  // "block this day" writes). Two abutting half-day blocks that happen to add
  // up are deliberately reported as partial: nothing in the data says they
  // were meant as one, and calling them full would let a stale pair hide a
  // gap the schedule would still offer.
  const covered = touching.some((b) => Date.parse(b.startsAt) <= start && Date.parse(b.endsAt) >= end)
  return covered ? 'full' : 'partial'
}

/** The blackout rows that would have to be removed to free this day. */
export function blockingIdsForDay(dateKey: string, blackouts: BlackoutSpan[], timeZone: string): string[] {
  return blackoutsForDay(dateKey, blackouts, timeZone).map((b) => b.id)
}

// ---------------------------------------------------------------- the grid

export interface MonthGrid {
  /** First of the month, as a date key. */
  anchor: string
  label: string
  /** Six rows of seven, Sunday first. Days outside the month are null. */
  weeks: (string | null)[][]
}

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function firstOfMonth(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`
}

export function shiftMonth(dateKey: string, delta: number): string {
  const [year, month] = dateKey.split('-').map(Number)
  const zeroBased = (year * 12) + (month - 1) + delta
  const nextYear = Math.floor(zeroBased / 12)
  const nextMonth = (zeroBased % 12) + 1
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`
}

export function monthGrid(dateKey: string): MonthGrid {
  const anchor = firstOfMonth(dateKey)
  const [year, month] = anchor.split('-').map(Number)
  const lead = dateKeyWeekday(anchor)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const cells: (string | null)[] = []
  for (let i = 0; i < lead; i += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${anchor.slice(0, 8)}${String(day).padStart(2, '0')}`)
  }
  // Pad to whole weeks so the grid never reflows as months change height.
  while (cells.length % 7 !== 0) cells.push(null)
  while (cells.length < 42) cells.push(null)

  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return { anchor, label: `${MONTH_LABELS[month - 1]} ${year}`, weeks }
}

export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

// ---------------------------------------------------------------- selection

export interface DayRange {
  from: string
  /** The day AFTER the last blocked day, matching the API's exclusive end. */
  toExclusive: string
  days: number
}

/**
 * Collapses picked days into contiguous runs.
 *
 * Selecting Monday through Friday should write ONE row that reads "Mar 2 to
 * Mar 6", not five rows the user then has to delete one at a time. Runs are
 * what a person means when they click five days in a line.
 */
export function groupConsecutive(dateKeys: string[]): DayRange[] {
  const sorted = [...new Set(dateKeys)].sort()
  const ranges: DayRange[] = []
  for (const key of sorted) {
    const open = ranges[ranges.length - 1]
    if (open && open.toExclusive === key) {
      open.toExclusive = addDaysToDateKey(key, 1)
      open.days += 1
    } else {
      ranges.push({ from: key, toExclusive: addDaysToDateKey(key, 1), days: 1 })
    }
  }
  return ranges
}

export function todayKeyIn(timeZone: string, now: number = Date.now()): string {
  return utcMsToDateKey(now, timeZone)
}

/** Past days cannot be blocked; there is nothing left to remove. */
export function isPast(dateKey: string, timeZone: string, now: number = Date.now()): boolean {
  return dateKey < todayKeyIn(timeZone, now)
}
