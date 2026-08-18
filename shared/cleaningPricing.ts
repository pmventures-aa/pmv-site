// Cleaning & Turnover retail pricing engine - the single source of truth for
// every cleaning quote across the public site, HQ, and vendor payout math.
//
// All prices are integer cents. Nothing about the money is hardcoded in the UI:
// the config document below is seeded into the `cleaning_pricing_config` table
// (migration 0084) and HQ edits it without a deployment. The functions here are
// pure so they can be unit tested and run identically on the server (authorative
// quote + payout + margin) and, for customer-safe fields only, in the browser
// calculator.
//
// Retail price and vendor payout are deliberately computed together but exposed
// separately: `priceCleaning()` returns the full internal result including
// payout and margin; `toCustomerQuote()` strips everything a client or an
// unassigned vendor must never see.

export type CleaningServiceType =
  | 'str_turnover'
  | 'residential_standard'
  | 'deep'
  | 'move_in_out'

export type CleaningCounty = 'miami_dade' | 'broward' | 'palm_beach'

export type CleaningFrequency = 'one_time' | 'weekly' | 'biweekly' | 'monthly'

export type CleaningCondition = 'light' | 'standard' | 'heavy' | 'excessive'

export type CleaningSupplies = 'pinnacle' | 'client'

export interface CleaningTier {
  key: string
  label: string
  /** Inclusive bedroom ceiling for this tier; null = open-ended catch-all. */
  maxBedrooms: number | null
  /** Starting price in cents. null = custom / needs review (e.g. 6+ estates). */
  fromCents: number | null
}

export interface CleaningServiceConfig {
  key: CleaningServiceType
  label: string
  enabled: boolean
  /** Recurring frequency discounts apply to this service. */
  recurringEligible: boolean
  tiers: CleaningTier[]
}

export interface CleaningAddon {
  key: string
  label: string
  /** Per-selection price in cents. null = quote / needs review. */
  priceCents: number | null
  enabled: boolean
  /** Counties where this add-on is turned OFF (unavailable). */
  disabledCounties: CleaningCounty[]
  /** true = customer supplies a count and each unit is charged. */
  perUnit: boolean
  /** true = selecting this flips the whole quote to "needs review". */
  needsReview: boolean
  /** Add-ons that cannot be combined with this one (e.g. combo vs singles). */
  excludes: string[]
  hint?: string
}

export interface CleaningFrequencyDiscount {
  key: CleaningFrequency
  label: string
  /** Whole-number percent off the per-visit base+add-on subtotal. */
  percent: number
}

export interface CleaningPromotion {
  id: string
  label: string
  /** Only 'first_recurring_percent' is supported at launch. */
  type: 'first_recurring_percent'
  percent: number
  active: boolean
  /** May combine with a recurring frequency discount. Off by default. */
  stackable: boolean
}

export interface CleaningCommercialConfig {
  /** Default vendor payout as a percent of the base service price. */
  vendorPayoutPercent: number
  /** Target Pinnacle gross margin (informational; drives the health label). */
  targetMarginPercent: number
  /** Below this gross-margin percent a job is flagged for HQ review. */
  minMarginPercent: number
  /** Jobs whose retail total is under this floor are flagged. */
  minimumJobCents: number
}

export interface CleaningTaxConfig {
  enabled: boolean
  percent: number
}

export interface CleaningTerritory {
  key: CleaningCounty
  label: string
  enabled: boolean
  /** Whole-number percent applied to the base service price for this zone. */
  priceAdjustPercent: number
}

export interface CleaningConditionMultiplier {
  key: CleaningCondition
  label: string
  /** Multiplier on the base service price. 'excessive' also needs review. */
  multiplier: number
}

export interface CleaningPricingConfig {
  version: number
  currency: 'USD'
  territories: CleaningTerritory[]
  services: CleaningServiceConfig[]
  addons: CleaningAddon[]
  frequencyDiscounts: CleaningFrequencyDiscount[]
  conditionMultipliers: CleaningConditionMultiplier[]
  promotions: CleaningPromotion[]
  commercial: CleaningCommercialConfig
  tax: CleaningTaxConfig
  /** Bathrooms included in the base price before the per-extra charge applies. */
  bathroomsIncluded: number
  extraBathroomCents: number
  /** Square footage above this adds the per-100 charge; null disables it. */
  sqftIncluded: number
  extraSqftPer100Cents: number
  /** Client-supplied supplies discount in cents (goodwill for BYO). */
  clientSuppliesDiscountCents: number
}

// ---------------------------------------------------------------------------
// Launch defaults (South Florida, 2026). These are the exact figures from the
// expansion brief. HQ can change any of them without a deploy.
// ---------------------------------------------------------------------------

const D = (cents: number | null) => cents

export const DEFAULT_CLEANING_CONFIG: CleaningPricingConfig = {
  version: 1,
  currency: 'USD',
  territories: [
    { key: 'miami_dade', label: 'Miami-Dade County', enabled: true, priceAdjustPercent: 0 },
    { key: 'broward', label: 'Broward County', enabled: true, priceAdjustPercent: 0 },
    { key: 'palm_beach', label: 'Palm Beach County', enabled: true, priceAdjustPercent: 0 },
  ],
  services: [
    {
      key: 'str_turnover',
      label: 'Airbnb / Vacation Rental Turnover',
      enabled: true,
      recurringEligible: false,
      tiers: [
        { key: 'studio_1br', label: 'Studio / 1 Bedroom', maxBedrooms: 1, fromCents: D(8900) },
        { key: 'br2', label: '2 Bedroom', maxBedrooms: 2, fromCents: D(10900) },
        { key: 'br3', label: '3 Bedroom', maxBedrooms: 3, fromCents: D(13900) },
        { key: 'br4', label: '4 Bedroom', maxBedrooms: 4, fromCents: D(16900) },
        { key: 'br5', label: '5 Bedroom', maxBedrooms: 5, fromCents: D(20900) },
        { key: 'br6_plus', label: '6+ Bedroom / Luxury / Estate', maxBedrooms: null, fromCents: null },
      ],
    },
    {
      key: 'residential_standard',
      label: 'Recurring & One-Time Home Cleaning',
      enabled: true,
      recurringEligible: true,
      tiers: [
        { key: 'studio_1br', label: 'Studio / 1 Bedroom', maxBedrooms: 1, fromCents: D(11900) },
        { key: 'br2', label: '2 Bedroom', maxBedrooms: 2, fromCents: D(13900) },
        { key: 'br3', label: '3 Bedroom', maxBedrooms: 3, fromCents: D(16900) },
        { key: 'br4', label: '4 Bedroom', maxBedrooms: 4, fromCents: D(19900) },
        { key: 'br5_plus', label: '5+ Bedroom', maxBedrooms: null, fromCents: D(23900) },
      ],
    },
    {
      key: 'deep',
      label: 'Deep Cleaning',
      enabled: true,
      recurringEligible: false,
      tiers: [
        { key: 'studio_1br', label: 'Studio / 1 Bedroom', maxBedrooms: 1, fromCents: D(18900) },
        { key: 'br2', label: '2 Bedroom', maxBedrooms: 2, fromCents: D(22900) },
        { key: 'br3', label: '3 Bedroom', maxBedrooms: 3, fromCents: D(26900) },
        { key: 'br4', label: '4 Bedroom', maxBedrooms: 4, fromCents: D(31900) },
        { key: 'br5_plus', label: '5+ Bedroom', maxBedrooms: null, fromCents: D(37900) },
      ],
    },
    {
      key: 'move_in_out',
      label: 'Move-In / Move-Out Cleaning',
      enabled: true,
      recurringEligible: false,
      // No launch figure was specified for move-in/out; these default a step
      // above deep cleaning (heavier, empty-home detail) and are fully editable.
      tiers: [
        { key: 'studio_1br', label: 'Studio / 1 Bedroom', maxBedrooms: 1, fromCents: D(21900) },
        { key: 'br2', label: '2 Bedroom', maxBedrooms: 2, fromCents: D(25900) },
        { key: 'br3', label: '3 Bedroom', maxBedrooms: 3, fromCents: D(30900) },
        { key: 'br4', label: '4 Bedroom', maxBedrooms: 4, fromCents: D(35900) },
        { key: 'br5_plus', label: '5+ Bedroom', maxBedrooms: null, fromCents: D(42900) },
      ],
    },
  ],
  addons: [
    { key: 'fridge_interior', label: 'Inside refrigerator', priceCents: 3900, enabled: true, disabledCounties: [], perUnit: false, needsReview: false, excludes: [] },
    { key: 'oven_interior', label: 'Inside oven', priceCents: 3900, enabled: true, disabledCounties: [], perUnit: false, needsReview: false, excludes: [] },
    // The combo takes precedence: when selected it removes the two singles so a
    // customer who taps all three is charged the single $69 combo, not $147.
    { key: 'oven_fridge_combo', label: 'Inside oven + refrigerator', priceCents: 6900, enabled: true, disabledCounties: [], perUnit: false, needsReview: false, excludes: ['fridge_interior', 'oven_interior'] },
    { key: 'laundry', label: 'Laundry / linen processing', priceCents: 2500, enabled: true, disabledCounties: [], perUnit: false, needsReview: false, excludes: [], hint: 'From $25 per load.' },
    { key: 'linen_set', label: 'Extra linen set / bed', priceCents: 1500, enabled: true, disabledCounties: [], perUnit: true, needsReview: false, excludes: [], hint: 'Per additional made bed.' },
    { key: 'balcony_patio', label: 'Balcony / patio', priceCents: 2500, enabled: true, disabledCounties: [], perUnit: false, needsReview: false, excludes: [] },
    { key: 'heavy_pet_hair', label: 'Heavy pet hair', priceCents: 3000, enabled: true, disabledCounties: [], perUnit: false, needsReview: false, excludes: [] },
    { key: 'same_day_rush', label: 'Same-day / rush', priceCents: 2500, enabled: true, disabledCounties: [], perUnit: false, needsReview: false, excludes: [] },
    { key: 'cabinet_interiors', label: 'Inside cabinets', priceCents: 3500, enabled: true, disabledCounties: [], perUnit: false, needsReview: false, excludes: [] },
    { key: 'interior_windows', label: 'Interior windows', priceCents: null, enabled: true, disabledCounties: [], perUnit: false, needsReview: true, excludes: [], hint: 'Quoted by window count.' },
    { key: 'restocking', label: 'Supply restocking', priceCents: null, enabled: true, disabledCounties: [], perUnit: false, needsReview: true, excludes: [], hint: 'Merchandise cost plus a service charge, confirmed before purchase.' },
    { key: 'excessive_condition', label: 'Excessive condition', priceCents: null, enabled: true, disabledCounties: [], perUnit: false, needsReview: true, excludes: [], hint: 'Priced after review.' },
  ],
  frequencyDiscounts: [
    { key: 'one_time', label: 'One-time', percent: 0 },
    { key: 'weekly', label: 'Weekly', percent: 15 },
    { key: 'biweekly', label: 'Every two weeks', percent: 10 },
    { key: 'monthly', label: 'Monthly', percent: 5 },
  ],
  conditionMultipliers: [
    { key: 'light', label: 'Lightly used', multiplier: 0.95 },
    { key: 'standard', label: 'Normal', multiplier: 1 },
    { key: 'heavy', label: 'Heavily used', multiplier: 1.2 },
    { key: 'excessive', label: 'Excessive / needs review', multiplier: 1.4 },
  ],
  promotions: [
    { id: 'first_recurring_25', label: '25% off your first recurring cleaning', type: 'first_recurring_percent', percent: 25, active: true, stackable: false },
  ],
  commercial: {
    vendorPayoutPercent: 70,
    targetMarginPercent: 28,
    minMarginPercent: 20,
    minimumJobCents: 8000,
  },
  tax: { enabled: false, percent: 0 },
  bathroomsIncluded: 1,
  extraBathroomCents: 1500,
  sqftIncluded: 1500,
  extraSqftPer100Cents: 400,
  clientSuppliesDiscountCents: 1000,
}

// ---------------------------------------------------------------------------
// Quote input + result
// ---------------------------------------------------------------------------

export interface CleaningQuoteInput {
  service: CleaningServiceType
  county: CleaningCounty
  bedrooms: number
  bathrooms?: number
  squareFeet?: number
  frequency?: CleaningFrequency
  condition?: CleaningCondition
  supplies?: CleaningSupplies
  /** Add-on selections: key -> true, or key -> unit count for per-unit add-ons. */
  addons?: Record<string, boolean | number>
  /** Apply the first-recurring promotion if the customer is eligible. */
  isFirstRecurring?: boolean
}

export type CleaningLineKind = 'base' | 'territory' | 'condition' | 'bathrooms' | 'sqft' | 'addon' | 'supplies' | 'discount' | 'promo' | 'tax'

export interface CleaningQuoteLine {
  key: string
  label: string
  amountCents: number
  kind: CleaningLineKind
  /** true when the amount is not yet known and needs a human quote. */
  needsReview?: boolean
}

export interface CleaningQuoteResult {
  service: CleaningServiceType
  serviceLabel: string
  tierKey: string | null
  tierLabel: string | null
  county: CleaningCounty
  frequency: CleaningFrequency
  currency: 'USD'
  lines: CleaningQuoteLine[]
  baseCents: number
  addOnsCents: number
  subtotalCents: number
  recurringDiscountCents: number
  promoDiscountCents: number
  taxCents: number
  /** Charge for this visit after all discounts and tax. */
  totalCents: number
  /** Same as totalCents; named for the recurring per-visit comparison UI. */
  perVisitCents: number
  /** One-time equivalent (no recurring discount) for savings comparison. */
  oneTimeCents: number
  /** true = quote is an estimate pending confirmation, not an instant price. */
  needsReview: boolean
  reviewReasons: string[]
  // ---- internal only (stripped by toCustomerQuote) ----
  vendorPayoutCents: number
  marginCents: number
  marginPercent: number
  belowMinMargin: boolean
  belowMinimumJob: boolean
}

export type CleaningCustomerQuote = Omit<
  CleaningQuoteResult,
  'vendorPayoutCents' | 'marginCents' | 'marginPercent' | 'belowMinMargin' | 'belowMinimumJob'
>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const roundCents = (value: number) => Math.max(0, Math.round(value))

export function selectTier(service: CleaningServiceConfig, bedrooms: number): CleaningTier | null {
  const beds = Number.isFinite(bedrooms) ? Math.max(0, Math.round(bedrooms)) : 0
  // Tiers are ordered ascending; pick the first whose ceiling covers the count,
  // else the open-ended (maxBedrooms === null) catch-all.
  for (const tier of service.tiers) {
    if (tier.maxBedrooms === null) return tier
    if (beds <= tier.maxBedrooms) return tier
  }
  return service.tiers[service.tiers.length - 1] || null
}

function addonUnits(selection: boolean | number | undefined): number {
  if (selection === true) return 1
  if (typeof selection === 'number' && Number.isFinite(selection)) return Math.max(0, Math.round(selection))
  return 0
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

export function priceCleaning(config: CleaningPricingConfig, input: CleaningQuoteInput): CleaningQuoteResult {
  const service = config.services.find((s) => s.key === input.service)
  const county = config.territories.find((t) => t.key === input.county)
  const frequency: CleaningFrequency = input.frequency || 'one_time'
  const reviewReasons: string[] = []
  const lines: CleaningQuoteLine[] = []

  if (!service) {
    // Unknown service: everything is unknown. Return a review-only shell.
    return reviewShell(input, frequency, 'This service is not configured.')
  }
  if (!service.enabled) reviewReasons.push('This service is not currently available online.')
  if (county && !county.enabled) reviewReasons.push('This service area is not currently available online.')

  const tier = selectTier(service, input.bedrooms)
  const tierLabel = tier?.label ?? null
  const tierKey = tier?.key ?? null

  // --- Base service price (tier). null tier price => custom quote. ---
  let baseServiceCents = 0
  let baseIsReview = false
  if (!tier || tier.fromCents === null) {
    baseIsReview = true
    reviewReasons.push(tier ? `${tier.label} is priced as a custom quote.` : 'Property size needs review.')
  } else {
    baseServiceCents = tier.fromCents
  }

  // --- Territory adjustment on the base ---
  const territoryPct = county?.priceAdjustPercent || 0
  if (!baseIsReview && territoryPct !== 0) {
    const delta = roundCents((baseServiceCents * territoryPct) / 100)
    baseServiceCents += delta
  }

  // --- Condition multiplier on the base ---
  const condition = input.condition || 'standard'
  const conditionCfg = config.conditionMultipliers.find((c) => c.key === condition)
  const conditionMultiplier = conditionCfg?.multiplier ?? 1
  if (!baseIsReview && conditionMultiplier !== 1) {
    baseServiceCents = roundCents(baseServiceCents * conditionMultiplier)
  }
  if (condition === 'excessive') reviewReasons.push('Excessive condition is confirmed after a quick review.')

  lines.push({
    key: 'base',
    label: tier ? `${service.label} - ${tier.label}` : service.label,
    amountCents: baseServiceCents,
    kind: 'base',
    needsReview: baseIsReview,
  })

  // --- Extra bathrooms ---
  let extrasCents = 0
  const bathrooms = Math.max(0, Math.round(input.bathrooms ?? config.bathroomsIncluded))
  const extraBaths = Math.max(0, bathrooms - config.bathroomsIncluded)
  if (!baseIsReview && extraBaths > 0 && config.extraBathroomCents > 0) {
    const amount = extraBaths * config.extraBathroomCents
    extrasCents += amount
    lines.push({ key: 'extra_bathrooms', label: `${extraBaths} extra bathroom${extraBaths > 1 ? 's' : ''}`, amountCents: amount, kind: 'bathrooms' })
  }

  // --- Extra square footage ---
  const sqft = Math.max(0, Math.round(input.squareFeet ?? 0))
  if (!baseIsReview && sqft > config.sqftIncluded && config.extraSqftPer100Cents > 0) {
    const over = sqft - config.sqftIncluded
    const units = Math.ceil(over / 100)
    const amount = units * config.extraSqftPer100Cents
    extrasCents += amount
    lines.push({ key: 'extra_sqft', label: `Over ${config.sqftIncluded.toLocaleString()} sq ft`, amountCents: amount, kind: 'sqft' })
  }

  // --- Add-ons ---
  let addOnsCents = 0
  const selected = input.addons || {}
  const activeAddonKeys = new Set(
    Object.keys(selected).filter((key) => addonUnits(selected[key]) > 0),
  )
  for (const addon of config.addons) {
    const units = addonUnits(selected[addon.key])
    if (units <= 0) continue
    if (!addon.enabled) continue
    if (county && addon.disabledCounties.includes(county.key)) continue
    // Skip an add-on excluded by another selected add-on (combo vs singles).
    const excludedByOther = config.addons.some(
      (other) => other.key !== addon.key && activeAddonKeys.has(other.key) && other.excludes.includes(addon.key),
    )
    if (excludedByOther) continue

    if (addon.needsReview || addon.priceCents === null) {
      reviewReasons.push(`${addon.label} is priced after a quick review.`)
      lines.push({ key: `addon_${addon.key}`, label: addon.label, amountCents: 0, kind: 'addon', needsReview: true })
      continue
    }
    const amount = addon.perUnit ? addon.priceCents * units : addon.priceCents
    addOnsCents += amount
    lines.push({
      key: `addon_${addon.key}`,
      label: addon.perUnit && units > 1 ? `${addon.label} x${units}` : addon.label,
      amountCents: amount,
      kind: 'addon',
    })
  }

  // --- Client-supplied supplies goodwill discount ---
  let suppliesDiscountCents = 0
  if (!baseIsReview && input.supplies === 'client' && config.clientSuppliesDiscountCents > 0) {
    suppliesDiscountCents = Math.min(config.clientSuppliesDiscountCents, baseServiceCents)
    lines.push({ key: 'client_supplies', label: 'You provide supplies', amountCents: -suppliesDiscountCents, kind: 'supplies' })
  }

  // --- Subtotal (pre-discount, pre-tax) ---
  const baseCents = baseServiceCents + extrasCents
  const preDiscountCents = Math.max(0, baseCents + addOnsCents - suppliesDiscountCents)

  // --- Recurring frequency discount ---
  let recurringDiscountCents = 0
  let recurringPercent = 0
  const freqCfg = config.frequencyDiscounts.find((f) => f.key === frequency)
  if (service.recurringEligible && freqCfg && freqCfg.percent > 0) {
    recurringPercent = freqCfg.percent
    recurringDiscountCents = roundCents((preDiscountCents * recurringPercent) / 100)
    lines.push({ key: 'recurring_discount', label: `${freqCfg.label} plan (${recurringPercent}% off)`, amountCents: -recurringDiscountCents, kind: 'discount' })
  }

  // --- First-recurring promotion ---
  // The frequency discount is the plan's standing per-visit rate, not a stacked
  // promo, so the first-recurring offer applies on top of it for the first
  // visit. `stackable` governs stacking with OTHER promotions (none at launch).
  let promoDiscountCents = 0
  const promo = config.promotions.find((p) => p.active && p.type === 'first_recurring_percent')
  const promoEligible = Boolean(
    promo &&
    input.isFirstRecurring &&
    service.recurringEligible &&
    frequency !== 'one_time',
  )
  if (promo && promoEligible) {
    const afterRecurring = Math.max(0, preDiscountCents - recurringDiscountCents)
    promoDiscountCents = roundCents((afterRecurring * promo.percent) / 100)
    lines.push({ key: 'promo', label: promo.label, amountCents: -promoDiscountCents, kind: 'promo' })
  }

  const afterDiscounts = Math.max(0, preDiscountCents - recurringDiscountCents - promoDiscountCents)

  // --- Tax ---
  let taxCents = 0
  if (config.tax.enabled && config.tax.percent > 0) {
    taxCents = roundCents((afterDiscounts * config.tax.percent) / 100)
    lines.push({ key: 'tax', label: `Tax (${config.tax.percent}%)`, amountCents: taxCents, kind: 'tax' })
  }

  const totalCents = afterDiscounts + taxCents

  // --- One-time equivalent (for savings comparison in the UI) ---
  const oneTimeCents = preDiscountCents + (config.tax.enabled ? roundCents((preDiscountCents * config.tax.percent) / 100) : 0)

  // --- Vendor payout + margin (internal) ---
  const vendorPayoutCents = roundCents((baseServiceCents * config.commercial.vendorPayoutPercent) / 100)
  // Margin is measured on the service revenue Pinnacle keeps (pre-tax, the money
  // that actually funds the work), not on pass-through tax.
  const revenueCents = afterDiscounts
  const marginCents = revenueCents - vendorPayoutCents
  const marginPercent = revenueCents > 0 ? Math.round((marginCents / revenueCents) * 1000) / 10 : 0
  const belowMinMargin = !baseIsReview && marginPercent < config.commercial.minMarginPercent
  const belowMinimumJob = !baseIsReview && totalCents < config.commercial.minimumJobCents

  const needsReview = reviewReasons.length > 0

  return {
    service: input.service,
    serviceLabel: service.label,
    tierKey,
    tierLabel,
    county: input.county,
    frequency,
    currency: 'USD',
    lines,
    baseCents,
    addOnsCents,
    subtotalCents: preDiscountCents,
    recurringDiscountCents,
    promoDiscountCents,
    taxCents,
    totalCents,
    perVisitCents: totalCents,
    oneTimeCents,
    needsReview,
    reviewReasons: dedupe(reviewReasons),
    vendorPayoutCents,
    marginCents,
    marginPercent,
    belowMinMargin,
    belowMinimumJob,
  }
}

function reviewShell(input: CleaningQuoteInput, frequency: CleaningFrequency, reason: string): CleaningQuoteResult {
  return {
    service: input.service,
    serviceLabel: input.service,
    tierKey: null,
    tierLabel: null,
    county: input.county,
    frequency,
    currency: 'USD',
    lines: [],
    baseCents: 0,
    addOnsCents: 0,
    subtotalCents: 0,
    recurringDiscountCents: 0,
    promoDiscountCents: 0,
    taxCents: 0,
    totalCents: 0,
    perVisitCents: 0,
    oneTimeCents: 0,
    needsReview: true,
    reviewReasons: [reason],
    vendorPayoutCents: 0,
    marginCents: 0,
    marginPercent: 0,
    belowMinMargin: false,
    belowMinimumJob: false,
  }
}

/** Strip every internal financial field before returning a quote to a client. */
export function toCustomerQuote(result: CleaningQuoteResult): CleaningCustomerQuote {
  const { vendorPayoutCents, marginCents, marginPercent, belowMinMargin, belowMinimumJob, ...customer } = result
  return customer
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values))
}

// ---------------------------------------------------------------------------
// Config parsing / persistence helpers
// ---------------------------------------------------------------------------

/**
 * Parse a stored config document, falling back to the launch defaults for any
 * missing top-level section. Keeps old rows working after the shape grows.
 */
export function parseCleaningConfig(raw: unknown): CleaningPricingConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_CLEANING_CONFIG
  const obj = raw as Partial<CleaningPricingConfig>
  return {
    version: typeof obj.version === 'number' ? obj.version : DEFAULT_CLEANING_CONFIG.version,
    currency: 'USD',
    territories: Array.isArray(obj.territories) && obj.territories.length ? obj.territories : DEFAULT_CLEANING_CONFIG.territories,
    services: Array.isArray(obj.services) && obj.services.length ? obj.services : DEFAULT_CLEANING_CONFIG.services,
    addons: Array.isArray(obj.addons) ? obj.addons : DEFAULT_CLEANING_CONFIG.addons,
    frequencyDiscounts: Array.isArray(obj.frequencyDiscounts) && obj.frequencyDiscounts.length ? obj.frequencyDiscounts : DEFAULT_CLEANING_CONFIG.frequencyDiscounts,
    conditionMultipliers: Array.isArray(obj.conditionMultipliers) && obj.conditionMultipliers.length ? obj.conditionMultipliers : DEFAULT_CLEANING_CONFIG.conditionMultipliers,
    promotions: Array.isArray(obj.promotions) ? obj.promotions : DEFAULT_CLEANING_CONFIG.promotions,
    commercial: obj.commercial && typeof obj.commercial === 'object' ? { ...DEFAULT_CLEANING_CONFIG.commercial, ...obj.commercial } : DEFAULT_CLEANING_CONFIG.commercial,
    tax: obj.tax && typeof obj.tax === 'object' ? { ...DEFAULT_CLEANING_CONFIG.tax, ...obj.tax } : DEFAULT_CLEANING_CONFIG.tax,
    bathroomsIncluded: typeof obj.bathroomsIncluded === 'number' ? obj.bathroomsIncluded : DEFAULT_CLEANING_CONFIG.bathroomsIncluded,
    extraBathroomCents: typeof obj.extraBathroomCents === 'number' ? obj.extraBathroomCents : DEFAULT_CLEANING_CONFIG.extraBathroomCents,
    sqftIncluded: typeof obj.sqftIncluded === 'number' ? obj.sqftIncluded : DEFAULT_CLEANING_CONFIG.sqftIncluded,
    extraSqftPer100Cents: typeof obj.extraSqftPer100Cents === 'number' ? obj.extraSqftPer100Cents : DEFAULT_CLEANING_CONFIG.extraSqftPer100Cents,
    clientSuppliesDiscountCents: typeof obj.clientSuppliesDiscountCents === 'number' ? obj.clientSuppliesDiscountCents : DEFAULT_CLEANING_CONFIG.clientSuppliesDiscountCents,
  }
}

/** Starting-price map for public "from $X" display, per service and tier. */
export function startingPrices(config: CleaningPricingConfig): Record<CleaningServiceType, number | null> {
  const out = {} as Record<CleaningServiceType, number | null>
  for (const service of config.services) {
    const priced = service.tiers.map((t) => t.fromCents).filter((c): c is number => typeof c === 'number')
    out[service.key] = priced.length ? Math.min(...priced) : null
  }
  return out
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
