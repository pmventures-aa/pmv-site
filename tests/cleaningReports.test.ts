import { describe, expect, it } from 'vitest'
import { summarizeCleaningJobs, type CleaningReportRow } from '../shared/cleaningReports'

const row = (over: Partial<CleaningReportRow>): CleaningReportRow => ({
  service_type: 'residential_standard',
  county: 'broward',
  status: 'completed',
  client_total_cents: 13900,
  vendor_payout_cents: 9730,
  ...over,
})

describe('cleaning reporting summary', () => {
  it('separates booked from completed revenue and excludes cancelled', () => {
    const r = summarizeCleaningJobs([
      row({ status: 'completed', client_total_cents: 13900, vendor_payout_cents: 9730 }),
      row({ status: 'scheduled', client_total_cents: 16900 }),
      row({ status: 'cancelled', client_total_cents: 20000 }),
    ])
    expect(r.jobCount).toBe(3)
    expect(r.cancelledCount).toBe(1)
    // booked = non-cancelled totals (13900 + 16900)
    expect(r.bookedRevenueCents).toBe(30800)
    expect(r.completedRevenueCents).toBe(13900)
    expect(r.vendorCostCents).toBe(9730)
    expect(r.grossMarginCents).toBe(13900 - 9730)
  })

  it('computes average ticket and completion rate', () => {
    const r = summarizeCleaningJobs([
      row({ status: 'completed', client_total_cents: 10000 }),
      row({ status: 'completed', client_total_cents: 20000 }),
      row({ status: 'scheduled' }),
      row({ status: 'cancelled' }),
    ])
    expect(r.completedCount).toBe(2)
    expect(r.averageTicketCents).toBe(15000)
    // completion rate = completed / non-cancelled = 2/3
    expect(r.completionRate).toBeCloseTo(66.7, 1)
  })

  it('breaks down by county and service and counts STR vs residential', () => {
    const r = summarizeCleaningJobs([
      row({ service_type: 'str_turnover', county: 'miami_dade', client_total_cents: 10900 }),
      row({ service_type: 'residential_standard', county: 'broward', client_total_cents: 13900 }),
      row({ service_type: 'deep', county: 'broward', client_total_cents: 26900 }),
    ])
    expect(r.strCount).toBe(1)
    expect(r.residentialCount).toBe(2)
    expect(r.byCounty[0].key).toBe('broward') // highest revenue first
    expect(r.byCounty.find((c) => c.key === 'broward')?.count).toBe(2)
    expect(r.byService.map((s) => s.key)).toContain('deep')
  })

  it('handles an empty range without dividing by zero', () => {
    const r = summarizeCleaningJobs([])
    expect(r.jobCount).toBe(0)
    expect(r.averageTicketCents).toBe(0)
    expect(r.completionRate).toBe(0)
    expect(r.grossMarginPercent).toBe(0)
  })
})
