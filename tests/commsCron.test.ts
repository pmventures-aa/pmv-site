import { describe, expect, it } from 'vitest'
import { nextOccurrence } from '../scripts/comms-cron.mjs'

describe('comms cron nextOccurrence', () => {
  it('clamps monthly recurrence so Jan 31 does not skip February', () => {
    expect(nextOccurrence('2026-01-31T16:00:00.000Z', 'monthly')).toBe('2026-02-28T16:00:00.000Z')
    expect(nextOccurrence('2024-01-31T16:00:00.000Z', 'monthly')).toBe('2024-02-29T16:00:00.000Z')
  })

  it('advances daily and weekly by fixed UTC intervals', () => {
    expect(nextOccurrence('2026-08-13T16:00:00.000Z', 'daily')).toBe('2026-08-14T16:00:00.000Z')
    expect(nextOccurrence('2026-08-13T16:00:00.000Z', 'weekly')).toBe('2026-08-20T16:00:00.000Z')
  })
})
