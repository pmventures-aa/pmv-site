import { describe, expect, it } from 'vitest'
import {
  computeLocalVendorFeeAdjustment,
  formatVendorFee,
  medianCents,
  parseVendorFeeSettings,
} from '../shared/vendorFeeAdjustment'

describe('vendor fee adjustment', () => {
  const enabled = { enabled: true, maxAdjustmentCents: 1000, downOnly: false }

  it('parses dispatch fee settings with sane defaults', () => {
    expect(parseVendorFeeSettings({})).toEqual({
      enabled: true,
      maxAdjustmentCents: 1000,
      downOnly: false,
    })
    expect(parseVendorFeeSettings({ enabled: '0', down_only: '1', max_adjustment_cents: '2500' })).toEqual({
      enabled: false,
      maxAdjustmentCents: 2500,
      downOnly: true,
    })
  })

  it('computes median payout values', () => {
    expect(medianCents([])).toBeNull()
    expect(medianCents([5000, 7000, 9000])).toBe(7000)
    expect(medianCents([5000, 6000, 7000, 8000])).toBe(6500)
  })

  it('returns catalog base when adjustment is disabled', () => {
    const result = computeLocalVendorFeeAdjustment({
      baseCents: 7500,
      marketMedianCents: 9000,
      sampleSize: 6,
      settings: { enabled: false, maxAdjustmentCents: 1000, downOnly: false },
    })
    expect(result).toEqual({
      adjustmentCents: 0,
      offeredCents: 7500,
      reason: 'Local fee adjustment is off. Using the catalog payout base.',
    })
  })

  it('waits for enough local samples before adjusting', () => {
    const result = computeLocalVendorFeeAdjustment({
      baseCents: 7500,
      marketMedianCents: 9000,
      sampleSize: 2,
      settings: enabled,
      areaLabel: 'Boca Raton, FL',
    })
    expect(result.offeredCents).toBe(7500)
    expect(result.adjustmentCents).toBe(0)
    expect(result.reason).toContain('Not enough recent local payouts')
  })

  it('increases payout up to the max adjustment when local median is higher', () => {
    const result = computeLocalVendorFeeAdjustment({
      baseCents: 7500,
      marketMedianCents: 9200,
      sampleSize: 8,
      settings: enabled,
      areaLabel: 'Boca Raton, FL',
    })
    expect(result.adjustmentCents).toBe(1000)
    expect(result.offeredCents).toBe(8500)
    expect(result.reason).toContain('Locally increased')
  })

  it('caps upward adjustment at the default $10 ceiling', () => {
    const result = computeLocalVendorFeeAdjustment({
      baseCents: 5000,
      marketMedianCents: 12000,
      sampleSize: 10,
      settings: { enabled: true, maxAdjustmentCents: 2000, downOnly: false },
      areaLabel: 'Miami, FL',
    })
    expect(result.adjustmentCents).toBe(1000)
    expect(result.offeredCents).toBe(6000)
  })

  it('reduces payout when local median is lower unless down-only is enabled', () => {
    const reduced = computeLocalVendorFeeAdjustment({
      baseCents: 9000,
      marketMedianCents: 7000,
      sampleSize: 5,
      settings: enabled,
      areaLabel: 'Tampa, FL',
    })
    expect(reduced.adjustmentCents).toBe(-1000)
    expect(reduced.offeredCents).toBe(8000)

    const downOnly = computeLocalVendorFeeAdjustment({
      baseCents: 9000,
      marketMedianCents: 7000,
      sampleSize: 5,
      settings: { enabled: true, maxAdjustmentCents: 1000, downOnly: true },
      areaLabel: 'Tampa, FL',
    })
    expect(downOnly.adjustmentCents).toBe(0)
    expect(downOnly.offeredCents).toBe(9000)
    expect(downOnly.reason).toContain('down-only')
  })

  it('formats vendor fees for display', () => {
    expect(formatVendorFee(null)).toBe('Not set')
    expect(formatVendorFee(8500)).toBe('$85.00')
  })
})
