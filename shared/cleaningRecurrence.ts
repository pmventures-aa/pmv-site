// Pure date math for recurring cleaning plans. Kept free of Date-locale
// surprises by working on YYYY-MM-DD strings in UTC, so it is deterministic and
// testable and matches the DATE columns in the database.

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly'

export const FREQUENCY_INTERVAL_DAYS: Record<RecurringFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 28, // four-week cadence keeps a stable weekday for cleaner routing
}

export function isRecurringFrequency(value: unknown): value is RecurringFrequency {
  return value === 'weekly' || value === 'biweekly' || value === 'monthly'
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** Add whole days to a YYYY-MM-DD string, returning a YYYY-MM-DD string. */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const base = Date.UTC(y, m - 1, d)
  return new Date(base + days * 86400000).toISOString().slice(0, 10)
}

/** The next occurrence date after `fromDate` for a frequency. */
export function nextOccurrenceDate(frequency: RecurringFrequency, fromDate: string): string {
  return addDays(fromDate, FREQUENCY_INTERVAL_DAYS[frequency])
}

export function frequencyLabel(frequency: RecurringFrequency): string {
  return frequency === 'weekly' ? 'Weekly' : frequency === 'biweekly' ? 'Every two weeks' : 'Monthly'
}

export function todayKeyUtc(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10)
}
