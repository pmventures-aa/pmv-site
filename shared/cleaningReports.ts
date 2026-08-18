// Pure aggregation for cleaning-line reporting. The route fetches the raw job
// rows in a date range and hands them here, so the shaping is deterministic and
// unit tested. No fabricated numbers: every figure is derived from real rows.

import { formatUsd, type CleaningServiceType, type CleaningCounty } from './cleaningPricing'

export interface CleaningReportRow {
  service_type: string
  county: string
  status: string
  client_total_cents: number
  vendor_payout_cents: number
}

export interface CleaningBreakdown {
  key: string
  label: string
  count: number
  revenueCents: number
}

export interface CleaningReport {
  jobCount: number
  completedCount: number
  cancelledCount: number
  bookedRevenueCents: number
  completedRevenueCents: number
  vendorCostCents: number
  grossMarginCents: number
  grossMarginPercent: number
  averageTicketCents: number
  completionRate: number
  strCount: number
  residentialCount: number
  byCounty: CleaningBreakdown[]
  byService: CleaningBreakdown[]
}

const SERVICE_LABELS: Record<CleaningServiceType, string> = {
  str_turnover: 'Airbnb / STR turnover',
  residential_standard: 'Home cleaning',
  deep: 'Deep cleaning',
  move_in_out: 'Move-in / move-out',
}
const COUNTY_LABELS: Record<CleaningCounty, string> = {
  miami_dade: 'Miami-Dade',
  broward: 'Broward',
  palm_beach: 'Palm Beach',
}

const serviceLabel = (k: string) => SERVICE_LABELS[k as CleaningServiceType] ?? k
const countyLabel = (k: string) => COUNTY_LABELS[k as CleaningCounty] ?? k

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0)

export function summarizeCleaningJobs(rows: CleaningReportRow[]): CleaningReport {
  let bookedRevenueCents = 0
  let completedRevenueCents = 0
  let vendorCostCents = 0
  let completedCount = 0
  let cancelledCount = 0
  let strCount = 0
  let residentialCount = 0
  const county = new Map<string, CleaningBreakdown>()
  const service = new Map<string, CleaningBreakdown>()

  for (const r of rows) {
    const cancelled = r.status === 'cancelled'
    if (cancelled) cancelledCount += 1
    else bookedRevenueCents += r.client_total_cents
    if (r.status === 'completed') {
      completedCount += 1
      completedRevenueCents += r.client_total_cents
      vendorCostCents += r.vendor_payout_cents
    }
    if (r.service_type === 'str_turnover') strCount += 1
    else residentialCount += 1

    if (!cancelled) {
      const cb = county.get(r.county) ?? { key: r.county, label: countyLabel(r.county), count: 0, revenueCents: 0 }
      cb.count += 1; cb.revenueCents += r.client_total_cents; county.set(r.county, cb)
      const sb = service.get(r.service_type) ?? { key: r.service_type, label: serviceLabel(r.service_type), count: 0, revenueCents: 0 }
      sb.count += 1; sb.revenueCents += r.client_total_cents; service.set(r.service_type, sb)
    }
  }

  const grossMarginCents = completedRevenueCents - vendorCostCents
  const nonCancelled = rows.length - cancelledCount

  return {
    jobCount: rows.length,
    completedCount,
    cancelledCount,
    bookedRevenueCents,
    completedRevenueCents,
    vendorCostCents,
    grossMarginCents,
    grossMarginPercent: pct(grossMarginCents, completedRevenueCents),
    averageTicketCents: completedCount > 0 ? Math.round(completedRevenueCents / completedCount) : 0,
    completionRate: pct(completedCount, nonCancelled),
    strCount,
    residentialCount,
    byCounty: [...county.values()].sort((a, b) => b.revenueCents - a.revenueCents),
    byService: [...service.values()].sort((a, b) => b.revenueCents - a.revenueCents),
  }
}

export { formatUsd }
