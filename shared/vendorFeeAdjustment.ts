export const DEFAULT_MAX_VENDOR_FEE_ADJUSTMENT_CENTS = 1000

export type VendorFeeSettings = {
  enabled: boolean
  maxAdjustmentCents: number
  downOnly: boolean
}

export type VendorFeeEstimate = {
  baseCents: number
  adjustmentCents: number
  offeredCents: number
  reason: string
  marketMedianCents: number | null
  sampleSize: number
  settings: VendorFeeSettings
}

export function parseVendorFeeSettings(raw: {
  enabled?: string | null
  max_adjustment_cents?: string | null
  down_only?: string | null
}): VendorFeeSettings {
  const maxRaw = Number(raw.max_adjustment_cents)
  return {
    enabled: raw.enabled !== '0',
    maxAdjustmentCents: Number.isFinite(maxRaw) && maxRaw > 0
      ? Math.min(5000, Math.round(maxRaw))
      : DEFAULT_MAX_VENDOR_FEE_ADJUSTMENT_CENTS,
    downOnly: raw.down_only === '1',
  }
}

export function medianCents(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

export function computeLocalVendorFeeAdjustment(input: {
  baseCents: number
  marketMedianCents: number | null
  sampleSize: number
  settings: VendorFeeSettings
  areaLabel?: string | null
}): Pick<VendorFeeEstimate, 'adjustmentCents' | 'offeredCents' | 'reason'> {
  const baseCents = Math.max(0, Math.round(input.baseCents))
  if (!input.settings.enabled || baseCents <= 0) {
    return {
      adjustmentCents: 0,
      offeredCents: baseCents,
      reason: 'Local fee adjustment is off. Using the catalog payout base.',
    }
  }

  const median = input.marketMedianCents
  if (!median || input.sampleSize < 3) {
    return {
      adjustmentCents: 0,
      offeredCents: baseCents,
      reason: input.sampleSize > 0
        ? 'Not enough recent local payouts yet to adjust this fee.'
        : 'No recent local payouts on record yet. Using the catalog payout base.',
    }
  }

  const gap = median - baseCents
  const area = input.areaLabel?.trim() || 'this area'
  if (Math.abs(gap) < 250) {
    return {
      adjustmentCents: 0,
      offeredCents: baseCents,
      reason: `Recent payouts near ${area} are already close to the catalog base.`,
    }
  }

  let adjustment = 0
  if (gap > 0) {
    adjustment = Math.min(input.settings.maxAdjustmentCents, gap)
    adjustment = Math.min(adjustment, DEFAULT_MAX_VENDOR_FEE_ADJUSTMENT_CENTS)
  } else if (!input.settings.downOnly) {
    adjustment = -Math.min(input.settings.maxAdjustmentCents, Math.abs(gap))
    adjustment = Math.max(adjustment, -DEFAULT_MAX_VENDOR_FEE_ADJUSTMENT_CENTS)
  }

  if (adjustment === 0) {
    return {
      adjustmentCents: 0,
      offeredCents: baseCents,
      reason: input.settings.downOnly
        ? `Recent payouts near ${area} are lower, but down-only adjustment is enabled.`
        : `Recent payouts near ${area} are already close to the catalog base.`,
    }
  }

  const direction = adjustment > 0 ? 'increased' : 'reduced'
  return {
    adjustmentCents: adjustment,
    offeredCents: Math.max(0, baseCents + adjustment),
    reason: `Locally ${direction} by $${(Math.abs(adjustment) / 100).toFixed(0)} based on ${input.sampleSize} recent payouts near ${area}.`,
  }
}

export function formatVendorFee(cents: number | null | undefined): string {
  if (!cents || cents <= 0) return 'Not set'
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}
