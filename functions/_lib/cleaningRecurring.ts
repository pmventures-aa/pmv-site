// Server-side recurring plan helpers, shared by the booking route (create a
// plan from a recurring booking) and the completion path (roll the plan forward
// to the next occurrence). Kept out of the route modules so both can import it
// without a cycle.

import type { Env } from './types'
import { uuid } from './crypto'
import { priceCleaning, type CleaningPricingConfig, type CleaningQuoteInput } from '../../shared/cleaningPricing'
import { nextOccurrenceDate, isRecurringFrequency, isDateKey, type RecurringFrequency } from '../../shared/cleaningRecurrence'
import { ensureCleaningPricingConfig } from './routes/cleaningPricing'

export interface CleaningJobInsert {
  quote: CleaningQuoteInput
  serviceLabel: string
  tierKey: string | null
  tierLabel: string | null
  pricingVersion: number
  priced: ReturnType<typeof priceCleaning>
  clientUserId: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  propertyAddress: string | null
  propertyUnit: string | null
  scheduledDate: string | null
  arrivalWindow: string | null
  guestCheckoutAt: string | null
  guestCheckinAt: string | null
  status: string
  source: string
  recurringPlanId: string | null
  createdByUserId: string | null
}

/** Shared cleaning_jobs insert used by booking and recurring generation. */
export async function insertCleaningJob(env: Env, id: string, reference: string, data: CleaningJobInsert): Promise<void> {
  const q = data.priced
  await env.DB.prepare(
    `INSERT INTO cleaning_jobs (
      id, reference, service_type, service_label, county, tier_key, tier_label,
      bedrooms, bathrooms, square_feet, frequency, condition, supplies, addons_json, is_first_recurring,
      pricing_version, client_total_cents, base_cents, addons_cents, recurring_discount_cents, promo_discount_cents, tax_cents,
      vendor_payout_cents, margin_cents, margin_percent, below_min_margin, below_minimum_job, needs_review, review_reasons_json,
      client_user_id, contact_name, contact_email, contact_phone, property_address, property_unit,
      scheduled_date, arrival_window, guest_checkout_at, guest_checkin_at,
      status, source, recurring_plan_id, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, reference, data.quote.service, data.serviceLabel, data.quote.county, data.tierKey, data.tierLabel,
    data.quote.bedrooms, data.quote.bathrooms ?? 1, data.quote.squareFeet ?? null, data.quote.frequency ?? 'one_time', data.quote.condition ?? 'standard', data.quote.supplies ?? 'pinnacle', JSON.stringify(data.quote.addons ?? {}), data.quote.isFirstRecurring ? 1 : 0,
    data.pricingVersion, q.totalCents, q.baseCents, q.addOnsCents, q.recurringDiscountCents, q.promoDiscountCents, q.taxCents,
    q.vendorPayoutCents, q.marginCents, q.marginPercent, q.belowMinMargin ? 1 : 0, q.belowMinimumJob ? 1 : 0, q.needsReview ? 1 : 0, JSON.stringify(q.reviewReasons),
    data.clientUserId, data.contactName, data.contactEmail, data.contactPhone, data.propertyAddress, data.propertyUnit,
    data.scheduledDate, data.arrivalWindow, data.guestCheckoutAt, data.guestCheckinAt,
    data.status, data.source, data.recurringPlanId, data.createdByUserId,
  ).run()
}

function planReference(): string {
  return `PLAN-${uuid().replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

export interface CreatePlanArgs {
  fromJobId: string
  frequency: RecurringFrequency
  quote: CleaningQuoteInput
  serviceLabel: string
  clientUserId: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  propertyAddress: string | null
  propertyUnit: string | null
  firstVisitDate: string | null
  arrivalWindow: string | null
  createdByUserId: string | null
}

/** Create a recurring plan from a just-booked first occurrence. */
export async function createRecurringPlan(env: Env, args: CreatePlanArgs): Promise<string> {
  const id = uuid()
  const ref = planReference()
  const anchor = args.firstVisitDate && isDateKey(args.firstVisitDate) ? args.firstVisitDate : new Date().toISOString().slice(0, 10)
  const next = nextOccurrenceDate(args.frequency, anchor)
  await env.DB.prepare(
    `INSERT INTO recurring_cleaning_plans (
      id, reference, status, frequency, service_type, service_label, county, bedrooms, bathrooms, square_feet,
      condition, supplies, addons_json, arrival_window,
      client_user_id, contact_name, contact_email, contact_phone, property_address, property_unit,
      next_date, last_generated_job_id, created_from_job_id, created_by_user_id
    ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, ref, args.frequency, args.quote.service, args.serviceLabel, args.quote.county, args.quote.bedrooms, args.quote.bathrooms ?? 1, args.quote.squareFeet ?? null,
    args.quote.condition ?? 'standard', args.quote.supplies ?? 'pinnacle', JSON.stringify(args.quote.addons ?? {}), args.arrivalWindow,
    args.clientUserId, args.contactName, args.contactEmail, args.contactPhone, args.propertyAddress, args.propertyUnit,
    next, args.fromJobId, args.fromJobId, args.createdByUserId,
  ).run()
  await env.DB.prepare('UPDATE cleaning_jobs SET recurring_plan_id=? WHERE id=?').bind(id, args.fromJobId).run()
  return id
}

interface PlanRow {
  id: string
  status: string
  frequency: string
  service_type: string
  service_label: string
  county: string
  bedrooms: number
  bathrooms: number
  square_feet: number | null
  condition: string
  supplies: string
  addons_json: string
  arrival_window: string | null
  client_user_id: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  property_address: string | null
  property_unit: string | null
  next_date: string | null
  skip_next: number
}

function jobReference(): string {
  return `CLN-${uuid().replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

/**
 * Generate the next occurrence for a plan. Honors skip-next (skips one slot but
 * keeps the cadence) and re-prices against the CURRENT config so a later price
 * change flows through. Returns the new job id, or null if the plan is not
 * active or has no next date.
 */
export async function generateNextOccurrence(env: Env, planId: string, config?: CleaningPricingConfig): Promise<string | null> {
  const plan = await env.DB.prepare('SELECT * FROM recurring_cleaning_plans WHERE id=?').bind(planId).first<PlanRow>()
  if (!plan || plan.status !== 'active') return null
  const freq = isRecurringFrequency(plan.frequency) ? plan.frequency : null
  if (!freq) return null

  let visitDate = plan.next_date && isDateKey(plan.next_date) ? plan.next_date : new Date().toISOString().slice(0, 10)
  let skipCleared = false
  if (plan.skip_next === 1) {
    visitDate = nextOccurrenceDate(freq, visitDate)
    skipCleared = true
  }

  const ensured = config ? null : await ensureCleaningPricingConfig(env)
  const cfg = config ?? ensured!.config
  const version = ensured?.version ?? 0
  let addons: Record<string, boolean | number> = {}
  try { addons = JSON.parse(plan.addons_json || '{}') } catch { addons = {} }
  const quote: CleaningQuoteInput = {
    service: plan.service_type as CleaningQuoteInput['service'],
    county: plan.county as CleaningQuoteInput['county'],
    bedrooms: plan.bedrooms,
    bathrooms: plan.bathrooms,
    squareFeet: plan.square_feet ?? undefined,
    frequency: freq,
    condition: plan.condition as CleaningQuoteInput['condition'],
    supplies: plan.supplies as CleaningQuoteInput['supplies'],
    addons,
    isFirstRecurring: false,
  }
  const priced = priceCleaning(cfg, quote)
  const jobId = uuid()
  await insertCleaningJob(env, jobId, jobReference(), {
    quote,
    serviceLabel: plan.service_label,
    tierKey: priced.tierKey,
    tierLabel: priced.tierLabel,
    pricingVersion: version,
    priced,
    clientUserId: plan.client_user_id,
    contactName: plan.contact_name,
    contactEmail: plan.contact_email,
    contactPhone: plan.contact_phone,
    propertyAddress: plan.property_address,
    propertyUnit: plan.property_unit,
    scheduledDate: visitDate,
    arrivalWindow: plan.arrival_window,
    guestCheckoutAt: null,
    guestCheckinAt: null,
    status: 'scheduled',
    source: 'recurring',
    recurringPlanId: plan.id,
    createdByUserId: null,
  })
  await env.DB.prepare(
    `UPDATE recurring_cleaning_plans SET next_date=?, skip_next=?, last_generated_job_id=?, updated_at=datetime('now') WHERE id=?`,
  ).bind(nextOccurrenceDate(freq, visitDate), skipCleared ? 0 : plan.skip_next, jobId, plan.id).run()
  return jobId
}
