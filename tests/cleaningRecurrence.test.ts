import { describe, expect, it } from 'vitest'
import {
  addDays,
  nextOccurrenceDate,
  isRecurringFrequency,
  isDateKey,
  frequencyLabel,
  FREQUENCY_INTERVAL_DAYS,
} from '../shared/cleaningRecurrence'

describe('cleaning recurrence date math', () => {
  it('adds days across month boundaries in UTC', () => {
    expect(addDays('2026-08-18', 7)).toBe('2026-08-25')
    expect(addDays('2026-08-28', 7)).toBe('2026-09-04')
    expect(addDays('2026-12-30', 7)).toBe('2027-01-06')
  })

  it('computes the next occurrence per frequency', () => {
    expect(nextOccurrenceDate('weekly', '2026-08-18')).toBe('2026-08-25')
    expect(nextOccurrenceDate('biweekly', '2026-08-18')).toBe('2026-09-01')
    expect(nextOccurrenceDate('monthly', '2026-08-18')).toBe('2026-09-15')
  })

  it('keeps the same weekday for weekly/biweekly/monthly', () => {
    const start = '2026-08-18' // Tuesday
    const dow = (k: string) => new Date(`${k}T00:00:00Z`).getUTCDay()
    expect(dow(nextOccurrenceDate('weekly', start))).toBe(dow(start))
    expect(dow(nextOccurrenceDate('biweekly', start))).toBe(dow(start))
    expect(dow(nextOccurrenceDate('monthly', start))).toBe(dow(start))
  })

  it('validates frequencies and date keys', () => {
    expect(isRecurringFrequency('weekly')).toBe(true)
    expect(isRecurringFrequency('one_time')).toBe(false)
    expect(isDateKey('2026-08-18')).toBe(true)
    expect(isDateKey('8/18/2026')).toBe(false)
    expect(FREQUENCY_INTERVAL_DAYS.biweekly).toBe(14)
    expect(frequencyLabel('biweekly')).toBe('Every two weeks')
  })
})
