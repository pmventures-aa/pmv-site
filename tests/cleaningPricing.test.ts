import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CLEANING_CONFIG,
  priceCleaning,
  parseCleaningConfig,
  selectTier,
  startingPrices,
  toCustomerQuote,
  type CleaningQuoteInput,
} from '../shared/cleaningPricing'

const cfg = DEFAULT_CLEANING_CONFIG

function quote(input: Partial<CleaningQuoteInput> & Pick<CleaningQuoteInput, 'service'>) {
  return priceCleaning(cfg, { county: 'broward', bedrooms: 2, ...input })
}

describe('cleaning pricing - launch tiers', () => {
  it('exposes the brief starting prices per service', () => {
    const s = startingPrices(cfg)
    expect(s.str_turnover).toBe(8900)
    expect(s.residential_standard).toBe(11900)
    expect(s.deep).toBe(18900)
    expect(s.move_in_out).toBe(21900)
  })

  it('selects the right STR turnover tier by bedroom count', () => {
    const str = cfg.services.find((s) => s.key === 'str_turnover')!
    expect(selectTier(str, 1)?.fromCents).toBe(8900)
    expect(selectTier(str, 2)?.fromCents).toBe(10900)
    expect(selectTier(str, 3)?.fromCents).toBe(13900)
    expect(selectTier(str, 4)?.fromCents).toBe(16900)
    expect(selectTier(str, 5)?.fromCents).toBe(20900)
    expect(selectTier(str, 7)?.fromCents).toBe(null) // 6+ estate = custom
  })

  it('prices a clean 2BR Fort Lauderdale STR turnover at $109 base', () => {
    const r = quote({ service: 'str_turnover', county: 'broward', bedrooms: 2, bathrooms: 1 })
    expect(r.tierLabel).toBe('2 Bedroom')
    expect(r.baseCents).toBe(10900)
    expect(r.totalCents).toBe(10900)
    expect(r.needsReview).toBe(false)
  })

  it('flags 6+ bedroom estates as needs review with no instant price', () => {
    const r = quote({ service: 'str_turnover', bedrooms: 7 })
    expect(r.needsReview).toBe(true)
    expect(r.reviewReasons.join(' ')).toMatch(/custom quote/i)
    expect(r.baseCents).toBe(0)
  })

  it('prices a residential 3BR standard clean at $169', () => {
    const r = quote({ service: 'residential_standard', bedrooms: 3, bathrooms: 1 })
    expect(r.baseCents).toBe(16900)
    expect(r.totalCents).toBe(16900)
  })
})

describe('cleaning pricing - add-ons', () => {
  it('adds inside-refrigerator at $39', () => {
    const r = quote({ service: 'residential_standard', bedrooms: 2, bathrooms: 1, addons: { fridge_interior: true } })
    expect(r.addOnsCents).toBe(3900)
    expect(r.totalCents).toBe(13900 + 3900)
  })

  it('honors the oven+fridge combo and excludes the singles when all are selected', () => {
    const r = quote({
      service: 'residential_standard',
      bedrooms: 2,
      bathrooms: 1,
      addons: { fridge_interior: true, oven_interior: true, oven_fridge_combo: true },
    })
    // Only the $69 combo is charged; the two $39 singles are excluded.
    expect(r.addOnsCents).toBe(6900)
  })

  it('charges per-unit add-ons by the count supplied', () => {
    const r = quote({ service: 'str_turnover', bedrooms: 3, bathrooms: 2, addons: { linen_set: 3 } })
    expect(r.addOnsCents).toBe(1500 * 3)
  })

  it('marks quote-only add-ons (interior windows, restocking) as needs review', () => {
    const r = quote({ service: 'residential_standard', bedrooms: 2, bathrooms: 1, addons: { interior_windows: true } })
    expect(r.needsReview).toBe(true)
    expect(r.reviewReasons.join(' ')).toMatch(/interior windows/i)
    // The base price is still known and shown.
    expect(r.baseCents).toBe(13900)
  })

  it('omits an add-on disabled for a specific county', () => {
    const local = parseCleaningConfig({
      ...cfg,
      addons: cfg.addons.map((a) => (a.key === 'balcony_patio' ? { ...a, disabledCounties: ['miami_dade'] } : a)),
    })
    const r = priceCleaning(local, { service: 'str_turnover', county: 'miami_dade', bedrooms: 2, addons: { balcony_patio: true } })
    expect(r.addOnsCents).toBe(0)
  })
})

describe('cleaning pricing - recurring + promo', () => {
  it('applies the biweekly 10% discount to residential and shows a per-visit rate', () => {
    const r = quote({ service: 'residential_standard', bedrooms: 2, bathrooms: 1, frequency: 'biweekly' })
    // 13900 base, 10% off = 1390 discount => 12510 per visit.
    expect(r.recurringDiscountCents).toBe(1390)
    expect(r.perVisitCents).toBe(12510)
    expect(r.oneTimeCents).toBe(13900)
  })

  it('applies weekly 15% off', () => {
    const r = quote({ service: 'residential_standard', bedrooms: 2, bathrooms: 1, frequency: 'weekly' })
    expect(r.recurringDiscountCents).toBe(2085)
    expect(r.perVisitCents).toBe(11815)
  })

  it('does NOT apply recurring discounts to STR turnovers or deep cleans', () => {
    const str = quote({ service: 'str_turnover', bedrooms: 2, frequency: 'weekly' })
    expect(str.recurringDiscountCents).toBe(0)
    const deep = quote({ service: 'deep', bedrooms: 2, frequency: 'weekly' })
    expect(deep.recurringDiscountCents).toBe(0)
  })

  it('stacks the first-recurring 25% promo on top of the recurring rate', () => {
    const r = quote({ service: 'residential_standard', bedrooms: 2, bathrooms: 1, frequency: 'biweekly', isFirstRecurring: true })
    // After 10% recurring: 12510. Promo 25% of 12510 = 3128 (rounded).
    expect(r.recurringDiscountCents).toBe(1390)
    expect(r.promoDiscountCents).toBe(3128)
    expect(r.perVisitCents).toBe(12510 - 3128)
  })

  it('never applies the promo to a one-time clean', () => {
    const r = quote({ service: 'residential_standard', bedrooms: 2, frequency: 'one_time', isFirstRecurring: true })
    expect(r.promoDiscountCents).toBe(0)
  })
})

describe('cleaning pricing - property adjustments', () => {
  it('charges for extra bathrooms beyond the included one', () => {
    const r = quote({ service: 'residential_standard', bedrooms: 3, bathrooms: 3 })
    // 2 extra baths * $15 = $30 on top of 16900.
    expect(r.totalCents).toBe(16900 + 3000)
  })

  it('charges for square footage over the included threshold', () => {
    const r = quote({ service: 'residential_standard', bedrooms: 2, bathrooms: 1, squareFeet: 1750 })
    // 250 over / 100 = 3 units (ceil) * $4 = $12.
    expect(r.totalCents).toBe(13900 + 1200)
  })

  it('discounts when the client provides supplies', () => {
    const r = quote({ service: 'residential_standard', bedrooms: 2, bathrooms: 1, supplies: 'client' })
    expect(r.totalCents).toBe(13900 - 1000)
  })

  it('raises the base for heavy condition and flags excessive for review', () => {
    const heavy = quote({ service: 'residential_standard', bedrooms: 2, bathrooms: 1, condition: 'heavy' })
    expect(heavy.baseCents).toBe(Math.round(13900 * 1.2))
    const excessive = quote({ service: 'residential_standard', bedrooms: 2, condition: 'excessive' })
    expect(excessive.needsReview).toBe(true)
  })
})

describe('cleaning pricing - margin + payout (internal)', () => {
  it('computes vendor payout at 70% of the base service price', () => {
    const r = quote({ service: 'residential_standard', bedrooms: 2, bathrooms: 1 })
    expect(r.vendorPayoutCents).toBe(Math.round(13900 * 0.7)) // 9730
    expect(r.marginCents).toBe(13900 - 9730)
  })

  it('flags a job that falls below the minimum margin threshold', () => {
    const thin = parseCleaningConfig({
      ...cfg,
      commercial: { ...cfg.commercial, vendorPayoutPercent: 90, minMarginPercent: 20 },
    })
    const r = priceCleaning(thin, { service: 'residential_standard', county: 'broward', bedrooms: 2, bathrooms: 1 })
    expect(r.marginPercent).toBeLessThan(20)
    expect(r.belowMinMargin).toBe(true)
  })

  it('flags a job below the minimum job amount', () => {
    const r = quote({ service: 'str_turnover', bedrooms: 1, supplies: 'client' })
    // 8900 - 1000 supplies = 7900 < 8000 minimum.
    expect(r.belowMinimumJob).toBe(true)
  })

  it('strips payout and margin from the customer-facing quote', () => {
    const r = quote({ service: 'residential_standard', bedrooms: 2, bathrooms: 1 })
    const customer = toCustomerQuote(r) as Record<string, unknown>
    expect(customer.vendorPayoutCents).toBeUndefined()
    expect(customer.marginCents).toBeUndefined()
    expect(customer.marginPercent).toBeUndefined()
    expect(customer.totalCents).toBe(13900)
  })
})

describe('cleaning pricing - config parsing', () => {
  it('falls back to defaults for a partial stored document', () => {
    const parsed = parseCleaningConfig({ version: 3, tax: { enabled: true, percent: 7 } })
    expect(parsed.version).toBe(3)
    expect(parsed.tax).toEqual({ enabled: true, percent: 7 })
    expect(parsed.services.length).toBe(DEFAULT_CLEANING_CONFIG.services.length)
    expect(parsed.commercial.vendorPayoutPercent).toBe(70)
  })

  it('returns defaults for junk input', () => {
    expect(parseCleaningConfig(null).services.length).toBeGreaterThan(0)
    expect(parseCleaningConfig('nope').addons.length).toBeGreaterThan(0)
  })

  it('applies a territory price adjustment to the base', () => {
    const adjusted = parseCleaningConfig({
      ...cfg,
      territories: cfg.territories.map((t) => (t.key === 'palm_beach' ? { ...t, priceAdjustPercent: 10 } : t)),
    })
    const r = priceCleaning(adjusted, { service: 'str_turnover', county: 'palm_beach', bedrooms: 2 })
    expect(r.baseCents).toBe(Math.round(10900 * 1.1))
  })
})
