// Cleaning jobs API: booking, HQ dispatch, and the vendor field workflow.
//
//   cleaningJobsPublicRoutes -> mounted at '/'      (booking)
//   cleaningJobsAdminRoutes  -> mounted at '/admin' (HQ dispatch + vendor app)
//
// Security model:
//   * Booking re-prices server-side; the client-supplied price is never trusted.
//   * HQ (staff) routes see full economics: client price, vendor payout, margin.
//   * The vendor routes are scoped to the caller's own jobs and return ONLY the
//     vendor payout - never the client price, margin, or another vendor's work.
//   * Before a job is accepted, the vendor sees an approximate location (county)
//     and never the client's address or contact details.

import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { requireStaff, requireUser } from '../mid'
import { uuid } from '../crypto'
import { actorGeo, actorIp, actorUserAgent, logAudit } from '../auditLog'
import { notifyClientEvent } from '../clientNotifications'
import { priceCleaning, type CleaningQuoteResult } from '../../../shared/cleaningPricing'
import {
  canTransition,
  isCleaningJobStatus,
  isCleaningPayoutStatus,
  turnoverUrgency,
  VENDOR_FIELD_STEPS,
  type CleaningJobStatus,
} from '../../../shared/cleaningJobs'
import { ensureCleaningPricingConfig } from './cleaningPricing'
import { createRecurringPlan, generateNextOccurrence, materializeChecklist } from '../cleaningRecurring'
import { isRecurringFrequency } from '../../../shared/cleaningRecurrence'
import { pushNotification } from '../notificationFeed'
import { allRequiredResolved, isIssueCategory, isIssueSeverity, issueCategoryLabel } from '../../../shared/cleaningChecklist'
import { validateUploadSignature } from '../fileValidation'

export const cleaningJobsPublicRoutes = new Hono<AppEnv>()
export const cleaningJobsAdminRoutes = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SERVICES = new Set(['str_turnover', 'residential_standard', 'deep', 'move_in_out'])
const COUNTIES = new Set(['miami_dade', 'broward', 'palm_beach'])

function text(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}
function intOr(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}
function isoOrNull(value: unknown): string | null {
  const s = text(value, 40)
  if (!s) return null
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}
function reference(): string {
  return `CLN-${uuid().replace(/-/g, '').slice(0, 6).toUpperCase()}`
}
function isoNow(): string {
  return new Date().toISOString()
}

function coerceQuoteInput(body: Record<string, unknown>) {
  const service = SERVICES.has(String(body.service)) ? String(body.service) : null
  const county = COUNTIES.has(String(body.county)) ? String(body.county) : null
  if (!service || !county) return null
  const addons: Record<string, boolean | number> = {}
  if (body.addons && typeof body.addons === 'object' && !Array.isArray(body.addons)) {
    for (const [k, v] of Object.entries(body.addons as Record<string, unknown>).slice(0, 40)) {
      if (typeof v === 'boolean') addons[k] = v
      else if (typeof v === 'number' && Number.isFinite(v)) addons[k] = Math.max(0, Math.min(50, Math.round(v)))
    }
  }
  const freq = ['one_time', 'weekly', 'biweekly', 'monthly'].includes(String(body.frequency)) ? String(body.frequency) : 'one_time'
  const cond = ['light', 'standard', 'heavy', 'excessive'].includes(String(body.condition)) ? String(body.condition) : 'standard'
  const supplies = body.supplies === 'client' ? 'client' : 'pinnacle'
  return {
    service: service as CleaningQuoteResult['service'],
    county: county as CleaningQuoteResult['county'],
    bedrooms: intOr(body.bedrooms, 2, 0, 20),
    bathrooms: intOr(body.bathrooms, 1, 0, 20),
    squareFeet: body.squareFeet == null ? undefined : intOr(body.squareFeet, 0, 0, 50000),
    frequency: freq as CleaningQuoteResult['frequency'],
    condition: cond as 'light' | 'standard' | 'heavy' | 'excessive',
    supplies: supplies as 'client' | 'pinnacle',
    addons,
    isFirstRecurring: body.isFirstRecurring === true,
  }
}

interface JobRow {
  [key: string]: unknown
  id: string
  reference: string
  service_type: string
  service_label: string
  county: string
  tier_label: string | null
  bedrooms: number
  bathrooms: number
  square_feet: number | null
  frequency: string
  status: string
  scheduled_date: string | null
  arrival_window: string | null
  guest_checkout_at: string | null
  guest_checkin_at: string | null
  client_total_cents: number
  vendor_payout_cents: number
  margin_cents: number
  margin_percent: number
  below_min_margin: number
  needs_review: number
  assigned_vendor_user_id: string | null
  property_address: string | null
  property_unit: string | null
  contact_name: string | null
  contact_phone: string | null
  payout_status: string
  payment_status: string
}

/** HQ view: full economics + live turnover urgency. */
function staffJobView(row: JobRow, nowMs: number, vendorName?: string | null) {
  const turn = turnoverUrgency(row.guest_checkout_at, row.guest_checkin_at, nowMs)
  return {
    id: row.id,
    reference: row.reference,
    serviceType: row.service_type,
    serviceLabel: row.service_label,
    county: row.county,
    tierLabel: row.tier_label,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    squareFeet: row.square_feet,
    frequency: row.frequency,
    status: row.status,
    scheduledDate: row.scheduled_date,
    arrivalWindow: row.arrival_window,
    clientTotalCents: row.client_total_cents,
    vendorPayoutCents: row.vendor_payout_cents,
    marginCents: row.margin_cents,
    marginPercent: row.margin_percent,
    belowMinMargin: row.below_min_margin === 1,
    needsReview: row.needs_review === 1,
    assignedVendorUserId: row.assigned_vendor_user_id,
    assignedVendorName: vendorName ?? null,
    propertyAddress: row.property_address,
    propertyUnit: row.property_unit,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    payoutStatus: row.payout_status,
    paymentStatus: row.payment_status,
    openIssues: Number(row.open_issues) || 0,
    turnover: turn,
  }
}

/** Vendor view: payout only; address/contact hidden until the job is theirs. */
function vendorJobView(row: JobRow, meId: string, nowMs: number) {
  const mine = row.assigned_vendor_user_id === meId
  const turn = turnoverUrgency(row.guest_checkout_at, row.guest_checkin_at, nowMs)
  return {
    id: row.id,
    reference: row.reference,
    serviceLabel: row.service_label,
    county: row.county,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    frequency: row.frequency,
    status: row.status,
    scheduledDate: row.scheduled_date,
    arrivalWindow: row.arrival_window,
    payoutCents: row.vendor_payout_cents,
    mine,
    // Address + contact only once the job belongs to this vendor.
    propertyAddress: mine ? row.property_address : null,
    propertyUnit: mine ? row.property_unit : null,
    contactName: mine ? row.contact_name : null,
    contactPhone: mine ? row.contact_phone : null,
    turnover: turn,
  }
}

// On completion of a job that belongs to a recurring plan, count the visit and
// roll the plan forward to schedule the next occurrence.
async function onJobCompleted(env: Env, jobId: string): Promise<void> {
  const job = await env.DB.prepare('SELECT recurring_plan_id FROM cleaning_jobs WHERE id=?').bind(jobId).first<{ recurring_plan_id: string | null }>()
  if (!job?.recurring_plan_id) return
  await env.DB.prepare("UPDATE recurring_cleaning_plans SET visits_completed = visits_completed + 1, updated_at=datetime('now') WHERE id=?").bind(job.recurring_plan_id).run()
  await generateNextOccurrence(env, job.recurring_plan_id).catch(() => null)
}

async function logJobEvent(env: Env, jobId: string, actorUserId: string | null, kind: string, fromStatus: string | null, toStatus: string | null, detail?: string) {
  await env.DB.prepare(
    'INSERT INTO cleaning_job_events (id, job_id, actor_user_id, kind, from_status, to_status, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(uuid(), jobId, actorUserId, kind, fromStatus, toStatus, detail ?? null).run()
}

// ---------------------------------------------------------------------------
// Public: booking
// ---------------------------------------------------------------------------

cleaningJobsPublicRoutes.post('/public/cleaning/book', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const input = coerceQuoteInput(body)
  if (!input) return c.json({ error: 'Choose a service and a service area to book.' }, 400)

  const contactName = text(body.name, 120)
  const contactEmail = text(body.email, 200)
  if (!contactName) return c.json({ error: 'Enter your name.' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail)) return c.json({ error: 'Enter a valid email address.' }, 400)

  const pricingConfig = await ensureCleaningPricingConfig(c.env)
  const quote = priceCleaning(pricingConfig.config, input)

  const sessionUser = c.get('user')
  const clientUserId = sessionUser && sessionUser.role === 'client' ? sessionUser.id : null

  const id = uuid()
  const ref = reference()
  const status: CleaningJobStatus = quote.needsReview ? 'needs_review' : 'requested'

  await c.env.DB.prepare(
    `INSERT INTO cleaning_jobs (
      id, reference, service_type, service_label, county, tier_key, tier_label,
      bedrooms, bathrooms, square_feet, frequency, condition, supplies, addons_json, is_first_recurring,
      pricing_version, client_total_cents, base_cents, addons_cents, recurring_discount_cents, promo_discount_cents, tax_cents,
      vendor_payout_cents, margin_cents, margin_percent, below_min_margin, below_minimum_job, needs_review, review_reasons_json,
      client_user_id, contact_name, contact_email, contact_phone, property_address, property_unit,
      scheduled_date, arrival_window, guest_checkout_at, guest_checkin_at,
      status, source, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, ref, input.service, quote.serviceLabel, input.county, quote.tierKey, quote.tierLabel,
    input.bedrooms, input.bathrooms, input.squareFeet ?? null, input.frequency, input.condition, input.supplies, JSON.stringify(input.addons), input.isFirstRecurring ? 1 : 0,
    pricingConfig.version, quote.totalCents, quote.baseCents, quote.addOnsCents, quote.recurringDiscountCents, quote.promoDiscountCents, quote.taxCents,
    quote.vendorPayoutCents, quote.marginCents, quote.marginPercent, quote.belowMinMargin ? 1 : 0, quote.belowMinimumJob ? 1 : 0, quote.needsReview ? 1 : 0, JSON.stringify(quote.reviewReasons),
    clientUserId, contactName, contactEmail, text(body.phone, 40) || null, text(body.address, 300) || null, text(body.unit, 60) || null,
    text(body.scheduledDate, 20) || null, text(body.arrivalWindow, 60) || null, isoOrNull(body.guestCheckoutAt), isoOrNull(body.guestCheckinAt),
    status, text(body.source, 60) || 'public_calculator', clientUserId,
  ).run()

  await logJobEvent(c.env, id, clientUserId, 'status_change', null, status, 'Booking received')
  await materializeChecklist(c.env, id, input.service).catch(() => {})

  // A recurring booking starts a standing plan; this job is its first visit.
  // Only recurring-eligible services (those the engine gave a recurring context)
  // create a plan, so a one-off deep or STR turnover never becomes recurring.
  const service = pricingConfig.config.services.find((s) => s.key === input.service)
  let planId: string | null = null
  if (isRecurringFrequency(input.frequency ?? 'one_time') && service?.recurringEligible) {
    planId = await createRecurringPlan(c.env, {
      fromJobId: id,
      frequency: input.frequency as 'weekly' | 'biweekly' | 'monthly',
      quote: input,
      serviceLabel: quote.serviceLabel,
      clientUserId,
      contactName,
      contactEmail,
      contactPhone: text(body.phone, 40) || null,
      propertyAddress: text(body.address, 300) || null,
      propertyUnit: text(body.unit, 60) || null,
      firstVisitDate: text(body.scheduledDate, 20) || null,
      arrivalWindow: text(body.arrivalWindow, 60) || null,
      createdByUserId: clientUserId,
    }).catch(() => null)
  }

  if (clientUserId) {
    await notifyClientEvent(c.env, {
      clientUserId,
      eventKey: 'cleaning.booking_received',
      subject: 'We received your cleaning request',
      title: 'Your cleaning request is in.',
      body: `Thanks ${contactName.split(/\s+/)[0] || ''}. We received your ${quote.serviceLabel.toLowerCase()} request (${ref}). A person will confirm the details and schedule shortly.`,
      eyebrow: 'Cleaning request received',
    }).catch(() => {})
  }

  return c.json({
    reference: ref,
    status,
    needsReview: quote.needsReview,
    totalCents: quote.totalCents,
    message: quote.needsReview
      ? 'Your request is in. A few details need a quick confirmation and we will send your final price shortly.'
      : 'Your request is in. We will confirm your cleaning and schedule shortly.',
  })
})

// ---------------------------------------------------------------------------
// HQ dispatch (staff)
// ---------------------------------------------------------------------------

const BOARD_COLUMNS = 'id, reference, service_type, service_label, county, tier_label, bedrooms, bathrooms, square_feet, frequency, status, scheduled_date, arrival_window, guest_checkout_at, guest_checkin_at, client_total_cents, vendor_payout_cents, margin_cents, margin_percent, below_min_margin, needs_review, assigned_vendor_user_id, property_address, property_unit, contact_name, contact_phone, payout_status, payment_status'

cleaningJobsAdminRoutes.get('/cleaning/jobs', requireStaff, async (c) => {
  const status = c.req.query('status')
  const county = c.req.query('county')
  const vendor = c.req.query('vendor')
  const clauses: string[] = []
  const binds: unknown[] = []
  if (status && isCleaningJobStatus(status)) { clauses.push('status = ?'); binds.push(status) }
  else if (status === 'open') { clauses.push("status NOT IN ('completed','cancelled')") }
  if (county && COUNTIES.has(county)) { clauses.push('county = ?'); binds.push(county) }
  if (vendor) { clauses.push('assigned_vendor_user_id = ?'); binds.push(vendor) }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = await c.env.DB.prepare(
    `SELECT ${BOARD_COLUMNS}, (SELECT COUNT(*) FROM cleaning_job_issues i WHERE i.job_id = cleaning_jobs.id AND i.status='open') AS open_issues FROM cleaning_jobs ${where} ORDER BY (scheduled_date IS NULL), scheduled_date ASC, created_at DESC LIMIT 300`,
  ).bind(...binds).all<JobRow>()

  // Attach assigned vendor names in one pass.
  const ids = Array.from(new Set((rows.results || []).map((r) => r.assigned_vendor_user_id).filter(Boolean))) as string[]
  const names = new Map<string, string>()
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    const nameRows = await c.env.DB.prepare(`SELECT id, full_name FROM users WHERE id IN (${placeholders})`).bind(...ids).all<{ id: string; full_name: string | null }>()
    for (const n of nameRows.results || []) names.set(n.id, n.full_name || 'Vendor')
  }
  const now = Date.now()
  return c.json({ jobs: (rows.results || []).map((r) => staffJobView(r, now, r.assigned_vendor_user_id ? names.get(r.assigned_vendor_user_id) : null)) })
})

cleaningJobsAdminRoutes.get('/cleaning/jobs/summary', requireStaff, async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status='needs_review' THEN 1 ELSE 0 END) AS needs_review,
       SUM(CASE WHEN status IN ('requested','scheduled','offered') THEN 1 ELSE 0 END) AS awaiting_vendor,
       SUM(CASE WHEN status IN ('assigned','en_route','checked_in','in_progress') THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN status='completed' THEN client_total_cents ELSE 0 END) AS completed_revenue_cents,
       SUM(CASE WHEN status='completed' THEN vendor_payout_cents ELSE 0 END) AS completed_payout_cents,
       SUM(CASE WHEN status NOT IN ('completed','cancelled') THEN client_total_cents ELSE 0 END) AS booked_revenue_cents
     FROM cleaning_jobs`,
  ).first<Record<string, number>>()
  return c.json({ summary: row || {} })
})

cleaningJobsAdminRoutes.get('/cleaning/jobs/:id', requireStaff, async (c) => {
  const id = c.req.param('id')!
  const row = await c.env.DB.prepare(`SELECT * FROM cleaning_jobs WHERE id = ?`).bind(id).first<JobRow>()
  if (!row) return c.json({ error: 'Not found' }, 404)
  let vendorName: string | null = null
  if (row.assigned_vendor_user_id) {
    const v = await c.env.DB.prepare('SELECT full_name FROM users WHERE id = ?').bind(row.assigned_vendor_user_id).first<{ full_name: string | null }>()
    vendorName = v?.full_name || null
  }
  const events = await c.env.DB.prepare('SELECT id, actor_user_id, kind, from_status, to_status, detail, created_at FROM cleaning_job_events WHERE job_id = ? ORDER BY created_at ASC').bind(id).all()
  return c.json({ job: staffJobView(row, Date.now(), vendorName), addonsJson: row.addons_json, reviewReasons: row.review_reasons_json, notesInternal: row.notes_internal, events: events.results || [] })
})

/** Candidate vendors for assignment (active providers). */
cleaningJobsAdminRoutes.get('/cleaning/assignable-vendors', requireStaff, async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id, full_name, email FROM users WHERE role IN ('staff','admin') AND status = 'active' ORDER BY full_name LIMIT 100",
  ).all<{ id: string; full_name: string | null; email: string }>()
  return c.json({ vendors: (rows.results || []).map((r) => ({ id: r.id, name: r.full_name || r.email })) })
})

cleaningJobsAdminRoutes.post('/cleaning/jobs/:id/assign', requireStaff, async (c) => {
  const id = c.req.param('id')!
  const user = c.get('user')!
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const vendorId = text(body.vendorUserId, 60)
  if (!vendorId) return c.json({ error: 'Choose a vendor.' }, 400)
  const job = await c.env.DB.prepare('SELECT id, status FROM cleaning_jobs WHERE id = ?').bind(id).first<{ id: string; status: string }>()
  if (!job) return c.json({ error: 'Not found' }, 404)
  const vendor = await c.env.DB.prepare("SELECT id FROM users WHERE id = ? AND role IN ('staff','admin') AND status = 'active'").bind(vendorId).first()
  if (!vendor) return c.json({ error: 'That vendor is not available.' }, 400)

  await c.env.DB.prepare(
    "UPDATE cleaning_jobs SET status='assigned', assigned_vendor_user_id=?, assigned_by_user_id=?, assigned_at=?, updated_at=datetime('now') WHERE id=?",
  ).bind(vendorId, user.id, isoNow(), id).run()
  await logJobEvent(c.env, id, user.id, 'assigned', job.status, 'assigned', `Assigned to vendor ${vendorId}`)
  await logAudit(c.env, { actorUserId: user.id, actorIp: actorIp(c.req.raw), actorUserAgent: actorUserAgent(c.req.raw), actorGeo: actorGeo(c.req.raw), action: 'cleaning_job_assigned', entityType: 'cleaning_job', entityId: id, after: { vendorId } }).catch(() => {})
  return c.json({ ok: true })
})

cleaningJobsAdminRoutes.post('/cleaning/jobs/:id/status', requireStaff, async (c) => {
  const id = c.req.param('id')!
  const user = c.get('user')!
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const to = text(body.status, 40)
  if (!isCleaningJobStatus(to)) return c.json({ error: 'Unknown status.' }, 400)
  const job = await c.env.DB.prepare('SELECT id, status FROM cleaning_jobs WHERE id = ?').bind(id).first<{ id: string; status: string }>()
  if (!job) return c.json({ error: 'Not found' }, 404)
  // HQ may cancel from anywhere; otherwise respect the transition graph.
  if (to !== 'cancelled' && !canTransition(job.status, to)) return c.json({ error: `Cannot move from ${job.status} to ${to}.` }, 400)

  const stamp = statusTimestampColumn(to)
  const reason = text(body.reason, 300)
  const sql = `UPDATE cleaning_jobs SET status=?${stamp ? `, ${stamp}=?` : ''}${to === 'cancelled' ? ', cancelled_at=?, cancel_reason=?' : ''}, updated_at=datetime('now') WHERE id=?`
  const binds: unknown[] = [to]
  if (stamp) binds.push(isoNow())
  if (to === 'cancelled') binds.push(isoNow(), reason || null)
  binds.push(id)
  await c.env.DB.prepare(sql).bind(...binds).run()
  await logJobEvent(c.env, id, user.id, 'status_change', job.status, to, reason || undefined)
  if (to === 'completed') await onJobCompleted(c.env, id)
  return c.json({ ok: true })
})

cleaningJobsAdminRoutes.patch('/cleaning/jobs/:id', requireStaff, async (c) => {
  const id = c.req.param('id')!
  const user = c.get('user')!
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const sets: string[] = []
  const binds: unknown[] = []
  if (typeof body.scheduledDate === 'string') { sets.push('scheduled_date=?'); binds.push(text(body.scheduledDate, 20) || null) }
  if (typeof body.arrivalWindow === 'string') { sets.push('arrival_window=?'); binds.push(text(body.arrivalWindow, 60) || null) }
  if (typeof body.notesInternal === 'string') { sets.push('notes_internal=?'); binds.push(text(body.notesInternal, 2000)) }
  if (typeof body.vendorPayoutCents === 'number' && Number.isFinite(body.vendorPayoutCents)) { sets.push('vendor_payout_cents=?'); binds.push(Math.max(0, Math.round(body.vendorPayoutCents))) }
  if (isCleaningPayoutStatus(body.payoutStatus)) { sets.push('payout_status=?'); binds.push(body.payoutStatus) }
  if (typeof body.paymentStatus === 'string' && ['unpaid', 'paid', 'invoiced', 'waived'].includes(body.paymentStatus)) { sets.push('payment_status=?'); binds.push(body.paymentStatus) }
  if (!sets.length) return c.json({ error: 'Nothing to update.' }, 400)
  sets.push("updated_at=datetime('now')")
  binds.push(id)
  await c.env.DB.prepare(`UPDATE cleaning_jobs SET ${sets.join(', ')} WHERE id=?`).bind(...binds).run()
  await logJobEvent(c.env, id, user.id, 'note', null, null, 'HQ updated job details')
  return c.json({ ok: true })
})

function statusTimestampColumn(status: CleaningJobStatus): string | null {
  switch (status) {
    case 'en_route': return 'en_route_at'
    case 'checked_in': return 'arrived_at'
    case 'in_progress': return 'started_at'
    case 'completed': return 'completed_at'
    default: return null
  }
}

// ---------------------------------------------------------------------------
// Vendor app (scoped to the caller)
// ---------------------------------------------------------------------------

cleaningJobsAdminRoutes.get('/cleaning/my-jobs', requireUser, async (c) => {
  const me = c.get('user')!
  const now = Date.now()
  const mine = await c.env.DB.prepare(
    `SELECT ${BOARD_COLUMNS} FROM cleaning_jobs WHERE assigned_vendor_user_id = ? AND status NOT IN ('cancelled') ORDER BY (scheduled_date IS NULL), scheduled_date ASC LIMIT 200`,
  ).bind(me.id).all<JobRow>()
  // Available = scheduled/offered and unassigned; the vendor can accept these.
  const available = await c.env.DB.prepare(
    `SELECT ${BOARD_COLUMNS} FROM cleaning_jobs WHERE assigned_vendor_user_id IS NULL AND status IN ('scheduled','offered') ORDER BY (scheduled_date IS NULL), scheduled_date ASC LIMIT 100`,
  ).all<JobRow>()
  return c.json({
    mine: (mine.results || []).map((r) => vendorJobView(r, me.id, now)),
    available: (available.results || []).map((r) => vendorJobView(r, me.id, now)),
  })
})

cleaningJobsAdminRoutes.post('/cleaning/my-jobs/:id/accept', requireUser, async (c) => {
  const me = c.get('user')!
  const id = c.req.param('id')!
  const job = await c.env.DB.prepare('SELECT id, status, assigned_vendor_user_id FROM cleaning_jobs WHERE id = ?').bind(id).first<{ id: string; status: string; assigned_vendor_user_id: string | null }>()
  if (!job) return c.json({ error: 'Not found' }, 404)
  if (job.assigned_vendor_user_id) return c.json({ error: 'This job was already taken.' }, 409)
  if (!['scheduled', 'offered'].includes(job.status)) return c.json({ error: 'This job is not available.' }, 400)
  // Atomic claim: only succeeds if still unassigned.
  const res = await c.env.DB.prepare(
    "UPDATE cleaning_jobs SET status='assigned', assigned_vendor_user_id=?, accepted_at=?, updated_at=datetime('now') WHERE id=? AND assigned_vendor_user_id IS NULL",
  ).bind(me.id, isoNow(), id).run()
  if (!res.meta.changes) return c.json({ error: 'This job was just taken.' }, 409)
  await logJobEvent(c.env, id, me.id, 'assigned', job.status, 'assigned', 'Vendor accepted')
  return c.json({ ok: true })
})

cleaningJobsAdminRoutes.post('/cleaning/my-jobs/:id/decline', requireUser, async (c) => {
  const me = c.get('user')!
  const id = c.req.param('id')!
  await logJobEvent(c.env, id, me.id, 'note', null, null, 'Vendor declined available job')
  return c.json({ ok: true })
})

cleaningJobsAdminRoutes.post('/cleaning/my-jobs/:id/field', requireUser, async (c) => {
  const me = c.get('user')!
  const id = c.req.param('id')!
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const action = text(body.action, 30)
  const step = VENDOR_FIELD_STEPS.find((s) => s.action === action)
  if (!step) return c.json({ error: 'Unknown action.' }, 400)
  const job = await c.env.DB.prepare('SELECT id, status, assigned_vendor_user_id FROM cleaning_jobs WHERE id = ?').bind(id).first<{ id: string; status: string; assigned_vendor_user_id: string | null }>()
  if (!job) return c.json({ error: 'Not found' }, 404)
  if (job.assigned_vendor_user_id !== me.id) return c.json({ error: 'This is not your job.' }, 403)
  if (job.status !== step.from) return c.json({ error: `Cannot ${action} from ${job.status}.` }, 400)

  // Completion requires every required checklist item resolved, unless the
  // vendor documents an explicit exception (override with a reason).
  if (step.action === 'complete' && body.override !== true) {
    const items = await c.env.DB.prepare('SELECT required, status FROM cleaning_job_checklist_items WHERE job_id=?').bind(id).all<{ required: number; status: string }>()
    const rows = (items.results || []).map((r) => ({ required: r.required === 1, status: r.status }))
    if (rows.length && !allRequiredResolved(rows)) {
      return c.json({ error: 'Finish or mark N/A every required checklist item before completing.' }, 400)
    }
  }

  const col = statusTimestampColumn(step.to)
  // Optional location context recorded on the event (not continuous tracking).
  const lat = Number(body.lat), lng = Number(body.lng)
  const geo = Number.isFinite(lat) && Number.isFinite(lng) ? JSON.stringify({ lat, lng }) : null
  await c.env.DB.prepare(
    `UPDATE cleaning_jobs SET status=?${col ? `, ${col}=?` : ''}, updated_at=datetime('now') WHERE id=?`,
  ).bind(...(col ? [step.to, isoNow(), id] : [step.to, id])).run()
  await logJobEvent(c.env, id, me.id, 'status_change', step.from, step.to, geo ? `field ${action} @ ${geo}` : `field ${action}`)

  // Notify the client on completion.
  if (step.to === 'completed') {
    await onJobCompleted(c.env, id)
    const full = await c.env.DB.prepare('SELECT client_user_id, service_label, reference FROM cleaning_jobs WHERE id = ?').bind(id).first<{ client_user_id: string | null; service_label: string; reference: string }>()
    if (full?.client_user_id) {
      await notifyClientEvent(c.env, {
        clientUserId: full.client_user_id,
        eventKey: 'cleaning.completed',
        subject: 'Your cleaning is complete',
        title: 'Your property is ready.',
        body: `Your ${full.service_label.toLowerCase()} (${full.reference}) is complete.`,
        eyebrow: 'Cleaning completed',
      }).catch(() => {})
    }
  }
  return c.json({ ok: true, status: step.to })
})

// ---------------------------------------------------------------------------
// Recurring plans (staff)
// ---------------------------------------------------------------------------

interface PlanListRow {
  id: string
  reference: string
  status: string
  frequency: string
  service_label: string
  county: string
  bedrooms: number
  bathrooms: number
  contact_name: string | null
  property_address: string | null
  next_date: string | null
  skip_next: number
  visits_completed: number
}

cleaningJobsAdminRoutes.get('/cleaning/plans', requireStaff, async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, reference, status, frequency, service_label, county, bedrooms, bathrooms, contact_name, property_address, next_date, skip_next, visits_completed
     FROM recurring_cleaning_plans ORDER BY (status='active') DESC, next_date ASC LIMIT 300`,
  ).all<PlanListRow>()
  return c.json({
    plans: (rows.results || []).map((p) => ({
      id: p.id,
      reference: p.reference,
      status: p.status,
      frequency: p.frequency,
      serviceLabel: p.service_label,
      county: p.county,
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      contactName: p.contact_name,
      propertyAddress: p.property_address,
      nextDate: p.next_date,
      skipNext: p.skip_next === 1,
      visitsCompleted: p.visits_completed,
    })),
  })
})

cleaningJobsAdminRoutes.post('/cleaning/plans/:id/action', requireStaff, async (c) => {
  const id = c.req.param('id')!
  const user = c.get('user')!
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const action = text(body.action, 20)
  const plan = await c.env.DB.prepare('SELECT id, status FROM recurring_cleaning_plans WHERE id=?').bind(id).first<{ id: string; status: string }>()
  if (!plan) return c.json({ error: 'Not found' }, 404)

  switch (action) {
    case 'skip':
      await c.env.DB.prepare("UPDATE recurring_cleaning_plans SET skip_next=1, updated_at=datetime('now') WHERE id=?").bind(id).run()
      break
    case 'unskip':
      await c.env.DB.prepare("UPDATE recurring_cleaning_plans SET skip_next=0, updated_at=datetime('now') WHERE id=?").bind(id).run()
      break
    case 'pause':
      await c.env.DB.prepare("UPDATE recurring_cleaning_plans SET status='paused', updated_at=datetime('now') WHERE id=?").bind(id).run()
      break
    case 'cancel':
      await c.env.DB.prepare("UPDATE recurring_cleaning_plans SET status='cancelled', updated_at=datetime('now') WHERE id=?").bind(id).run()
      break
    case 'resume': {
      await c.env.DB.prepare("UPDATE recurring_cleaning_plans SET status='active', updated_at=datetime('now') WHERE id=?").bind(id).run()
      // If nothing is pending for this plan, schedule the next occurrence now.
      const pending = await c.env.DB.prepare("SELECT id FROM cleaning_jobs WHERE recurring_plan_id=? AND status NOT IN ('completed','cancelled') LIMIT 1").bind(id).first()
      if (!pending) await generateNextOccurrence(c.env, id).catch(() => null)
      break
    }
    default:
      return c.json({ error: 'Unknown action.' }, 400)
  }
  await logAudit(c.env, { actorUserId: user.id, actorIp: actorIp(c.req.raw), actorUserAgent: actorUserAgent(c.req.raw), actorGeo: actorGeo(c.req.raw), action: `cleaning_plan_${action}`, entityType: 'recurring_cleaning_plan', entityId: id }).catch(() => {})
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Job checklist + issue reporting (vendor-scoped)
// ---------------------------------------------------------------------------

async function requireMyJob(c: import('hono').Context<AppEnv>, id: string): Promise<{ ok: true; meId: string } | { ok: false; res: Response }> {
  const me = c.get('user')!
  const job = await c.env.DB.prepare('SELECT assigned_vendor_user_id FROM cleaning_jobs WHERE id=?').bind(id).first<{ assigned_vendor_user_id: string | null }>()
  if (!job) return { ok: false, res: c.json({ error: 'Not found' }, 404) }
  if (job.assigned_vendor_user_id !== me.id) return { ok: false, res: c.json({ error: 'This is not your job.' }, 403) }
  return { ok: true, meId: me.id }
}

cleaningJobsAdminRoutes.get('/cleaning/my-jobs/:id/checklist', requireUser, async (c) => {
  const id = c.req.param('id')!
  const guard = await requireMyJob(c, id)
  if (!guard.ok) return guard.res
  const items = await c.env.DB.prepare('SELECT id, category, item_key, label, required, status, na_reason FROM cleaning_job_checklist_items WHERE job_id=? ORDER BY sort_order').bind(id).all()
  const issues = await c.env.DB.prepare('SELECT id, category, severity, description, status, created_at FROM cleaning_job_issues WHERE job_id=? ORDER BY created_at DESC').bind(id).all()
  return c.json({ items: items.results || [], issues: issues.results || [] })
})

cleaningJobsAdminRoutes.post('/cleaning/my-jobs/:id/checklist/:itemId', requireUser, async (c) => {
  const id = c.req.param('id')!
  const itemId = c.req.param('itemId')!
  const guard = await requireMyJob(c, id)
  if (!guard.ok) return guard.res
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const status = text(body.status, 20)
  if (!['pending', 'complete', 'not_applicable'].includes(status)) return c.json({ error: 'Unknown status.' }, 400)
  const naReason = status === 'not_applicable' ? text(body.naReason, 200) : null
  await c.env.DB.prepare(
    "UPDATE cleaning_job_checklist_items SET status=?, na_reason=?, completed_at=CASE WHEN ?='pending' THEN NULL ELSE datetime('now') END, completed_by_user_id=? WHERE id=? AND job_id=?",
  ).bind(status, naReason, status, guard.meId, itemId, id).run()
  return c.json({ ok: true })
})

cleaningJobsAdminRoutes.post('/cleaning/my-jobs/:id/issues', requireUser, async (c) => {
  const id = c.req.param('id')!
  const guard = await requireMyJob(c, id)
  if (!guard.ok) return guard.res
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const category = String(body.category)
  const severity = String(body.severity)
  const description = text(body.description, 1000)
  if (!isIssueCategory(category)) return c.json({ error: 'Choose an issue type.' }, 400)
  if (!isIssueSeverity(severity)) return c.json({ error: 'Choose a severity.' }, 400)
  if (!description) return c.json({ error: 'Describe the issue.' }, 400)
  const issueId = uuid()
  await c.env.DB.prepare(
    'INSERT INTO cleaning_job_issues (id, job_id, reported_by_user_id, category, severity, description) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(issueId, id, guard.meId, category, severity, description).run()
  await logJobEvent(c.env, id, guard.meId, 'note', null, null, `Issue reported: ${issueCategoryLabel(category)} (${severity})`)

  // Urgent issues alert HQ immediately through the existing notification feed.
  if (severity === 'urgent') {
    const job = await c.env.DB.prepare('SELECT reference FROM cleaning_jobs WHERE id=?').bind(id).first<{ reference: string }>()
    const staff = await c.env.DB.prepare("SELECT id FROM users WHERE role IN ('staff','admin') AND status='active' LIMIT 50").all<{ id: string }>()
    for (const s of staff.results || []) {
      await pushNotification(c.env, {
        userId: s.id,
        kind: 'cleaning.issue_reported',
        subjectType: 'cleaning_job',
        subjectId: id,
        title: 'Urgent cleaning issue',
        body: `${issueCategoryLabel(category)} on ${job?.reference || 'a cleaning job'}: ${description.slice(0, 120)}`,
        deepLinkPath: '/admin/cleaning/dispatch',
      }).catch(() => {})
    }
  }
  return c.json({ ok: true, id: issueId })
})

// ---------------------------------------------------------------------------
// Completion photos (R2 via env.UPLOADS)
// ---------------------------------------------------------------------------

const PHOTO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' }
const PHOTO_LABELS = new Set(['arrival', 'before', 'after', 'damage', 'missing_item', 'restock', 'completed', 'final_guest_ready'])
const MAX_PHOTO_BYTES = 8 * 1024 * 1024

async function storeCleaningPhoto(env: Env, jobId: string, req: Request):
  Promise<{ error: string; status: number } | { objectKey: string; size: number; contentType: string; ext: string }> {
  if (!env.UPLOADS) return { error: 'Photo storage is not configured yet.', status: 503 }
  const contentType = req.headers.get('Content-Type') || ''
  const ext = PHOTO_TYPES[contentType]
  if (!ext) return { error: 'Unsupported image type - use PNG, JPEG, or WebP.', status: 400 }
  const body = await req.arrayBuffer()
  if (body.byteLength === 0) return { error: 'Empty upload.', status: 400 }
  if (body.byteLength > MAX_PHOTO_BYTES) return { error: 'Image too large - 8MB max.', status: 413 }
  const signature = validateUploadSignature(body, contentType, ['png', 'jpeg', 'webp'])
  if (!signature.ok) return { error: signature.error, status: 400 }
  const objectKey = `cleaning-jobs/${jobId}/${uuid()}.${ext}`
  await env.UPLOADS.put(objectKey, body, { httpMetadata: { contentType }, customMetadata: { validated: 'signature-v1', kind: 'cleaning-photo' } })
  return { objectKey, size: body.byteLength, contentType, ext }
}

cleaningJobsAdminRoutes.post('/cleaning/my-jobs/:id/photos', requireUser, async (c) => {
  const id = c.req.param('id')!
  const guard = await requireMyJob(c, id)
  if (!guard.ok) return guard.res
  const labelRaw = text(c.req.query('label'), 40)
  const label = PHOTO_LABELS.has(labelRaw) ? labelRaw : 'after'
  const itemId = text(c.req.query('itemId'), 60) || null
  const result = await storeCleaningPhoto(c.env, id, c.req.raw)
  if ('error' in result) return c.json({ error: result.error }, result.status as 400)
  const photoId = uuid()
  await c.env.DB.prepare(
    'INSERT INTO cleaning_job_photos (id, job_id, checklist_item_id, object_key, file_name, content_type, size_bytes, label, captured_at, uploaded_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(photoId, id, itemId, result.objectKey, `photo.${result.ext}`, result.contentType, result.size, label, isoNow(), guard.meId).run()
  return c.json({ ok: true, id: photoId, url: `/admin/cleaning/photos/${photoId}` }, 201)
})

interface PhotoRow { id: string; label: string; file_name: string; content_type: string | null; captured_at: string | null; checklist_item_id: string | null }

cleaningJobsAdminRoutes.get('/cleaning/my-jobs/:id/photos', requireUser, async (c) => {
  const id = c.req.param('id')!
  const guard = await requireMyJob(c, id)
  if (!guard.ok) return guard.res
  const rows = await c.env.DB.prepare('SELECT id, label, file_name, content_type, captured_at, checklist_item_id FROM cleaning_job_photos WHERE job_id=? ORDER BY created_at ASC').bind(id).all<PhotoRow>()
  return c.json({ photos: (rows.results || []).map((p) => ({ id: p.id, label: p.label, checklistItemId: p.checklist_item_id, url: `/admin/cleaning/photos/${p.id}` })) })
})

cleaningJobsAdminRoutes.get('/cleaning/jobs/:id/photos', requireStaff, async (c) => {
  const id = c.req.param('id')!
  const rows = await c.env.DB.prepare('SELECT id, label, file_name, content_type, captured_at, checklist_item_id FROM cleaning_job_photos WHERE job_id=? ORDER BY created_at ASC').bind(id).all<PhotoRow>()
  return c.json({ photos: (rows.results || []).map((p) => ({ id: p.id, label: p.label, url: `/admin/cleaning/photos/${p.id}` })) })
})

// Serve a photo to the assigned vendor, any staff member, or the client owner.
cleaningJobsAdminRoutes.get('/cleaning/photos/:id', requireUser, async (c) => {
  const me = c.get('user')!
  const photo = await c.env.DB.prepare('SELECT object_key, job_id FROM cleaning_job_photos WHERE id=?').bind(c.req.param('id')!).first<{ object_key: string; job_id: string }>()
  if (!photo) return c.json({ error: 'not found' }, 404)
  const job = await c.env.DB.prepare('SELECT assigned_vendor_user_id, client_user_id FROM cleaning_jobs WHERE id=?').bind(photo.job_id).first<{ assigned_vendor_user_id: string | null; client_user_id: string | null }>()
  const isStaff = me.role === 'staff' || me.role === 'admin'
  const allowed = isStaff || job?.assigned_vendor_user_id === me.id || job?.client_user_id === me.id
  if (!allowed) return c.json({ error: 'not found' }, 404)
  if (!c.env.UPLOADS) return c.json({ error: 'not found' }, 404)
  const obj = await c.env.UPLOADS.get(photo.object_key)
  if (!obj) return c.json({ error: 'not found' }, 404)
  return new Response(obj.body, {
    headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' },
  })
})
