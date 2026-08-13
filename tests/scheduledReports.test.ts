import { describe, expect, it } from 'vitest'
import { nextScheduledReportRun } from '../functions/_lib/scheduledReports'

describe('nextScheduledReportRun', () => {
  it('preserves Sunday (day 0) instead of coercing it to Monday', () => {
    // Thursday 2026-08-13 10:00 ET ≈ 14:00 UTC during EDT
    const from = new Date('2026-08-13T14:00:00.000Z')
    const next = nextScheduledReportRun('weekly', '08:00', 0, from)
    expect(next).toBeTruthy()
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(next!))
    const values = Object.fromEntries(parts.map((p) => [p.type, p.value]))
    expect(values.weekday).toBe('Sun')
    expect(`${values.year}-${values.month}-${values.day}`).toBe('2026-08-16')
  })

  it('still schedules Monday when day is 1', () => {
    const from = new Date('2026-08-13T14:00:00.000Z')
    const next = nextScheduledReportRun('weekly', '08:00', 1, from)
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
    }).formatToParts(new Date(next!))
    expect(parts.find((p) => p.type === 'weekday')?.value).toBe('Mon')
  })
})
