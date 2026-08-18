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
    `SELECT ${BOARD_COLUMNS} FROM cleaning_jobs ${where} ORDER BY (scheduled_date IS NULL), scheduled_date ASC, created_at DESC LIMIT 300`,
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
