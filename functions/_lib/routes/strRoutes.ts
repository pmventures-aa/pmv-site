// STR Turnover & Property Support API.
//
// Three route groups share helpers in this module:
//   strPublicRoutes   -> mounted at '/'      (public quote intake)
//   strAdminRoutes    -> mounted at '/admin' (HQ + provider workflow)
//   strPortalRoutes   -> mounted at '/portal'(client-facing)
//
// Security model:
//   * Public lead intake is unauthenticated but writes into the existing
//     contact_inquiries pipeline (service_key 'str_turnover', source 'str_lead').
//   * HQ/provider routes require staff (providers are staff users).
//   * Client portal routes require an authenticated user and are always
//     scoped through canAccessClient — never trust client-supplied ids.
//   * Provider payout / gross margin / internal notes are ONLY returned by
//     staff routes. The client portal never sees economics.
//   * Turnover photos are served through authenticated endpoints; there are
//     no public object URLs.

import { Hono } from 'hono'
import type { AppEnv, Env, SessionUser } from '../types'
import { requireUser, requireStaff } from '../mid'
import { canAccessClient, ScopeError, scopeFilter } from '../scope'
import { uuid } from '../crypto'
import { activityInsert, logActivity } from '../activity'
import { actorGeo, actorIp, actorUserAgent, logAudit } from '../auditLog'
import { pushNotification } from '../notificationFeed'
import { notifyClientEvent } from '../clientNotifications'
import { validateUploadSignature } from '../fileValidation'
import { calculateInvoiceTotals, type InvoiceLineInput } from '../invoiceMath'
import {
  STR_SERVICE_KEY,
  isIssueSeverity,
  isIssueType,
  isPayoutStatus,
  isSupplyStock,
  issueSeverityLabel,
  issueTypeLabel,
  strPackageLabel,
  strPackageShortLabel,
  tierForBedrooms,
  turnoverClientStatus,
  turnoverClientDescription,
  turnoverStatusLabel,
  turnoverStatusTone,
} from '../../../shared/strWorkspace'
import { money } from '../../../shared/strWorkspace'

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function text(value: unknown, max = 500): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}
function cents(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
}
function bool(value: unknown): number {
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0
}
function optionalInt(value: unknown, fallback: number | null): number | null {
  const n = Number(value)
  return Number.isFinite(n) && value !== null && value !== '' ? Math.round(n) : fallback
}
function isoNow(): string {
  return new Date().toISOString()
}
function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}
function parseIso(value: string): Date {
  const d = new Date(value.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? new Date(value) : d
}
function isoDateTime(value: string): string {
  const d = parseIso(value)
  return Number.isNaN(d.getTime()) ? value : d.toISOString()
}

// Add minutes to an ISO value, returning ISO.
function addMinutes(iso: string, minutes: number): string {
  const d = parseIso(iso)
  if (Number.isNaN(d.getTime())) return iso
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}

const ALLOWED_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const MAX_PHOTO_BYTES = 8 * 1024 * 1024

async function storeTurnoverPhoto(
  env: Env,
  turnoverId: string,
  label: string,
  uploadedBy: string,
  req: Request,
): Promise<{ error: string; status: number } | { objectKey: string; size: number; contentType: string; ext: string }> {
  if (!env.UPLOADS) return { error: 'photo storage is not configured yet', status: 503 }
  const contentType = req.headers.get('Content-Type') || ''
  const ext = ALLOWED_TYPES[contentType]
  if (!ext) return { error: 'unsupported image type — use PNG, JPEG, or WebP', status: 400 }
  const body = await req.arrayBuffer()
  if (body.byteLength === 0) return { error: 'empty upload', status: 400 }
  if (body.byteLength > MAX_PHOTO_BYTES) return { error: 'image too large — 8MB max', status: 413 }
  const signature = validateUploadSignature(body, contentType, ['png', 'jpeg', 'webp'])
  if (!signature.ok) return { error: signature.error, status: 400 }
  const objectKey = `str-turnovers/${turnoverId}/${uuid()}.${ext}`
  await env.UPLOADS.put(objectKey, body, {
    httpMetadata: { contentType },
    customMetadata: { validated: 'signature-v1', kind: 'str-turnover-photo' },
  })
  return { objectKey, size: body.byteLength, contentType, ext }
}

function applyErr(c: any, err: unknown) {
  if (err instanceof ScopeError) return c.json({ error: err.message }, err.status as any)
  console.error('[str]', err)
  return c.json({ error: 'internal error' }, 500)
}

// ---------------------------------------------------------------------------
// Pricing (authoritative server-side computation from DB tiers)
// ---------------------------------------------------------------------------
async function pricingSourcePackage(env: Env, packageKey: string | null): Promise<string> {
  const key = packageKey && (packageKey === 'guest_ready' || packageKey === 'guest_ready_plus') ? packageKey : 'guest_ready'
  const row = await env.DB.prepare('SELECT key FROM str_service_packages WHERE key = ? AND active = 1').bind(key).first<{ key: string }>()
  return row ? key : 'guest_ready'
}

async function computeTurnoverPricing(env: Env, packageKey: string | null, bedrooms: number | null) {
  const key = await pricingSourcePackage(env, packageKey)
  const tiers = await env.DB.prepare(
    `SELECT tier_key, tier_label, max_bedrooms, starting_from, client_price_cents, provider_payout_cents
     FROM str_price_tiers WHERE package_key = ? ORDER BY sort_order ASC`,
  ).bind(key).all<{ tier_key: string; tier_label: string; max_bedrooms: number | null; starting_from: number; client_price_cents: number; provider_payout_cents: number }>()
  const tier = tierForBedrooms(tiers.results ?? [], bedrooms)
  const chargeCents = tier?.client_price_cents ?? 0
  const payoutCents = tier?.provider_payout_cents ?? 0
  return { packageKey: key, tier, chargeCents, payoutCents }
}

// ---------------------------------------------------------------------------
// Turnover helpers
// ---------------------------------------------------------------------------
async function loadStrProperty(env: Env, propertyId: string) {
  const sp = await env.DB.prepare('SELECT * FROM str_properties WHERE property_id = ?').bind(propertyId).first<any>()
  if (!sp) return null
  const prop = await env.DB.prepare(
    'SELECT id, client_user_id, address, name, city, state, postal_code, property_type FROM properties WHERE id = ?',
  ).bind(propertyId).first<any>()
  if (!prop) return null
  return { profile: sp, property: prop }
}

async function loadTurnover(env: Env, turnoverId: string) {
  return env.DB.prepare(
    `SELECT t.*, p.address AS property_address, p.name AS property_name, p.city, p.state,
            sp.nickname AS property_nickname, sp.bedrooms, sp.bathrooms, sp.max_guests, sp.platform,
            sp.required_completion_photos_json, sp.service_package_key AS profile_package_key,
            pr.full_name AS provider_name, cl.full_name AS client_name, cpr.business_name AS client_business,
            pk.name AS package_name, pk.badge AS package_badge, pk.monthly_rate_cents AS package_monthly_rate_cents
     FROM turnovers t
     JOIN str_properties sp ON sp.property_id = t.property_id
     JOIN properties p ON p.id = t.property_id
     LEFT JOIN users pr ON pr.id = t.assigned_provider_user_id
     LEFT JOIN users cl ON cl.id = t.client_user_id
     LEFT JOIN client_profiles cpr ON cpr.user_id = t.client_user_id
     LEFT JOIN str_service_packages pk ON pk.key = t.service_package_key
     WHERE t.id = ?`,
  ).bind(turnoverId).first<any>()
}

async function loadChecklist(env: Env, turnoverId: string) {
  const rows = await env.DB.prepare(
    'SELECT * FROM turnover_checklist_items WHERE turnover_id = ? ORDER BY sort_order ASC',
  ).bind(turnoverId).all<any>()
  return rows.results ?? []
}

// Global + property-specific templates, property rows overriding global by
// (category, item_key).
async function templatesFor(env: Env, propertyId: string) {
  const global = await env.DB.prepare(
    'SELECT * FROM str_checklist_templates WHERE property_id IS NULL AND active = 1 ORDER BY sort_order ASC',
  ).all<any>()
  const property = await env.DB.prepare(
    'SELECT * FROM str_checklist_templates WHERE property_id = ? AND active = 1 ORDER BY sort_order ASC',
  ).bind(propertyId).all<any>()
  const overrides = new Map<string, any>()
  for (const row of property.results ?? []) overrides.set(`${row.category}|${row.item_key}`, row)
  const merged: any[] = []
  for (const row of global.results ?? []) {
    const override = overrides.get(`${row.category}|${row.item_key}`)
    merged.push(override ?? row)
  }
  for (const row of property.results ?? []) {
    if (!global.results?.some((g: any) => g.category === row.category && g.item_key === row.item_key)) merged.push(row)
  }
  const CATEGORY_ORDER: Record<string, number> = {
    'Before Starting': 1, Kitchen: 2, Bathrooms: 3, Bedrooms: 4,
    'Living Areas': 5, Laundry: 6, Supplies: 7, 'Final Walkthrough': 8,
  }
  merged.sort((a, b) => (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
  return merged
}

async function materializeChecklist(env: Env, turnoverId: string, propertyId: string, createdBy: string): Promise<D1PreparedStatement[]> {
  const templates = await templatesFor(env, propertyId)
  const statements: D1PreparedStatement[] = []
  let order = 0
  for (const t of templates) {
    statements.push(env.DB.prepare(
      `INSERT INTO turnover_checklist_items
        (id, turnover_id, template_id, category, item_key, label, instructions, required, photo_required, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).bind(uuid(), turnoverId, t.id, t.category, t.item_key, t.label, t.instructions ?? null, t.required, t.photo_required, order))
    order += 1
  }
  return statements
}

// Completeness gate for the guest-ready rule.
async function checklistGate(env: Env, turnover: any) {
  const items = await loadChecklist(env, turnover.id)
  const requiredItems = items.filter((i: any) => i.required === 1)
  const completedItems = requiredItems.filter((i: any) => i.status === 'complete')
  const notApplicableItems = requiredItems.filter((i: any) => i.status === 'not_applicable')
  let requiredPhotoLabels: string[] = []
  try {
    const parsed = JSON.parse(turnover.required_completion_photos_json || '[]')
    requiredPhotoLabels = Array.isArray(parsed) ? parsed.filter((x: unknown) => typeof x === 'string') : []
  } catch { requiredPhotoLabels = [] }
  const photos = await env.DB.prepare('SELECT label, checklist_item_id FROM turnover_photos WHERE turnover_id = ?').bind(turnover.id).all<any>()
  const photoLabels = new Set((photos.results ?? []).map((p: any) => (p.label || '').trim().toLowerCase()))
  const missingRequiredPhotos = requiredPhotoLabels.filter((label) => !photoLabels.has(label.trim().toLowerCase()))
  const issues = await env.DB.prepare(
    "SELECT id, affects_guest_readiness FROM turnover_issues WHERE turnover_id = ? AND status = 'open'",
  ).bind(turnover.id).all<any>()
  const openIssuesAffectingReadiness = (issues.results ?? []).filter((i: any) => i.affects_guest_readiness === 1).length
  const requiredCount = requiredItems.length
  return {
    requiredItems: requiredCount,
    completedItems: completedItems.length,
    notApplicableItems: notApplicableItems.length,
    missingRequiredPhotos,
    openIssuesAffectingReadiness,
  }
}

// Keep the unified calendar in sync with a turnover. A turnover owns one
// stored calendar_events row (event_type 'turnover'); the event is created on
// turnover creation and updated as provider/times/status change.
async function syncTurnoverCalendar(
  env: Env,
  user: SessionUser,
  turnover: any,
  opts: { action?: string; vendorUserId?: string | null; calendarStatus?: string | null } = {},
): Promise<string | null> {
  const checkoutAt = turnover.checkout_at
  const endsAt = turnover.required_complete_at
  const title = turnover.status === 'cancelled'
    ? `Turnover (cancelled): ${turnover.property_nickname || turnover.property_name || 'Property'}`
    : `Turnover: ${turnover.property_nickname || turnover.property_name || 'Property'}`
  const vendorUserId = opts.vendorUserId !== undefined ? opts.vendorUserId : turnover.assigned_provider_user_id
  const calendarStatus = opts.calendarStatus || (turnover.status === 'cancelled' ? 'cancelled' : turnover.status === 'completed' ? 'completed' : 'confirmed')

  if (turnover.calendar_event_id) {
    await env.DB.prepare(
      `UPDATE calendar_events SET
         title = ?, description = ?, starts_at = ?, ends_at = ?, status = ?,
         vendor_user_id = ?, property_id = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).bind(
      title,
      `STR turnover for ${turnover.property_nickname || turnover.property_address || 'property'} — ${turnoverStatusLabel(turnover.status)}.`,
      checkoutAt || endsAt,
      endsAt,
      calendarStatus,
      vendorUserId ?? null,
      turnover.property_id,
      turnover.calendar_event_id,
    ).run()
    return turnover.calendar_event_id
  }

  const eventId = uuid()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO calendar_events (
        id, title, description, starts_at, ends_at, all_day, timezone, event_type, status,
        location_type, location_name, address, created_by_user_id, assigned_user_id,
        client_user_id, matter_id, property_id, vendor_user_id, visibility, client_visible
      ) VALUES (?, ?, ?, ?, ?, 0, NULL, 'turnover', ?, 'client_location', ?, ?, ?, ?, ?, ?, ?, ?, 'client', 1)`,
    ).bind(
      eventId, title,
      `STR turnover for ${turnover.property_nickname || turnover.property_address || 'property'} — ${turnoverStatusLabel(turnover.status)}.`,
      checkoutAt || endsAt, endsAt, calendarStatus,
      turnover.property_nickname || turnover.property_name || 'Property',
      turnover.property_address || null,
      user.id, vendorUserId ?? null, turnover.client_user_id, turnover.matter_id ?? null,
      turnover.property_id, vendorUserId ?? null,
    ),
    env.DB.prepare('UPDATE turnovers SET calendar_event_id = ? WHERE id = ?').bind(eventId, turnover.id),
  ])
  return eventId
}

async function setTurnoverStatus(
  env: Env,
  user: SessionUser,
  turnoverId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<any> {
  const turnover = await loadTurnover(env, turnoverId)
  if (!turnover) throw new ScopeError('not found', 404)
  const sets: string[] = ['status = ?', 'updated_at = datetime(?)']
  const params: unknown[] = [status, isoNow()]
  for (const [key, value] of Object.entries(extra)) {
    sets.push(`${key} = ?`)
    params.push(value ?? null)
  }
  params.push(turnoverId)
  await env.DB.prepare(`UPDATE turnovers SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()
  const updated = await loadTurnover(env, turnoverId)
  await syncTurnoverCalendar(env, user, updated)
  await logActivity(env, {
    actorUserId: user.id,
    clientUserId: turnover.client_user_id,
    kind: 'str_turnover_status',
    detail: { turnover_id: turnoverId, from: turnover.status, to: status, property: turnover.property_address },
  })
  return updated
}

async function notifyStaffTurnover(env: Env, turnover: any, kind: string, title: string, body: string, deepLink: string) {
  const staff = await env.DB.prepare(
    `SELECT u.id FROM users u WHERE u.role IN ('staff','admin') AND u.status = 'active' LIMIT 50`,
  ).all<{ id: string }>()
  for (const row of staff.results ?? []) {
    await pushNotification(env, {
      userId: row.id,
      kind,
      subjectType: 'turnover',
      subjectId: turnover.id,
      title,
      body,
      deepLinkPath: deepLink,
      dedupeWindowSeconds: 900,
    })
  }
}

// ---------------------------------------------------------------------------
// PUBLIC: quote intake
// ---------------------------------------------------------------------------
export const strPublicRoutes = new Hono<AppEnv>()

strPublicRoutes.post('/str/leads', async (c) => {
  const body = await c.req.json<any>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request' }, 400)
  const name = text(body.name, 160)
  const email = text(body.email, 200).toLowerCase()
  const phone = text(body.phone, 40)
  if (!name || !email) return c.json({ error: 'name and email are required' }, 400)

  const inquiryId = uuid()
  const message = [
    `Property: ${text(body.property_address, 500) || 'Not provided'}`,
    `Unit type: ${text(body.unit_type, 120) || 'Not provided'}`,
    `Properties: ${text(body.property_count, 80) || 'Not provided'}`,
    `Turnovers/month: ${text(body.avg_turnovers_per_month, 80) || 'Not provided'}`,
    `Current cleaning: ${text(body.current_cleaning, 300) || 'Not provided'}`,
    `Guest Ready+: ${body.guest_ready_plus ? 'Yes' : 'No'}`,
    `Managed: ${body.managed ? 'Yes' : 'No'}`,
    text(body.notes, 1500) ? `Notes: ${text(body.notes, 1500)}` : '',
  ].filter(Boolean).join('\n')

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO contact_inquiries
        (id, name, email, phone, service_key, message, status, record_type, first_name, last_name, source, lifecycle_stage, city, state)
       VALUES (?, ?, ?, ?, ?, ?, 'new', 'person', ?, ?, 'str_lead', 'lead', ?, ?)`,
    ).bind(
      inquiryId, name, email, phone || null, STR_SERVICE_KEY, message,
      name.split(/\s+/)[0] ?? null, name.split(/\s+/).slice(1).join(' ') || null,
      text(body.city, 100) || null, text(body.state, 100) || null,
    ),
    c.env.DB.prepare(
      `INSERT INTO str_leads
        (inquiry_id, property_count, property_address, unit_type, avg_turnovers_per_month, current_cleaning, guest_ready_plus, managed, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      inquiryId,
      text(body.property_count, 80) || null,
      text(body.property_address, 500) || null,
      text(body.unit_type, 120) || null,
      text(body.avg_turnovers_per_month, 80) || null,
      text(body.current_cleaning, 300) || null,
      body.guest_ready_plus ? 1 : 0,
      body.managed ? 1 : 0,
      text(body.notes, 1500) || null,
    ),
    activityInsert(c.env, {
      inquiryId,
      kind: 'str_lead_created',
      detail: { service_key: STR_SERVICE_KEY, name, email, managed: !!body.managed },
    }),
  ])

  await notifyStaffTurnover(
    c.env,
    { id: inquiryId, property_address: text(body.property_address, 500) || 'STR quote request' },
    'str.lead',
    'New STR turnover quote request',
    `${name} — ${email}${phone ? ` — ${phone}` : ''}`,
    '/admin/crm',
  )
  return c.json({ ok: true, inquiry_id: inquiryId }, 201)
})

// ---------------------------------------------------------------------------
// ADMIN (HQ + provider)
// ---------------------------------------------------------------------------
export const strAdminRoutes = new Hono<AppEnv>()
strAdminRoutes.use('*', requireStaff)
strAdminRoutes.onError((err, c) => applyErr(c, err))

async function requireProviderAccess(env: Env, user: SessionUser, turnover: any): Promise<boolean> {
  if (user.role === 'admin') return true
  if (turnover.assigned_provider_user_id === user.id) return true
  return canAccessClient(env, user, turnover.client_user_id)
}

// ---- Packages / pricing (HQ) ----
strAdminRoutes.get('/str/packages', async (c) => {
  const packages = await c.env.DB.prepare('SELECT * FROM str_service_packages ORDER BY sort_order ASC').all<any>()
  const tiers = await c.env.DB.prepare('SELECT * FROM str_price_tiers ORDER BY sort_order ASC').all<any>()
  const byKey: Record<string, any[]> = {}
  for (const tier of tiers.results ?? []) {
    (byKey[tier.package_key] = byKey[tier.package_key] || []).push(tier)
  }
  return c.json({ packages: (packages.results ?? []).map((p: any) => ({ ...p, tiers: byKey[p.key] ?? [] })) })
})

strAdminRoutes.patch('/str/packages/:key', async (c) => {
  const key = c.req.param('key')
  const body = await c.req.json<any>().catch(() => null)
  const sets: string[] = []
  const params: unknown[] = []
  if (body && body.active !== undefined) { sets.push('active = ?'); params.push(bool(body.active)) }
  if (body && body.name !== undefined) { sets.push('name = ?'); params.push(text(body.name, 160)) }
  if (body && body.description !== undefined) { sets.push('description = ?'); params.push(text(body.description, 1000) || null) }
  if (body && body.badge !== undefined) { sets.push('badge = ?'); params.push(text(body.badge, 80) || null) }
  if (body && body.monthly_rate_cents !== undefined) { sets.push('monthly_rate_cents = ?'); params.push(cents(body.monthly_rate_cents)) }
  if (sets.length === 0) return c.json({ error: 'nothing to update' }, 400)
  sets.push("updated_at = datetime('now')")
  params.push(key)
  await c.env.DB.prepare(`UPDATE str_service_packages SET ${sets.join(', ')} WHERE key = ?`).bind(...params).run()
  await logAudit(c.env, { actorUserId: c.get('user').id, actorIp: actorIp(c.req.raw), actorUserAgent: actorUserAgent(c.req.raw), actorGeo: actorGeo(c.req.raw), action: 'str_package_updated', entityType: 'str_service_package', entityId: key, after: body })
  return c.json({ ok: true })
})

strAdminRoutes.patch('/str/packages/:key/tiers/:tierId', async (c) => {
  const tierId = c.req.param('tierId')
  const body = await c.req.json<any>().catch(() => null)
  const sets: string[] = []
  const params: unknown[] = []
  if (body && body.client_price_cents !== undefined) { sets.push('client_price_cents = ?'); params.push(cents(body.client_price_cents)) }
  if (body && body.provider_payout_cents !== undefined) { sets.push('provider_payout_cents = ?'); params.push(cents(body.provider_payout_cents)) }
  if (body && body.tier_label !== undefined) { sets.push('tier_label = ?'); params.push(text(body.tier_label, 120)) }
  if (sets.length === 0) return c.json({ error: 'nothing to update' }, 400)
  sets.push("updated_at = datetime('now')")
  params.push(tierId)
  await c.env.DB.prepare(`UPDATE str_price_tiers SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()
  await logAudit(c.env, { actorUserId: c.get('user').id, actorIp: actorIp(c.req.raw), actorUserAgent: actorUserAgent(c.req.raw), actorGeo: actorGeo(c.req.raw), action: 'str_price_tier_updated', entityType: 'str_price_tier', entityId: tierId, after: body })
  return c.json({ ok: true })
})

// ---- Checklist templates ----
strAdminRoutes.get('/str/checklist-templates', async (c) => {
  const propertyId = c.req.query('propertyId')
  const global = await c.env.DB.prepare('SELECT * FROM str_checklist_templates WHERE property_id IS NULL AND active = 1 ORDER BY sort_order ASC').all<any>()
  const property = propertyId
    ? await c.env.DB.prepare('SELECT * FROM str_checklist_templates WHERE property_id = ? AND active = 1 ORDER BY sort_order ASC').bind(propertyId).all<any>()
    : { results: [] as any[] }
  return c.json({ global: global.results ?? [], property: property.results ?? [] })
})

strAdminRoutes.post('/str/checklist-templates', async (c) => {
  const body = await c.req.json<any>().catch(() => null)
  const category = text(body?.category, 60)
  const itemKey = text(body?.item_key, 80)
  const label = text(body?.label, 200)
  if (!category || !itemKey || !label) return c.json({ error: 'category, item_key, and label are required' }, 400)
  const propertyId = text(body?.property_id, 100) || null
  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO str_checklist_templates
      (id, property_id, category, item_key, label, instructions, required, photo_required, issue_required, sort_order, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  ).bind(
    id, propertyId, category, itemKey, label, text(body?.instructions, 500) || null,
    body?.required === false ? 0 : 1, body?.photo_required ? 1 : 0, body?.issue_required ? 1 : 0,
    optionalInt(body?.sort_order, 0),
  ).run()
  return c.json({ ok: true, id }, 201)
})

strAdminRoutes.patch('/str/checklist-templates/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>().catch(() => null)
  const sets: string[] = []
  const params: unknown[] = []
  if (body) {
    if (body.label !== undefined) { sets.push('label = ?'); params.push(text(body.label, 200)) }
    if (body.instructions !== undefined) { sets.push('instructions = ?'); params.push(text(body.instructions, 500) || null) }
    if (body.required !== undefined) { sets.push('required = ?'); params.push(bool(body.required)) }
    if (body.photo_required !== undefined) { sets.push('photo_required = ?'); params.push(bool(body.photo_required)) }
    if (body.issue_required !== undefined) { sets.push('issue_required = ?'); params.push(bool(body.issue_required)) }
    if (body.active !== undefined) { sets.push('active = ?'); params.push(bool(body.active)) }
    if (body.sort_order !== undefined) { sets.push('sort_order = ?'); params.push(optionalInt(body.sort_order, 0)) }
  }
  if (sets.length === 0) return c.json({ error: 'nothing to update' }, 400)
  params.push(id)
  await c.env.DB.prepare(`UPDATE str_checklist_templates SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()
  return c.json({ ok: true })
})

// ---- STR properties ----
strAdminRoutes.get('/str/property-picker', async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user, 'p.client_user_id')
  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.address, p.name, p.city, p.state, p.property_type, p.client_user_id,
            u.full_name AS client_name, cpr.business_name AS client_business,
            CASE WHEN sp.property_id IS NULL THEN 0 ELSE 1 END AS has_str_profile
     FROM properties p
     LEFT JOIN users u ON u.id = p.client_user_id
     LEFT JOIN client_profiles cpr ON cpr.user_id = p.client_user_id
     LEFT JOIN str_properties sp ON sp.property_id = p.id
     WHERE ${where}
     ORDER BY p.created_at DESC LIMIT 500`,
  ).bind(...params).all<any>()
  return c.json({ properties: rows.results ?? [] })
})

strAdminRoutes.get('/str/properties', async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user, 'sp.client_user_id')
  const rows = await c.env.DB.prepare(
    `SELECT sp.*, p.address, p.city, p.state, u.full_name AS client_name, cpr.business_name AS client_business,
            pr.full_name AS primary_provider_name, pk.name AS package_name,
            (SELECT COUNT(*) FROM turnovers t WHERE t.property_id = sp.property_id AND t.status NOT IN ('completed','cancelled')) AS active_turnovers
     FROM str_properties sp
     JOIN properties p ON p.id = sp.property_id
     LEFT JOIN users u ON u.id = sp.client_user_id
     LEFT JOIN client_profiles cpr ON cpr.user_id = sp.client_user_id
     LEFT JOIN users pr ON pr.id = sp.primary_provider_user_id
     LEFT JOIN str_service_packages pk ON pk.key = sp.service_package_key
     WHERE ${where}
     ORDER BY sp.created_at DESC LIMIT 300`,
  ).bind(...params).all<any>()
  return c.json({ properties: rows.results ?? [] })
})

strAdminRoutes.get('/str/properties/:propertyId', async (c) => {
  const user = c.get('user')
  const found = await loadStrProperty(c.env, c.req.param('propertyId'))
  if (!found) return c.json({ error: 'not found' }, 404)
  if (!(await canAccessClient(c.env, user, found.property.client_user_id))) return c.json({ error: 'forbidden' }, 403)
  const [supplies, access, calendars, turnovers] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM str_supplies WHERE property_id = ? AND active = 1 ORDER BY name').bind(found.property.id).all<any>(),
    c.env.DB.prepare('SELECT * FROM str_property_access WHERE property_id = ? ORDER BY created_at').bind(found.property.id).all<any>(),
    c.env.DB.prepare('SELECT * FROM str_reservation_calendars WHERE property_id = ? ORDER BY created_at').bind(found.property.id).all<any>(),
    c.env.DB.prepare(
      `SELECT t.id, t.turnover_date, t.status, t.required_complete_at, t.client_charge_cents, t.provider_payout_cents, t.payout_status,
              u.full_name AS provider_name
       FROM turnovers t LEFT JOIN users u ON u.id = t.assigned_provider_user_id
       WHERE t.property_id = ? ORDER BY t.turnover_date DESC LIMIT 20`,
    ).bind(found.property.id).all<any>(),
  ])
  return c.json({
    profile: found.profile,
    property: found.property,
    supplies: supplies.results ?? [],
    access: access.results ?? [],
    reservation_calendars: calendars.results ?? [],
    turnovers: turnovers.results ?? [],
  })
})

strAdminRoutes.post('/str/properties', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  if (!body?.property_id) return c.json({ error: 'property_id is required' }, 400)
  const property = await c.env.DB.prepare('SELECT id, client_user_id, address, name FROM properties WHERE id = ?').bind(body.property_id).first<any>()
  if (!property) return c.json({ error: 'property not found' }, 404)
  if (!(await canAccessClient(c.env, user, property.client_user_id))) return c.json({ error: 'forbidden' }, 403)
  const exists = await c.env.DB.prepare('SELECT property_id FROM str_properties WHERE property_id = ?').bind(property.id).first()
  if (exists) return c.json({ error: 'STR profile already exists for this property' }, 409)

  const packageKey = text(body.service_package_key, 40) || null
  const pricing = packageKey ? await computeTurnoverPricing(c.env, packageKey, optionalInt(body.bedrooms, null)) : null
  const profileId = property.id
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO str_properties (
        property_id, client_user_id, nickname, platform, platform_url, bedrooms, bathrooms, max_guests,
        checkout_time, checkin_time, turnover_window_minutes, access_instructions, building_entry, parking,
        supplies_notes, staging_notes, linen_config_json, required_completion_photos_json,
        service_package_key, primary_provider_user_id, backup_provider_user_ids_json,
        supply_tracking_enabled, priority_dispatch, managed_monthly_rate_cents, auto_create_turnovers, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    ).bind(
      profileId, property.client_user_id,
      text(body.nickname, 160) || null,
      text(body.platform, 40) || null,
      text(body.platform_url, 500) || null,
      optionalInt(body.bedrooms, null),
      text(body.bathrooms, 40) || null,
      optionalInt(body.max_guests, null),
      text(body.checkout_time, 10) || null,
      text(body.checkin_time, 10) || null,
      Math.max(30, Math.min(720, optionalInt(body.turnover_window_minutes, 180) ?? 180)),
      text(body.access_instructions, 1000) || null,
      text(body.building_entry, 500) || null,
      text(body.parking, 500) || null,
      text(body.supplies_notes, 1000) || null,
      text(body.staging_notes, 1000) || null,
      JSON.stringify(Array.isArray(body.linen_config_json) ? body.linen_config_json : {}),
      JSON.stringify(Array.isArray(body.required_completion_photos_json) ? body.required_completion_photos_json : ['Kitchen', 'Bedroom', 'Bathroom', 'Living Area', 'Entry']),
      packageKey,
      text(body.primary_provider_user_id, 100) || null,
      JSON.stringify(Array.isArray(body.backup_provider_user_ids) ? body.backup_provider_user_ids : []),
      body.supply_tracking_enabled ? 1 : 0,
      body.priority_dispatch ? 1 : 0,
      body.managed_monthly_rate_cents !== undefined ? cents(body.managed_monthly_rate_cents) : pricing?.packageKey === 'managed' ? 9900 : null,
      body.auto_create_turnovers ? 1 : 0,
    ),
    activityInsert(c.env, {
      actorUserId: user.id,
      clientUserId: property.client_user_id,
      kind: 'str_property_created',
      detail: { property_id: property.id, address: property.address },
    }),
  ])

  // Portal nav is driven by services_enrolled — make the vertical discoverable.
  const cp = await c.env.DB.prepare('SELECT services_enrolled FROM client_profiles WHERE user_id = ?').bind(property.client_user_id).first<{ services_enrolled: string | null }>()
  if (cp) {
    let enrolled: string[] = []
    try { enrolled = JSON.parse(cp.services_enrolled || '[]') } catch { enrolled = [] }
    if (!enrolled.includes(STR_SERVICE_KEY)) {
      enrolled.push(STR_SERVICE_KEY)
      await c.env.DB.prepare('UPDATE client_profiles SET services_enrolled = ? WHERE user_id = ?').bind(JSON.stringify(enrolled), property.client_user_id).run()
    }
  }
  return c.json({ ok: true, property_id: profileId }, 201)
})

strAdminRoutes.patch('/str/properties/:propertyId', async (c) => {
  const user = c.get('user')
  const found = await loadStrProperty(c.env, c.req.param('propertyId'))
  if (!found) return c.json({ error: 'not found' }, 404)
  if (!(await canAccessClient(c.env, user, found.property.client_user_id))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>().catch(() => null)
  const sets: string[] = []
  const params: unknown[] = []
  const map: Record<string, unknown> = {
    nickname: body?.nickname !== undefined ? text(body.nickname, 160) || null : undefined,
    platform: body?.platform !== undefined ? text(body.platform, 40) || null : undefined,
    platform_url: body?.platform_url !== undefined ? text(body.platform_url, 500) || null : undefined,
    bedrooms: body?.bedrooms !== undefined ? optionalInt(body.bedrooms, null) : undefined,
    bathrooms: body?.bathrooms !== undefined ? text(body.bathrooms, 40) || null : undefined,
    max_guests: body?.max_guests !== undefined ? optionalInt(body.max_guests, null) : undefined,
    checkout_time: body?.checkout_time !== undefined ? text(body.checkout_time, 10) || null : undefined,
    checkin_time: body?.checkin_time !== undefined ? text(body.checkin_time, 10) || null : undefined,
    access_instructions: body?.access_instructions !== undefined ? text(body.access_instructions, 1000) || null : undefined,
    building_entry: body?.building_entry !== undefined ? text(body.building_entry, 500) || null : undefined,
    parking: body?.parking !== undefined ? text(body.parking, 500) || null : undefined,
    supplies_notes: body?.supplies_notes !== undefined ? text(body.supplies_notes, 1000) || null : undefined,
    staging_notes: body?.staging_notes !== undefined ? text(body.staging_notes, 1000) || null : undefined,
    primary_provider_user_id: body?.primary_provider_user_id !== undefined ? text(body.primary_provider_user_id, 100) || null : undefined,
    service_package_key: body?.service_package_key !== undefined ? text(body.service_package_key, 40) || null : undefined,
    supply_tracking_enabled: body?.supply_tracking_enabled !== undefined ? bool(body.supply_tracking_enabled) : undefined,
    priority_dispatch: body?.priority_dispatch !== undefined ? bool(body.priority_dispatch) : undefined,
    auto_create_turnovers: body?.auto_create_turnovers !== undefined ? bool(body.auto_create_turnovers) : undefined,
    active: body?.active !== undefined ? bool(body.active) : undefined,
  }
  if (body?.turnover_window_minutes !== undefined) map.turnover_window_minutes = Math.max(30, Math.min(720, optionalInt(body.turnover_window_minutes, 180) ?? 180))
  if (body?.managed_monthly_rate_cents !== undefined) map.managed_monthly_rate_cents = cents(body.managed_monthly_rate_cents)
  if (body?.required_completion_photos_json !== undefined) map.required_completion_photos_json = JSON.stringify(Array.isArray(body.required_completion_photos_json) ? body.required_completion_photos_json : [])
  if (body?.backup_provider_user_ids !== undefined) map.backup_provider_user_ids_json = JSON.stringify(Array.isArray(body.backup_provider_user_ids) ? body.backup_provider_user_ids : [])
  for (const [col, value] of Object.entries(map)) {
    if (value !== undefined) { sets.push(`${col} = ?`); params.push(value) }
  }
  if (sets.length === 0) return c.json({ error: 'nothing to update' }, 400)
  sets.push("updated_at = datetime('now')")
  params.push(found.property.id)
  await c.env.DB.prepare(`UPDATE str_properties SET ${sets.join(', ')} WHERE property_id = ?`).bind(...params).run()
  await logActivity(c.env, { actorUserId: user.id, clientUserId: found.property.client_user_id, kind: 'str_property_updated', detail: { property_id: found.property.id } })
  return c.json({ ok: true })
})

// ---- Secure access credentials ----
strAdminRoutes.get('/str/properties/:propertyId/access', async (c) => {
  const found = await loadStrProperty(c.env, c.req.param('propertyId'))
  if (!found) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, c.get('user'), { assigned_provider_user_id: found.profile.primary_provider_user_id, client_user_id: found.property.client_user_id }))) return c.json({ error: 'forbidden' }, 403)
  const rows = await c.env.DB.prepare('SELECT * FROM str_property_access WHERE property_id = ? ORDER BY created_at').bind(found.property.id).all<any>()
  return c.json({ access: rows.results ?? [] })
})

strAdminRoutes.post('/str/properties/:propertyId/access', async (c) => {
  const user = c.get('user')
  const found = await loadStrProperty(c.env, c.req.param('propertyId'))
  if (!found) return c.json({ error: 'not found' }, 404)
  if (!(await canAccessClient(c.env, user, found.property.client_user_id))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>().catch(() => null)
  const label = text(body?.label, 120)
  if (!label) return c.json({ error: 'label is required' }, 400)
  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO str_property_access (id, property_id, label, entry_method, code_value, lockbox_location, instructions, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, found.property.id, label, text(body?.entry_method, 40) || null,
    text(body?.code_value, 300) || null, text(body?.lockbox_location, 200) || null,
    text(body?.instructions, 1000) || null, user.id,
  ).run()
  await logAudit(c.env, { actorUserId: user.id, actorIp: actorIp(c.req.raw), actorUserAgent: actorUserAgent(c.req.raw), actorGeo: actorGeo(c.req.raw), action: 'str_access_credential_created', entityType: 'str_property_access', entityId: id, after: { label, property_id: found.property.id } })
  return c.json({ ok: true, id }, 201)
})

strAdminRoutes.delete('/str/properties/:propertyId/access/:id', async (c) => {
  const user = c.get('user')
  const found = await loadStrProperty(c.env, c.req.param('propertyId'))
  if (!found) return c.json({ error: 'not found' }, 404)
  if (!(await canAccessClient(c.env, user, found.property.client_user_id))) return c.json({ error: 'forbidden' }, 403)
  await c.env.DB.prepare('DELETE FROM str_property_access WHERE id = ? AND property_id = ?').bind(c.req.param('id'), found.property.id).run()
  return c.json({ ok: true })
})

// ---- Supplies ----
strAdminRoutes.post('/str/properties/:propertyId/supplies', async (c) => {
  const user = c.get('user')
  const found = await loadStrProperty(c.env, c.req.param('propertyId'))
  if (!found) return c.json({ error: 'not found' }, 404)
  if (!(await canAccessClient(c.env, user, found.property.client_user_id))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>().catch(() => null)
  const name = text(body?.name, 120)
  if (!name) return c.json({ error: 'name is required' }, 400)
  const id = uuid()
  await c.env.DB.prepare(
    'INSERT INTO str_supplies (id, property_id, name, par_level, stock, active) VALUES (?, ?, ?, ?, ?, 1)',
  ).bind(id, found.property.id, name, Math.max(1, optionalInt(body?.par_level, 1) ?? 1), Math.max(0, optionalInt(body?.stock, 1) ?? 1)).run()
  return c.json({ ok: true, id }, 201)
})

strAdminRoutes.patch('/str/properties/:propertyId/supplies/:id', async (c) => {
  const body = await c.req.json<any>().catch(() => null)
  const sets: string[] = []
  const params: unknown[] = []
  if (body) {
    if (body.name !== undefined) { sets.push('name = ?'); params.push(text(body.name, 120)) }
    if (body.par_level !== undefined) { sets.push('par_level = ?'); params.push(Math.max(1, optionalInt(body.par_level, 1) ?? 1)) }
    if (body.stock !== undefined) { sets.push('stock = ?'); params.push(Math.max(0, optionalInt(body.stock, 0) ?? 0)) }
    if (body.active !== undefined) { sets.push('active = ?'); params.push(bool(body.active)) }
  }
  if (sets.length === 0) return c.json({ error: 'nothing to update' }, 400)
  sets.push("updated_at = datetime('now')")
  params.push(c.req.param('id'), c.req.param('propertyId'))
  await c.env.DB.prepare(`UPDATE str_supplies SET ${sets.join(', ')} WHERE id = ? AND property_id = ?`).bind(...params).run()
  return c.json({ ok: true })
})

// ---- Reservation calendars (iCal foundation) ----
strAdminRoutes.post('/str/properties/:propertyId/reservation-calendars', async (c) => {
  const found = await loadStrProperty(c.env, c.req.param('propertyId'))
  if (!found) return c.json({ error: 'not found' }, 404)
  const body = await c.req.json<any>().catch(() => null)
  const url = text(body?.ical_url, 2000)
  const platform = text(body?.platform, 40) || 'other'
  if (!url || !/^https?:\/\//i.test(url)) return c.json({ error: 'a valid https iCal URL is required' }, 400)
  const id = uuid()
  await c.env.DB.prepare(
    'INSERT INTO str_reservation_calendars (id, property_id, platform, ical_url, enabled) VALUES (?, ?, ?, ?, ?)',
  ).bind(id, found.property.id, platform, url, body?.enabled === false ? 0 : 1).run()
  await logActivity(c.env, { actorUserId: c.get('user').id, clientUserId: found.property.client_user_id, kind: 'str_calendar_added', detail: { property_id: found.property.id, platform } })
  return c.json({ ok: true, id }, 201)
})

strAdminRoutes.patch('/str/reservation-calendars/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>().catch(() => null)
  const sets: string[] = []
  const params: unknown[] = []
  if (body) {
    if (body.enabled !== undefined) { sets.push('enabled = ?'); params.push(bool(body.enabled)) }
    if (body.platform !== undefined) { sets.push('platform = ?'); params.push(text(body.platform, 40)) }
  }
  if (sets.length === 0) return c.json({ error: 'nothing to update' }, 400)
  sets.push("updated_at = datetime('now')")
  params.push(id)
  await c.env.DB.prepare(`UPDATE str_reservation_calendars SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()
  return c.json({ ok: true })
})

strAdminRoutes.delete('/str/reservation-calendars/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM str_reservation_calendars WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// Parse a minimal iCal/ICS VEVENT block. Deliberately dependency-free and
// conservative: we only need UID/DTSTART/DTEND/SUMMARY for guest windows.
function parseIcalEvents(ics: string): Array<{ uid: string; start: string; end: string; summary: string }> {
  const events: Array<{ uid: string; start: string; end: string; summary: string }> = []
  const vevent = /\r?\nBEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/i
  let rest = ics
  let match: RegExpExecArray | null
  let guard = 0
  while ((match = vevent.exec(rest)) && guard < 1000) {
    guard++
    const block = match[1]
    rest = rest.slice(match.index + match[0].length)
    const read = (name: string): string => {
      const re = new RegExp(`^${name}:(.*)$`, 'mi')
      const m = block.match(re)
      return m ? m[1].trim().replace(/\r/g, '') : ''
    }
    const uid = read('UID')
    const start = read('DTSTART')
    const end = read('DTEND')
    const summary = read('SUMMARY')
    if (!uid || !start) continue
    // Accept DATE (YYYYMMDD) and DATETIME (YYYYMMDDTHHMMSS[Z]); ignore floats/periods.
    const normalize = (v: string): string => {
      const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/)
      if (!m) return ''
      const date = `${m[1]}-${m[2]}-${m[3]}`
      if (!m[4]) return `${date}T12:00:00Z`
      const time = `${m[4]}:${m[5]}:${m[6]}`
      return m[7] ? `${date}T${time}Z` : `${date}T${time}`
    }
    const startNorm = normalize(start)
    const endNorm = end ? normalize(end) : ''
    if (!startNorm) continue
    events.push({ uid, start: startNorm, end: endNorm, summary })
  }
  return events
}

strAdminRoutes.post('/str/reservation-calendars/:id/sync', async (c) => {
  const user = c.get('user')
  const cal = await c.env.DB.prepare(
    'SELECT * FROM str_reservation_calendars WHERE id = ?',
  ).bind(c.req.param('id')).first<any>()
  if (!cal) return c.json({ error: 'not found' }, 404)
  const profile = await c.env.DB.prepare('SELECT auto_create_turnovers, service_package_key FROM str_properties WHERE property_id = ?').bind(cal.property_id).first<any>()
  if (!profile) return c.json({ error: 'property profile not found' }, 404)

  let ics: string
  try {
    const response = await fetch(cal.ical_url, { headers: { 'user-agent': 'Pinnacle STR Sync/1.0' }, signal: AbortSignal.timeout(15000) })
    if (!response.ok) return c.json({ error: `iCal fetch failed (${response.status})` }, 502)
    ics = await response.text()
  } catch (err) {
    return c.json({ error: 'iCal fetch failed — check the URL' }, 502)
  }

  const events = parseIcalEvents(ics)
  const statements: D1PreparedStatement[] = []
  let created = 0
  let updated = 0
  for (const ev of events) {
    const existing = await c.env.DB.prepare(
      'SELECT id, created_turnover_id, end_at FROM str_reservations WHERE calendar_id = ? AND external_uid = ?',
    ).bind(cal.id, ev.uid).first<any>()
    if (existing) {
      if (existing.end_at !== ev.end || existing.created_turnover_id) {
        statements.push(c.env.DB.prepare(
          'UPDATE str_reservations SET start_at = ?, end_at = ?, title = ?, updated_at = datetime(?) WHERE id = ?',
        ).bind(ev.start, ev.end || ev.start, ev.summary || null, new Date().toISOString(), existing.id))
        updated++
      }
      continue
    }
    const reservationId = uuid()
    statements.push(c.env.DB.prepare(
      'INSERT INTO str_reservations (id, calendar_id, external_uid, title, start_at, end_at, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(reservationId, cal.id, ev.uid, ev.summary || null, ev.start, ev.end || ev.start, JSON.stringify({ source: 'ical', summary: ev.summary })))
    updated++

    // Only auto-create turnovers when explicitly enabled on the profile.
    if (profile.auto_create_turnovers === 1 && ev.start && ev.end) {
      const existingTurnover = await c.env.DB.prepare(
        'SELECT id FROM turnovers WHERE reservation_id = ?',
      ).bind(reservationId).first()
      if (!existingTurnover) {
        const prop = await c.env.DB.prepare(
          'SELECT client_user_id, service_package_key FROM str_properties WHERE property_id = ?',
        ).bind(cal.property_id).first<any>()
        const pricing = await computeTurnoverPricing(c.env, profile.service_package_key || prop.service_package_key, null)
        const turnoverId = uuid()
        const guestArrival = new Date(ev.end)
        const turnoverDate = guestArrival.toISOString().slice(0, 10)
        const checkout = ev.end.replace('Z', '') || ev.end
        statements.push(c.env.DB.prepare(
          `INSERT INTO turnovers (
            id, property_id, client_user_id, service_package_key, status, turnover_date,
            checkout_at, required_complete_at, provider_payout_cents, client_charge_cents,
            payout_status, source, reservation_id, notes_internal, created_by_user_id
          ) VALUES (?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, 'pending', 'reservation', ?, ?, ?)`,
        ).bind(
          turnoverId, cal.property_id, prop.client_user_id,
          pricing.packageKey, turnoverDate, checkout,
          addMinutes(checkout, 180), pricing.payoutCents, pricing.chargeCents,
          reservationId, 'Auto-created from reservation feed', user.id,
        ))
        created++
      }
    }
  }

  if (statements.length > 0) await c.env.DB.batch(statements)
  await c.env.DB.prepare("UPDATE str_reservation_calendars SET last_synced_at = datetime('now') WHERE id = ?").bind(cal.id).run()
  await logActivity(c.env, { actorUserId: user.id, clientUserId: (await c.env.DB.prepare('SELECT client_user_id FROM str_properties WHERE property_id = ?').bind(cal.property_id).first<any>())?.client_user_id ?? null, kind: 'str_calendar_synced', detail: { calendar_id: cal.id, events: events.length, created_turnovers: created } })
  return c.json({ ok: true, events_found: events.length, created_turnovers: created, updated })
})

// ---- Ops board ----
strAdminRoutes.get('/str/operations', async (c) => {
  const user = c.get('user')
  const status = c.req.query('status')
  const from = c.req.query('from')
  const to = c.req.query('to')
  const propertyId = c.req.query('property')
  const providerId = c.req.query('provider')
  const clientId = c.req.query('client')
  const { where: scope, params: scopeParams } = await scopeFilter(c.env, user, 't.client_user_id')

  const clauses: string[] = [scope]
  const params: unknown[] = [...scopeParams]
  if (status) { clauses.push('t.status = ?'); params.push(status) }
  if (from) { clauses.push('t.turnover_date >= ?'); params.push(from) }
  if (to) { clauses.push('t.turnover_date <= ?'); params.push(to) }
  if (propertyId) { clauses.push('t.property_id = ?'); params.push(propertyId) }
  if (providerId) { clauses.push('t.assigned_provider_user_id = ?'); params.push(providerId) }
  if (clientId) { clauses.push('t.client_user_id = ?'); params.push(clientId) }
  const where = `WHERE ${clauses.join(' AND ')}`

  const rows = await c.env.DB.prepare(
    `SELECT t.*, p.address AS property_address, sp.nickname AS property_nickname,
            u.full_name AS client_name, cpr.business_name AS client_business,
            pr.full_name AS provider_name, pk.name AS package_name, pk.badge AS package_badge
     FROM turnovers t
     JOIN str_properties sp ON sp.property_id = t.property_id
     JOIN properties p ON p.id = t.property_id
     LEFT JOIN users u ON u.id = t.client_user_id
     LEFT JOIN client_profiles cpr ON cpr.user_id = t.client_user_id
     LEFT JOIN users pr ON pr.id = t.assigned_provider_user_id
     LEFT JOIN str_service_packages pk ON pk.key = t.service_package_key
     ${where}
     ORDER BY t.turnover_date ASC, t.required_complete_at ASC LIMIT 300`,
  ).bind(...params).all<any>()
  return c.json({ turnovers: rows.results ?? [] })
})

strAdminRoutes.get('/str/operations/summary', async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user, 'client_user_id')
  const scoped = (sql: string) => sql.replace('WHERE', `WHERE ${where} AND`)
  const active = await c.env.DB.prepare(
    scoped(`SELECT t.status, COUNT(*) n FROM turnovers t WHERE status NOT IN ('completed','cancelled') GROUP BY t.status`),
  ).bind(...params).all<{ status: string; n: number }>()
  const today = new Date().toISOString().slice(0, 10)
  const [todayCount, atRisk, unassigned, openIssues, awaitingVerification] = await Promise.all([
    c.env.DB.prepare(scoped(`SELECT COUNT(*) n FROM turnovers WHERE turnover_date = ? AND status NOT IN (?,?)`)).bind(...params, today, 'completed', 'cancelled').first<{ n: number }>(),
    c.env.DB.prepare(scoped(`SELECT COUNT(*) n FROM turnovers WHERE status = 'at_risk'`)).bind(...params).first<{ n: number }>(),
    c.env.DB.prepare(scoped(`SELECT COUNT(*) n FROM turnovers WHERE status IN ('scheduled')`)).bind(...params).first<{ n: number }>(),
    c.env.DB.prepare(
      scoped(`SELECT COUNT(*) n FROM turnover_issues i WHERE i.status = 'open'`),
    ).bind(...params).first<{ n: number }>(),
    c.env.DB.prepare(scoped(`SELECT COUNT(*) n FROM turnovers WHERE status = 'verification_needed'`)).bind(...params).first<{ n: number }>(),
  ])
  return c.json({
    today: todayCount?.n ?? 0,
    at_risk: atRisk?.n ?? 0,
    unassigned: unassigned?.n ?? 0,
    open_issues: openIssues?.n ?? 0,
    awaiting_verification: awaitingVerification?.n ?? 0,
    by_status: active.results ?? [],
  })
})

// ---- Turnover create ----
strAdminRoutes.post('/str/turnovers', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  const propertyId = text(body?.property_id, 100)
  if (!propertyId) return c.json({ error: 'property_id is required' }, 400)
  const found = await loadStrProperty(c.env, propertyId)
  if (!found) return c.json({ error: 'property not found' }, 404)
  if (!(await canAccessClient(c.env, user, found.property.client_user_id))) return c.json({ error: 'forbidden' }, 403)

  const turnoverDate = text(body?.turnover_date, 10)
  if (!isDateKey(turnoverDate)) return c.json({ error: 'turnover_date must be YYYY-MM-DD (arrival day)' }, 400)

  const profile = found.profile
  const packageKey = text(body?.service_package_key, 40) || profile.service_package_key || 'guest_ready'
  const pricing = await computeTurnoverPricing(c.env, packageKey, profile.bedrooms ?? optionalInt(body?.bedrooms, null))

  // Checkout window: explicit checkout_at wins; otherwise the profile
  // checkout_time on turnover_date; otherwise 11:00 local.
  const checkoutTime = text(body?.checkout_at, 40) || (profile.checkout_time ? `${turnoverDate}T${profile.checkout_time}` : `${turnoverDate}T11:00:00`)
  const windowMinutes = Math.max(30, Math.min(720, optionalInt(body?.turnover_window_minutes, profile.turnover_window_minutes ?? 180) ?? 180))
  const requiredCompleteAt = isoDateTime(text(body?.required_complete_at, 40) || addMinutes(checkoutTime, windowMinutes))

  const id = uuid()
  const assignedProviderId = text(body?.assigned_provider_user_id, 100) || null
  if (assignedProviderId) {
    const prov = await c.env.DB.prepare("SELECT id FROM users WHERE id = ? AND role IN ('staff','admin') AND status = 'active'").bind(assignedProviderId).first()
    if (!prov) return c.json({ error: 'provider not found or not active' }, 400)
  }

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO turnovers (
        id, property_id, client_user_id, service_package_key, status, turnover_date,
        checkout_at, required_complete_at, assigned_provider_user_id, assigned_by_user_id,
        provider_payout_cents, payout_status, client_charge_cents, source, notes_internal, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    ).bind(
      id, propertyId, found.property.client_user_id, pricing.packageKey,
      assignedProviderId ? 'accepted' : 'scheduled', turnoverDate,
      isoDateTime(checkoutTime), requiredCompleteAt,
      assignedProviderId, user.id,
      pricing.payoutCents, pricing.chargeCents,
      text(body?.source, 30) || 'manual', text(body?.notes_internal, 2000) || null, user.id,
    ),
    ...await materializeChecklist(c.env, id, propertyId, user.id),
    activityInsert(c.env, {
      actorUserId: user.id,
      clientUserId: found.property.client_user_id,
      kind: 'str_turnover_created',
      detail: { turnover_id: id, property_id: propertyId, turnover_date: turnoverDate, package_key: pricing.packageKey },
    }),
  ]
  await c.env.DB.batch(statements)

  const turnover = await loadTurnover(c.env, id)
  await syncTurnoverCalendar(c.env, user, turnover)
  const refreshed = await loadTurnover(c.env, id)

  await notifyClientEvent(c.env, {
    clientUserId: found.property.client_user_id,
    eventKey: 'str.turnover_scheduled',
    subject: 'A turnover is scheduled for your property',
    title: `Turnover scheduled — ${turnoverDate}`,
    body: `A turnover is scheduled for ${profile.nickname || found.property.address}. We will confirm coverage ahead of the checkout window.`,
    ctaLabel: 'View turnover',
    ctaPath: `/portal/str/turnovers/${id}`,
  })
  if (assignedProviderId) {
    await pushNotification(c.env, {
      userId: assignedProviderId,
      kind: 'str.assignment',
      subjectType: 'turnover',
      subjectId: id,
      title: 'Turnover assigned to you',
      body: `${profile.nickname || found.property.address} — ${turnoverDate}`,
      deepLinkPath: '/admin/str/mine',
    })
  }
  return c.json({ ok: true, id, package_key: pricing.packageKey, client_charge_cents: pricing.chargeCents, provider_payout_cents: pricing.payoutCents }, 201)
})

// ---- Turnover detail (HQ/provider) ----
strAdminRoutes.get('/str/turnovers/:id', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  const [checklist, photos, issues, supplies, access, gate] = await Promise.all([
    loadChecklist(c.env, turnover.id),
    c.env.DB.prepare('SELECT * FROM turnover_photos WHERE turnover_id = ? ORDER BY created_at ASC').bind(turnover.id).all<any>(),
    c.env.DB.prepare('SELECT * FROM turnover_issues WHERE turnover_id = ? ORDER BY created_at ASC').bind(turnover.id).all<any>(),
    c.env.DB.prepare(
      `SELECT ss.observed_stock, ss.flag, ss.notes, s.name AS supply_name
       FROM turnover_supply_status ss JOIN str_supplies s ON s.id = ss.supply_id
       WHERE ss.turnover_id = ? ORDER BY s.name`,
    ).bind(turnover.id).all<any>(),
    c.env.DB.prepare('SELECT * FROM str_property_access WHERE property_id = ? ORDER BY created_at').bind(turnover.property_id).all<any>(),
    checklistGate(c.env, turnover),
  ])
  const isProvider = turnover.assigned_provider_user_id === user.id
  return c.json({
    turnover,
    checklist: checklist,
    photos: (photos.results ?? []).map((p: any) => ({ ...p, url: `/admin/str/photos/${p.id}` })),
    issues: issues.results ?? [],
    supplies: supplies.results ?? [],
    access: isProvider || user.role === 'admin' ? access.results ?? [] : [],
    gate,
  })
})

// ---- Assignment / offers ----
async function offerTurnover(c: any, turnover: any, providerUserId: string, reason?: string) {
  const user = c.get('user')
  const prov = await c.env.DB.prepare("SELECT id, full_name FROM users WHERE id = ? AND role IN ('staff','admin') AND status = 'active'").bind(providerUserId).first()
  if (!prov) return c.json({ error: 'provider not found or not active' }, 400)
  if (turnover.status !== 'scheduled' && turnover.status !== 'offered' && turnover.status !== 'at_risk') {
    return c.json({ error: `cannot offer a turnover in status '${turnover.status}'` }, 409)
  }
  await c.env.DB.prepare(
    "UPDATE turnovers SET status = 'offered', offered_provider_user_id = ?, updated_at = datetime(?) WHERE id = ?",
  ).bind(providerUserId, isoNow(), turnover.id).run()
  const updated = await loadTurnover(c.env, turnover.id)
  await syncTurnoverCalendar(c.env, user, updated)
  await logActivity(c.env, {
    actorUserId: user.id,
    clientUserId: turnover.client_user_id,
    kind: 'str_turnover_offered',
    detail: { turnover_id: turnover.id, provider_id: providerUserId, reason: reason || null },
  })
  await pushNotification(c.env, {
    userId: providerUserId,
    kind: 'str.offer',
    subjectType: 'turnover',
    subjectId: turnover.id,
    title: 'New turnover offer',
    body: `${turnover.property_nickname || turnover.property_address} — ${turnover.turnover_date}${reason ? ` (${reason})` : ''}`,
    deepLinkPath: '/admin/str/mine',
  })
  return c.json({ ok: true, offered_to: providerUserId })
}

strAdminRoutes.post('/str/turnovers/:id/assign', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  const providerUserId = text(body?.provider_user_id, 100)
  if (!providerUserId) return c.json({ error: 'provider_user_id is required' }, 400)
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  const prov = await c.env.DB.prepare("SELECT id, full_name FROM users WHERE id = ? AND role IN ('staff','admin') AND status = 'active'").bind(providerUserId).first<any>()
  if (!prov) return c.json({ error: 'provider not found or not active' }, 400)
  await c.env.DB.prepare(
    `UPDATE turnovers SET status = 'accepted', assigned_provider_user_id = ?, offered_provider_user_id = NULL, assigned_by_user_id = ?, updated_at = datetime(?)
     WHERE id = ?`,
  ).bind(providerUserId, user.id, isoNow(), turnover.id).run()
  const updated = await loadTurnover(c.env, turnover.id)
  await syncTurnoverCalendar(c.env, user, updated)
  await logActivity(c.env, {
    actorUserId: user.id,
    clientUserId: turnover.client_user_id,
    kind: 'str_turnover_assigned',
    detail: { turnover_id: turnover.id, from: turnover.assigned_provider_user_id ?? null, to: providerUserId },
  })
  await pushNotification(c.env, {
    userId: providerUserId,
    kind: 'str.assignment',
    subjectType: 'turnover',
    subjectId: turnover.id,
    title: 'Turnover assigned to you',
    body: `${updated.property_nickname || updated.property_address} — ${updated.turnover_date}`,
    deepLinkPath: '/admin/str/mine',
  })
  await notifyClientEvent(c.env, {
    clientUserId: turnover.client_user_id,
    eventKey: 'str.turnover_scheduled',
    subject: 'Your turnover now has coverage',
    title: `Turnover assigned — ${updated.turnover_date}`,
    body: `A Pinnacle provider is confirmed for your turnover at ${updated.property_nickname || updated.property_address}.`,
    ctaLabel: 'View turnover',
    ctaPath: `/portal/str/turnovers/${turnover.id}`,
  })
  return c.json({ ok: true, assigned_provider_user_id: providerUserId })
})

strAdminRoutes.post('/str/turnovers/:id/offer', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  const providerUserId = text(body?.provider_user_id, 100)
  if (!providerUserId) return c.json({ error: 'provider_user_id is required' }, 400)
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  return offerTurnover(c, turnover, providerUserId, text(body?.reason, 300))
})

strAdminRoutes.post('/str/turnovers/:id/offer/accept', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (turnover.offered_provider_user_id !== user.id) return c.json({ error: 'this offer is not yours to accept' }, 403)
  if (turnover.status !== 'offered') return c.json({ error: 'offer is no longer open' }, 409)
  await c.env.DB.prepare(
    `UPDATE turnovers SET status = 'accepted', assigned_provider_user_id = ?, offered_provider_user_id = NULL, assigned_by_user_id = COALESCE(assigned_by_user_id, ?), updated_at = datetime(?)
     WHERE id = ?`,
  ).bind(user.id, user.id, isoNow(), turnover.id).run()
  const updated = await loadTurnover(c.env, turnover.id)
  await syncTurnoverCalendar(c.env, user, updated)
  await logActivity(c.env, {
    actorUserId: user.id,
    clientUserId: turnover.client_user_id,
    kind: 'str_turnover_assigned',
    detail: { turnover_id: turnover.id, via: 'offer_accept' },
  })
  await notifyClientEvent(c.env, {
    clientUserId: turnover.client_user_id,
    eventKey: 'str.turnover_scheduled',
    subject: 'Your turnover now has coverage',
    title: `Turnover assigned — ${updated.turnover_date}`,
    body: `A Pinnacle provider is confirmed for your turnover at ${updated.property_nickname || updated.property_address}.`,
    ctaLabel: 'View turnover',
    ctaPath: `/portal/str/turnovers/${turnover.id}`,
  })
  return c.json({ ok: true })
})

strAdminRoutes.post('/str/turnovers/:id/offer/decline', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (turnover.offered_provider_user_id !== user.id) return c.json({ error: 'this offer is not yours to decline' }, 403)
  await c.env.DB.prepare(
    "UPDATE turnovers SET status = 'scheduled', offered_provider_user_id = NULL, updated_at = datetime(?) WHERE id = ?",
  ).bind(isoNow(), turnover.id).run()
  const updated = await loadTurnover(c.env, turnover.id)
  await syncTurnoverCalendar(c.env, user, updated)
  await logActivity(c.env, {
    actorUserId: user.id,
    clientUserId: turnover.client_user_id,
    kind: 'str_turnover_offer_declined',
    detail: { turnover_id: turnover.id, provider_id: user.id },
  })
  await notifyStaffTurnover(c.env, updated, 'str.decline', 'Turnover offer declined', `${user.full_name || 'A provider'} declined ${updated.property_nickname || updated.property_address} (${updated.turnover_date}).`, '/admin/str/operations')

  // Auto-try backup providers when configured.
  try {
    const profile = await c.env.DB.prepare('SELECT backup_provider_user_ids_json FROM str_properties WHERE property_id = ?').bind(turnover.property_id).first<any>()
    const backups: string[] = JSON.parse(profile?.backup_provider_user_ids_json || '[]')
    const next = backups.find((p) => p !== user.id)
    if (next) {
      const offered = await c.env.DB.prepare('SELECT id FROM turnovers WHERE id = ? AND offered_provider_user_id IS NULL').bind(turnover.id).first()
      if (offered) {
        await c.env.DB.prepare("UPDATE turnovers SET status = 'offered', offered_provider_user_id = ? WHERE id = ?").bind(next, turnover.id).run()
        await pushNotification(c.env, {
          userId: next,
          kind: 'str.offer',
          subjectType: 'turnover',
          subjectId: turnover.id,
          title: 'New turnover offer (backup)',
          body: `${updated.property_nickname || updated.property_address} — ${updated.turnover_date}`,
          deepLinkPath: '/admin/str/mine',
        })
      }
    }
  } catch { /* backup handling is best-effort */ }
  return c.json({ ok: true })
})

// ---- Provider workflow ----
strAdminRoutes.post('/str/turnovers/:id/start', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  if (turnover.assigned_provider_user_id !== user.id && user.role !== 'admin') return c.json({ error: 'you are not the assigned provider' }, 403)
  if (!['accepted', 'scheduled', 'at_risk'].includes(turnover.status)) return c.json({ error: `cannot start from '${turnover.status}'` }, 409)
  const updated = await setTurnoverStatus(c.env, user, turnover.id, 'en_route')
  return c.json({ ok: true, status: updated.status })
})

strAdminRoutes.post('/str/turnovers/:id/begin', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  if (turnover.assigned_provider_user_id !== user.id && user.role !== 'admin') return c.json({ error: 'you are not the assigned provider' }, 403)
  if (!['en_route', 'accepted', 'at_risk'].includes(turnover.status)) return c.json({ error: `cannot begin from '${turnover.status}'` }, 409)
  const updated = await setTurnoverStatus(c.env, user, turnover.id, 'in_progress', { started_at: isoNow() })
  return c.json({ ok: true, status: updated.status })
})

strAdminRoutes.post('/str/turnovers/:id/checklist/:itemId', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  if (turnover.assigned_provider_user_id !== user.id && user.role !== 'admin') return c.json({ error: 'you are not the assigned provider' }, 403)
  const item = await c.env.DB.prepare('SELECT * FROM turnover_checklist_items WHERE id = ? AND turnover_id = ?').bind(c.req.param('itemId'), turnover.id).first<any>()
  if (!item) return c.json({ error: 'checklist item not found' }, 404)
  const body = await c.req.json<any>().catch(() => null)
  const status = text(body?.status, 30)
  if (!['complete', 'not_applicable'].includes(status)) return c.json({ error: 'status must be complete or not_applicable' }, 400)
  const reason = status === 'not_applicable' ? text(body?.not_applicable_reason, 300) : null
  if (status === 'not_applicable' && !reason && item.required === 1) return c.json({ error: 'a reason is required when marking a required item not applicable' }, 400)
  await c.env.DB.prepare(
    'UPDATE turnover_checklist_items SET status = ?, not_applicable_reason = ?, completed_at = datetime(?), completed_by_user_id = ? WHERE id = ?',
  ).bind(status, reason, isoNow(), user.id, item.id).run()
  await logActivity(c.env, { actorUserId: user.id, clientUserId: turnover.client_user_id, kind: 'str_checklist_item', detail: { turnover_id: turnover.id, item: item.label, status } })
  return c.json({ ok: true })
})

strAdminRoutes.post('/str/turnovers/:id/photos', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  const label = text(c.req.query('label') || c.req.header('x-photo-label'), 120)
  const result = await storeTurnoverPhoto(c.env, turnover.id, label, user.id, c.req.raw)
  if ('error' in result) return c.json({ error: result.error }, result.status as any)
  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO turnover_photos (id, turnover_id, object_key, file_name, content_type, size_bytes, label, captured_at, uploaded_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime(?), ?)`,
  ).bind(
    id, turnover.id, result.objectKey, `photo.${result.ext}`, result.contentType, result.size,
    label || null, isoNow(), user.id,
  ).run()
  await logActivity(c.env, { actorUserId: user.id, clientUserId: turnover.client_user_id, kind: 'str_photo_uploaded', detail: { turnover_id: turnover.id, label: label || null } })
  return c.json({ ok: true, id, url: `/admin/str/photos/${id}` }, 201)
})

strAdminRoutes.post('/str/turnovers/:id/issues', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>().catch(() => null)
  const issueType = text(body?.issue_type, 40)
  const description = text(body?.description, 2000)
  if (!isIssueType(issueType) || !description) return c.json({ error: 'a valid issue_type and description are required' }, 400)
  const severity = isIssueSeverity(body?.severity) ? body.severity : 'medium'
  const excessCondition = body?.excess_condition ? 1 : 0
  if (excessCondition && !body?.client_summary) return c.json({ error: 'an excess condition requires a client summary' }, 400)
  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO turnover_issues (
      id, turnover_id, client_user_id, issue_type, severity, description, client_summary, internal_notes,
      can_continue, affects_guest_readiness, excess_condition, status, requires_client_action, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
  ).bind(
    id, turnover.id, turnover.client_user_id, issueType, severity, description,
    text(body?.client_summary, 1500) || null, text(body?.internal_notes, 2000) || null,
    body?.can_continue === false ? 0 : 1,
    body?.affects_guest_readiness ? 1 : 0,
    excessCondition,
    body?.requires_client_action ? 1 : 0,
    user.id,
  ).run()

  // An issue that affects readiness or blocks work flags the turnover.
  if ((body?.affects_guest_readiness || body?.can_continue === false) && ['accepted', 'en_route', 'in_progress'].includes(turnover.status)) {
    await setTurnoverStatus(c.env, user, turnover.id, 'issue_reported')
  }

  await notifyClientEvent(c.env, {
    clientUserId: turnover.client_user_id,
    eventKey: 'str.issue_reported',
    subject: 'A condition was flagged during your turnover',
    title: `Issue flagged — ${issueTypeLabel(issueType)}`,
    body: body?.client_summary || 'A condition was flagged during your turnover. Pinnacle is on it and will update you.',
    ctaLabel: 'View turnover',
    ctaPath: `/portal/str/turnovers/${turnover.id}`,
  })
  await notifyStaffTurnover(c.env, turnover, 'str.issue', `${issueTypeLabel(issueType)} — ${issueSeverityLabel(severity)}`, `${turnover.property_nickname || turnover.property_address}: ${description.slice(0, 200)}`, `/admin/str/turnovers/${turnover.id}`)
  await logActivity(c.env, { actorUserId: user.id, clientUserId: turnover.client_user_id, kind: 'str_issue_reported', detail: { turnover_id: turnover.id, issue_id: id, issue_type: issueType, severity } })
  return c.json({ ok: true, id }, 201)
})

strAdminRoutes.post('/str/turnovers/:id/supplies', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>().catch(() => null)
  const items = Array.isArray(body?.items) ? body.items : []
  if (items.length === 0) return c.json({ error: 'at least one supply observation is required' }, 400)
  const statements: D1PreparedStatement[] = []
  const restockTasks: Array<{ supplyName: string; stock: number; par: number }> = []
  for (const item of items) {
    const supplyId = text(item?.supply_id, 100)
    if (!supplyId) continue
    const supply = await c.env.DB.prepare('SELECT id, name, par_level, stock FROM str_supplies WHERE id = ? AND property_id = ?').bind(supplyId, turnover.property_id).first<any>()
    if (!supply) continue
    const observed = Math.max(0, optionalInt(item?.observed_stock, supply.stock) ?? supply.stock)
    const flag = observed <= 0 ? 'out' : observed < Math.max(1, supply.par_level) ? 'low' : 'good'
    statements.push(c.env.DB.prepare(
      `INSERT INTO turnover_supply_status (id, turnover_id, supply_id, observed_stock, flag, notes, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(uuid(), turnover.id, supplyId, observed, flag, text(item?.notes, 500) || null, user.id))
    if (observed !== supply.stock) {
      statements.push(c.env.DB.prepare('UPDATE str_supplies SET stock = ?, updated_at = datetime(?) WHERE id = ?').bind(observed, isoNow(), supplyId))
    }
    if (flag !== 'good') restockTasks.push({ supplyName: supply.name, stock: observed, par: Math.max(1, supply.par_level) })
  }
  if (statements.length === 0) return c.json({ error: 'no valid supply observations' }, 400)
  await c.env.DB.batch(statements)

  for (const task of restockTasks) {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO client_tasks (id, client_user_id, title, status, due_date)
         VALUES (?, ?, ?, 'pending', date('now', '+7 days'))`,
      ).bind(uuid(), turnover.client_user_id, `Restock ${task.supplyName} (${turnover.property_nickname || turnover.property_address})`),
      activityInsert(c.env, { actorUserId: user.id, clientUserId: turnover.client_user_id, kind: 'str_restock_task', detail: { turnover_id: turnover.id, supply: task.supplyName } }),
    ])
    await notifyClientEvent(c.env, {
      clientUserId: turnover.client_user_id,
      eventKey: 'str.supply_low',
      subject: 'A property supply needs restocking',
      title: `${task.supplyName} is running low`,
      body: `We flagged ${task.supplyName} during the turnover at ${turnover.property_nickname || turnover.property_address}. We added restocking to your task list.`,
      ctaLabel: 'View tasks',
      ctaPath: '/portal/dashboard',
    })
  }
  await notifyStaffTurnover(c.env, turnover, 'str.supply', 'Supply stock updated', restockTasks.length ? `${turnover.property_nickname || turnover.property_address}: ${restockTasks.map((t) => t.supplyName).join(', ')} need restocking` : `Supply observations recorded for ${turnover.property_nickname || turnover.property_address}.`, `/admin/str/turnovers/${turnover.id}`)
  return c.json({ ok: true, restock_tasks: restockTasks.length })
})

strAdminRoutes.post('/str/turnovers/:id/submit', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  if (turnover.assigned_provider_user_id !== user.id && user.role !== 'admin') return c.json({ error: 'you are not the assigned provider' }, 403)
  if (!['in_progress', 'en_route', 'issue_reported', 'at_risk'].includes(turnover.status)) return c.json({ error: `cannot submit from '${turnover.status}'` }, 409)
  const gate = await checklistGate(c.env, turnover)
  const gateOk = turnover.guest_ready_override === 1
    || (gate.requiredItems === gate.completedItems + gate.notApplicableItems
        && gate.missingRequiredPhotos.length === 0
        && gate.openIssuesAffectingReadiness === 0)
  if (!gateOk) {
    return c.json({
      error: 'turnover is not complete yet — required checklist items, photos, or issue responses are missing',
      gate,
    }, 409)
  }
  const updated = await setTurnoverStatus(c.env, user, turnover.id, 'verification_needed')
  await notifyStaffTurnover(c.env, updated, 'str.submitted', 'Turnover ready for verification', `${updated.property_nickname || updated.property_address} (${updated.turnover_date}) is submitted.`, `/admin/str/turnovers/${turnover.id}`)
  return c.json({ ok: true, status: updated.status, gate })
})

strAdminRoutes.post('/str/turnovers/:id/guest-ready', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  if (!['verification_needed', 'in_progress', 'issue_reported', 'at_risk'].includes(turnover.status)) return c.json({ error: `cannot mark guest ready from '${turnover.status}'` }, 409)
  const gate = await checklistGate(c.env, turnover)
  const gateOk = turnover.guest_ready_override === 1 || (gate.missingRequiredPhotos.length === 0 && gate.openIssuesAffectingReadiness === 0)
  if (!gateOk) return c.json({ error: 'open issues or missing required photos block guest-ready', gate }, 409)
  const updated = await setTurnoverStatus(c.env, user, turnover.id, 'guest_ready', { completed_at: isoNow() })
  await notifyClientEvent(c.env, {
    clientUserId: turnover.client_user_id,
    eventKey: 'str.guest_ready',
    subject: 'Your property is guest ready',
    title: `Guest ready — ${updated.property_nickname || updated.property_address}`,
    body: 'Your property is guest ready. The turnover report is available in your portal.',
    ctaLabel: 'View report',
    ctaPath: `/portal/str/turnovers/${turnover.id}`,
  })
  await logActivity(c.env, { actorUserId: user.id, clientUserId: turnover.client_user_id, kind: 'str_turnover_guest_ready', detail: { turnover_id: turnover.id } })
  return c.json({ ok: true, status: updated.status })
})

strAdminRoutes.post('/str/turnovers/:id/override-guest-ready', async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'only admins may override the guest-ready gate' }, 403)
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  const body = await c.req.json<any>().catch(() => null)
  const reason = text(body?.reason, 500)
  if (!reason) return c.json({ error: 'an override reason is required (audit trail)' }, 400)
  await c.env.DB.prepare(
    `UPDATE turnovers SET status = 'guest_ready', guest_ready_override = 1, guest_ready_override_at = datetime(?), guest_ready_override_by = ?, guest_ready_override_reason = ?, completed_at = COALESCE(completed_at, datetime(?)), updated_at = datetime(?)
     WHERE id = ?`,
  ).bind(isoNow(), user.id, reason, isoNow(), isoNow(), turnover.id).run()
  const updated = await loadTurnover(c.env, turnover.id)
  await syncTurnoverCalendar(c.env, user, updated)
  await logAudit(c.env, {
    actorUserId: user.id, actorIp: actorIp(c.req.raw), actorUserAgent: actorUserAgent(c.req.raw), actorGeo: actorGeo(c.req.raw),
    action: 'str_guest_ready_override', entityType: 'turnover', entityId: turnover.id,
    after: { reason, property: updated.property_address },
  })
  await logActivity(c.env, { actorUserId: user.id, clientUserId: turnover.client_user_id, kind: 'str_guest_ready_override', detail: { turnover_id: turnover.id, reason } })
  await notifyClientEvent(c.env, {
    clientUserId: turnover.client_user_id,
    eventKey: 'str.guest_ready',
    subject: 'Your property is guest ready',
    title: `Guest ready — ${updated.property_nickname || updated.property_address}`,
    body: 'Your property is guest ready. The turnover report is available in your portal.',
    ctaLabel: 'View report',
    ctaPath: `/portal/str/turnovers/${turnover.id}`,
  })
  return c.json({ ok: true, status: updated.status })
})

strAdminRoutes.post('/str/turnovers/:id/complete', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  if (turnover.status !== 'guest_ready' && turnover.status !== 'verification_needed') return c.json({ error: `cannot complete from '${turnover.status}'` }, 409)
  const updated = await setTurnoverStatus(c.env, user, turnover.id, 'completed', { completed_at: isoNow() })
  return c.json({ ok: true, status: updated.status })
})

strAdminRoutes.post('/str/turnovers/:id/cancel', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  if (['completed', 'cancelled'].includes(turnover.status)) return c.json({ error: `cannot cancel a '${turnover.status}' turnover` }, 409)
  const body = await c.req.json<any>().catch(() => null)
  await c.env.DB.prepare('UPDATE turnovers SET status = ?, notes_internal = COALESCE(?, notes_internal), updated_at = datetime(?) WHERE id = ?').bind('cancelled', text(body?.reason, 2000) || null, isoNow(), turnover.id).run()
  const updated = await loadTurnover(c.env, turnover.id)
  await syncTurnoverCalendar(c.env, user, updated, { calendarStatus: 'cancelled' })
  await logActivity(c.env, { actorUserId: user.id, clientUserId: turnover.client_user_id, kind: 'str_turnover_cancelled', detail: { turnover_id: turnover.id, reason: text(body?.reason, 2000) || null } })
  return c.json({ ok: true })
})

// ---- Issue resolution (HQ) ----
strAdminRoutes.post('/str/turnovers/:id/issues/:issueId/resolve', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  const issue = await c.env.DB.prepare('SELECT * FROM turnover_issues WHERE id = ? AND turnover_id = ?').bind(c.req.param('issueId'), turnover.id).first<any>()
  if (!issue) return c.json({ error: 'issue not found' }, 404)
  if (issue.status !== 'open') return c.json({ error: 'issue is already resolved' }, 409)
  const body = await c.req.json<any>().catch(() => null)
  const decision = text(body?.status, 20)
  if (!['approved', 'declined'].includes(decision)) return c.json({ error: 'status must be approved or declined' }, 400)

  const statements: D1PreparedStatement[] = []
  const sets = ['status = ?', 'resolved_at = datetime(?)', 'resolved_by_user_id = ?', 'requires_client_action = 0', 'updated_at = datetime(?)']
  const params: unknown[] = [decision, isoNow(), user.id, isoNow()]
  if (decision === 'approved' && issue.excess_condition) {
    const payoutAdj = issue.excess_payout_adjustment_cents !== null && issue.excess_payout_adjustment_cents !== undefined ? issue.excess_payout_adjustment_cents : 0
    const clientAdj = issue.excess_client_adjustment_cents !== null && issue.excess_client_adjustment_cents !== undefined ? issue.excess_client_adjustment_cents : 0
    const notes = text(body?.internal_notes, 2000)
    sets.push('excess_payout_adjustment_cents = ?', 'excess_client_adjustment_cents = ?', 'internal_notes = COALESCE(?, internal_notes)')
    params.push(cents(payoutAdj), cents(clientAdj), notes || null)
    if (turnover.provider_payout_cents !== null) {
      statements.push(c.env.DB.prepare('UPDATE turnovers SET provider_payout_cents = ?, updated_at = datetime(?) WHERE id = ?').bind(turnover.provider_payout_cents + cents(payoutAdj), isoNow(), turnover.id))
    }
    if (turnover.client_charge_cents !== null) {
      statements.push(c.env.DB.prepare('UPDATE turnovers SET client_charge_cents = ?, updated_at = datetime(?) WHERE id = ?').bind(turnover.client_charge_cents + cents(clientAdj), isoNow(), turnover.id))
    }
  }
  params.push(issue.id)
  statements.unshift(c.env.DB.prepare(`UPDATE turnover_issues SET ${sets.join(', ')} WHERE id = ?`).bind(...params))

  // Open issues no longer blocking -> resume the working state.
  const remaining = await c.env.DB.prepare("SELECT id FROM turnover_issues WHERE turnover_id = ? AND status = 'open' AND affects_guest_readiness = 1").bind(turnover.id).all()
  if (remaining.results?.length === 0 && turnover.status === 'issue_reported') {
    statements.push(c.env.DB.prepare("UPDATE turnovers SET status = CASE WHEN started_at IS NULL THEN 'accepted' ELSE 'in_progress' END, updated_at = datetime(?) WHERE id = ?").bind(isoNow(), turnover.id))
  }
  await c.env.DB.batch(statements)

  if (decision === 'approved' && issue.requires_client_action === 1) {
    await notifyClientEvent(c.env, {
      clientUserId: turnover.client_user_id,
      eventKey: 'str.issue_reported',
      subject: 'Approved additional work for your turnover',
      title: `${issueTypeLabel(issue.issue_type)} — approved`,
      body: 'Pinnacle approved additional work found during your turnover. It will appear on your next invoice.',
      ctaLabel: 'View turnover',
      ctaPath: `/portal/str/turnovers/${turnover.id}`,
    })
  }
  await logAudit(c.env, {
    actorUserId: user.id, actorIp: actorIp(c.req.raw), actorUserAgent: actorUserAgent(c.req.raw), actorGeo: actorGeo(c.req.raw),
    action: 'str_issue_resolved', entityType: 'turnover_issue', entityId: issue.id,
    after: { decision, excess_payout_adjustment_cents: issue.excess_payout_adjustment_cents, excess_client_adjustment_cents: issue.excess_client_adjustment_cents },
  })
  await logActivity(c.env, { actorUserId: user.id, clientUserId: turnover.client_user_id, kind: 'str_issue_resolved', detail: { turnover_id: turnover.id, issue_id: issue.id, decision } })
  return c.json({ ok: true })
})

// ---- Restock (creates client tasks — never auto-spends money) ----
strAdminRoutes.post('/str/turnovers/:id/restock', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>().catch(() => null)
  const items = Array.isArray(body?.items) ? body.items : []
  if (items.length === 0) return c.json({ error: 'at least one supply is required' }, 400)
  const statements: D1PreparedStatement[] = []
  const names: string[] = []
  for (const item of items) {
    const supply = await c.env.DB.prepare('SELECT id, name, par_level FROM str_supplies WHERE id = ? AND property_id = ?').bind(text(item?.supply_id, 100), turnover.property_id).first<any>()
    if (!supply) continue
    statements.push(c.env.DB.prepare('UPDATE str_supplies SET stock = ?, updated_at = datetime(?) WHERE id = ?').bind(Math.max(0, supply.par_level), isoNow(), supply.id))
    statements.push(c.env.DB.prepare(
      `INSERT INTO client_tasks (id, client_user_id, title, status, due_date)
       VALUES (?, ?, ?, 'pending', date('now', '+7 days'))`,
    ).bind(uuid(), turnover.client_user_id, `Restock ${supply.name} (${turnover.property_nickname || turnover.property_address})`))
    statements.push(activityInsert(c.env, { actorUserId: user.id, clientUserId: turnover.client_user_id, kind: 'str_restock_task', detail: { turnover_id: turnover.id, supply: supply.name } }))
    names.push(supply.name)
    await notifyClientEvent(c.env, {
      clientUserId: turnover.client_user_id,
      eventKey: 'str.supply_low',
      subject: 'A property supply needs restocking',
      title: `${supply.name} needs restocking`,
      body: `We added restocking ${supply.name} for ${turnover.property_nickname || turnover.property_address} to your task list.`,
      ctaLabel: 'View tasks',
      ctaPath: '/portal/dashboard',
    })
  }
  if (statements.length === 0) return c.json({ error: 'no valid supplies found for this property' }, 400)
  await c.env.DB.batch(statements)
  return c.json({ ok: true, restocked: names })
})

// ---- Invoice (billing is authoritative; line items from packages/adjustments) ----
strAdminRoutes.post('/str/turnovers/:id/invoice', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>().catch(() => null)
  const packageName = strPackageLabel(turnover.service_package_key || turnover.profile_package_key)
  const baseCharge = turnover.client_charge_cents ?? 0
  const approvedExcess = await c.env.DB.prepare(
    `SELECT issue_type, client_summary, excess_client_adjustment_cents FROM turnover_issues
     WHERE turnover_id = ? AND excess_condition = 1 AND status = 'approved'`,
  ).bind(turnover.id).all<any>()
  const rawLines: InvoiceLineInput[] = []
  if (baseCharge > 0) rawLines.push({ name: `${packageName} — ${turnover.property_nickname || turnover.property_address}`, description: `Turnover on ${turnover.turnover_date}`, quantity: 1, unit_price_cents: baseCharge })
  for (const issue of approvedExcess.results ?? []) {
    const adj = issue.excess_client_adjustment_cents ?? 0
    if (adj > 0) rawLines.push({ name: `Additional work — ${issueTypeLabel(issue.issue_type)}`, description: issue.client_summary || 'Approved additional work during turnover', quantity: 1, unit_price_cents: adj })
  }
  for (const extra of Array.isArray(body?.add_ons) ? body.add_ons : []) {
    const name = text(extra?.name, 160)
    const price = cents(extra?.unit_price_cents)
    if (name && price > 0) rawLines.push({ name, description: text(extra?.description, 500) || undefined, quantity: 1, unit_price_cents: price })
  }
  if (rawLines.length === 0) return c.json({ error: 'no chargeable line items for this turnover' }, 400)
  const calculation = calculateInvoiceTotals(rawLines, 0)
  const id = uuid()
  const now = new Date()
  const invoiceNumber = `PMV-${now.getUTCFullYear()}-${now.getTime().toString().slice(-7)}`
  const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const billToJson = JSON.stringify({ company: turnover.client_business || '', first_name: turnover.client_name || '', email: turnover.client_name || '' })
  const payableToJson = JSON.stringify({ company: 'Pinnacle Management Ventures', country: 'United States' })
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO invoices (
        id, client_user_id, amount_cents, currency, status, due_date, invoice_number, customer_number,
        title, issue_date, bill_to_json, payable_to_json, message, updated_at
      ) VALUES (?, ?, ?, 'USD', 'open', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(
      id, turnover.client_user_id, calculation.total, dueDate, invoiceNumber,
      String(turnover.client_user_id).slice(0, 8).toUpperCase(),
      `Turnover invoice — ${turnover.property_nickname || turnover.property_address}`,
      now.toISOString().slice(0, 10), billToJson, payableToJson,
      `Invoice for the ${packageName} turnover on ${turnover.turnover_date}.`,
    ),
    ...calculation.items.map((item) => c.env.DB.prepare(
      `INSERT INTO invoice_line_items (id, invoice_id, name, description, quantity, unit_price_cents, discount_cents, shipped, taxable, local_tax_rate, national_tax_rate, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(uuid(), id, item.name, item.description, item.quantity, item.unit_price_cents, item.discount_cents, item.shipped, item.taxable, item.local_tax_rate, item.national_tax_rate, item.sort_order)),
    activityInsert(c.env, { actorUserId: user.id, clientUserId: turnover.client_user_id, kind: 'str_invoice_created', detail: { turnover_id: turnover.id, invoice_id: id, invoice_number: invoiceNumber, amount_cents: calculation.total } }),
  ])
  return c.json({ ok: true, id, invoice_number: invoiceNumber, amount_cents: calculation.total }, 201)
})

// ---- Payout ----
strAdminRoutes.post('/str/turnovers/:id/payout', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>().catch(() => null)
  const status = text(body?.status, 20)
  if (!isPayoutStatus(status)) return c.json({ error: 'status must be pending, approved, paid, or disputed' }, 400)
  await c.env.DB.prepare(
    `UPDATE turnovers SET payout_status = ?, payout_approved_at = CASE WHEN ? = 'approved' THEN datetime(?) ELSE payout_approved_at END, payout_approved_by = CASE WHEN ? = 'approved' THEN ? ELSE payout_approved_by END, updated_at = datetime(?)
     WHERE id = ?`,
  ).bind(status, status, isoNow(), status, user.id, isoNow(), turnover.id).run()
  await logAudit(c.env, {
    actorUserId: user.id, actorIp: actorIp(c.req.raw), actorUserAgent: actorUserAgent(c.req.raw), actorGeo: actorGeo(c.req.raw),
    action: 'str_payout_status', entityType: 'turnover', entityId: turnover.id,
    after: { from: turnover.payout_status, to: status, provider_payout_cents: turnover.provider_payout_cents },
  })
  if (turnover.assigned_provider_user_id) {
    await pushNotification(c.env, {
      userId: turnover.assigned_provider_user_id,
      kind: 'str.payout',
      subjectType: 'turnover',
      subjectId: turnover.id,
      title: `Payout ${status} — ${money(turnover.provider_payout_cents)}`,
      body: `${turnover.property_nickname || turnover.property_address} (${turnover.turnover_date})`,
      deepLinkPath: '/admin/str/mine',
    })
  }
  return c.json({ ok: true })
})

// ---- Matter link ----
strAdminRoutes.post('/str/turnovers/:id/matter', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>().catch(() => null)
  if (turnover.matter_id) return c.json({ error: 'turnover already has a matter', matter_id: turnover.matter_id }, 409)
  const matterId = uuid()
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO matters (id, client_user_id, title, type, status, due_date, summary, property_id, assigned_staff_user_id)
       VALUES (?, ?, ?, 'property_support', 'open', ?, ?, ?, ?)`,
    ).bind(
      matterId, turnover.client_user_id,
      text(body?.title, 200) || `Property support — ${turnover.property_nickname || turnover.property_address}`,
      turnover.required_complete_at ? turnover.required_complete_at.slice(0, 10) : null,
      text(body?.summary, 2000) || `Turnover issue follow-up (${turnover.turnover_date}).`,
      turnover.property_id, user.id,
    ),
    c.env.DB.prepare('UPDATE turnovers SET matter_id = ? WHERE id = ?').bind(matterId, turnover.id),
    activityInsert(c.env, { actorUserId: user.id, clientUserId: turnover.client_user_id, kind: 'str_matter_created', detail: { turnover_id: turnover.id, matter_id: matterId } }),
  ])
  return c.json({ ok: true, matter_id: matterId }, 201)
})

// ---- Photo serving (staff/provider) ----
strAdminRoutes.get('/str/photos/:id', async (c) => {
  const user = c.get('user')
  const photo = await c.env.DB.prepare('SELECT * FROM turnover_photos WHERE id = ?').bind(c.req.param('id')).first<any>()
  if (!photo) return c.json({ error: 'not found' }, 404)
  const turnover = await loadTurnover(c.env, photo.turnover_id)
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await requireProviderAccess(c.env, user, turnover))) return c.json({ error: 'not found' }, 404)
  if (!c.env.UPLOADS) return c.json({ error: 'not found' }, 404)
  const obj = await c.env.UPLOADS.get(photo.object_key)
  if (!obj) return c.json({ error: 'not found' }, 404)
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

// ---- Provider "mine" view ----
strAdminRoutes.get('/str/mine', async (c) => {
  const user = c.get('user')
  const today = new Date().toISOString().slice(0, 10)
  const [offers, todayTurnovers, upcomingTurnovers] = await Promise.all([
    c.env.DB.prepare(
      `SELECT t.*, p.address AS property_address, sp.nickname AS property_nickname, sp.access_instructions, sp.building_entry, sp.parking,
              u.full_name AS client_name
       FROM turnovers t
       JOIN str_properties sp ON sp.property_id = t.property_id
       JOIN properties p ON p.id = t.property_id
       LEFT JOIN users u ON u.id = t.client_user_id
       WHERE t.offered_provider_user_id = ? AND t.status = 'offered' ORDER BY t.turnover_date ASC`,
    ).bind(user.id).all<any>(),
    c.env.DB.prepare(
      `SELECT t.*, p.address AS property_address, sp.nickname AS property_nickname, sp.access_instructions, sp.building_entry, sp.parking,
              u.full_name AS client_name
       FROM turnovers t
       JOIN str_properties sp ON sp.property_id = t.property_id
       JOIN properties p ON p.id = t.property_id
       LEFT JOIN users u ON u.id = t.client_user_id
       WHERE t.assigned_provider_user_id = ? AND t.turnover_date = ? AND t.status NOT IN ('completed','cancelled')
       ORDER BY t.required_complete_at ASC`,
    ).bind(user.id, today).all<any>(),
    c.env.DB.prepare(
      `SELECT t.*, p.address AS property_address, sp.nickname AS property_nickname, sp.access_instructions, sp.building_entry, sp.parking,
              u.full_name AS client_name
       FROM turnovers t
       JOIN str_properties sp ON sp.property_id = t.property_id
       JOIN properties p ON p.id = t.property_id
       LEFT JOIN users u ON u.id = t.client_user_id
       WHERE t.assigned_provider_user_id = ? AND t.turnover_date > ? AND t.status NOT IN ('completed','cancelled')
       ORDER BY t.turnover_date ASC LIMIT 30`,
    ).bind(user.id, today).all<any>(),
  ])
  const earnings = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(provider_payout_cents), 0) n FROM turnovers
     WHERE assigned_provider_user_id = ? AND status = 'completed'`,
  ).bind(user.id).first<{ n: number }>()
  return c.json({
    offers: offers.results ?? [],
    today: todayTurnovers.results ?? [],
    upcoming: upcomingTurnovers.results ?? [],
    earnings_completed_cents: earnings?.n ?? 0,
  })
})

// ---------------------------------------------------------------------------
// PORTAL (client-facing, client-safe only)
// ---------------------------------------------------------------------------
export const strPortalRoutes = new Hono<AppEnv>()
strPortalRoutes.use('*', requireUser)
strPortalRoutes.onError((err, c) => applyErr(c, err))

strPortalRoutes.get('/str/turnovers', async (c) => {
  const user = c.get('user')
  const clientIds = user.role === 'client' ? [user.id] : user.role === 'admin' ? null : []
  const where = clientIds === null ? '1=1' : `t.client_user_id IN (${clientIds.map(() => '?').join(',')})`
  const params = clientIds === null ? [] : clientIds
  const rows = await c.env.DB.prepare(
    `SELECT t.id, t.status, t.turnover_date, t.checkout_at, t.required_complete_at, t.started_at, t.completed_at,
            t.service_package_key, t.source, p.address AS property_address, sp.nickname AS property_nickname,
            sp.bedrooms, sp.bathrooms, sp.max_guests, sp.platform, pr.full_name AS provider_name
     FROM turnovers t
     JOIN str_properties sp ON sp.property_id = t.property_id
     JOIN properties p ON p.id = t.property_id
     LEFT JOIN users pr ON pr.id = t.assigned_provider_user_id
     WHERE ${where}
     ORDER BY t.turnover_date DESC LIMIT 100`,
  ).bind(...params).all<any>()
  return c.json({
    turnovers: (rows.results ?? []).map((t: any) => ({
      ...t,
      client_status: turnoverClientStatus(t.status),
      client_description: turnoverClientDescription(t.status),
      package_label: strPackageShortLabel(t.service_package_key),
    })),
  })
})

strPortalRoutes.get('/str/turnovers/:id', async (c) => {
  const user = c.get('user')
  const turnover = await loadTurnover(c.env, c.req.param('id'))
  if (!turnover) return c.json({ error: 'not found' }, 404)
  if (!(await canAccessClient(c.env, user, turnover.client_user_id))) return c.json({ error: 'not found' }, 404)

  const [checklist, photos, issues, supplies] = await Promise.all([
    loadChecklist(c.env, turnover.id),
    c.env.DB.prepare('SELECT id, label, file_name, content_type, size_bytes, captured_at, created_at FROM turnover_photos WHERE turnover_id = ? ORDER BY created_at ASC').bind(turnover.id).all<any>(),
    c.env.DB.prepare(
      `SELECT id, issue_type, severity, client_summary, status, affects_guest_readiness, excess_condition, requires_client_action, created_at
       FROM turnover_issues WHERE turnover_id = ? ORDER BY created_at ASC`,
    ).bind(turnover.id).all<any>(),
    c.env.DB.prepare(
      `SELECT ss.flag, s.name AS supply_name FROM turnover_supply_status ss JOIN str_supplies s ON s.id = ss.supply_id
       WHERE ss.turnover_id = ? ORDER BY s.name`,
    ).bind(turnover.id).all<any>(),
  ])

  const items = checklist
  const requiredCount = items.filter((i: any) => i.required === 1).length
  const completedCount = items.filter((i: any) => i.status === 'complete').length
  const notApplicableCount = items.filter((i: any) => i.status === 'not_applicable').length

  const cleanedIssues = (issues.results ?? []).map((i: any) => ({
    id: i.id,
    issue_type: i.issue_type,
    issue_type_label: issueTypeLabel(i.issue_type),
    severity: i.severity,
    severity_label: issueSeverityLabel(i.severity),
    client_summary: i.client_summary || (i.requires_client_action ? 'Pinnacle needs a decision from you on additional work. Review the request in your messages or call your Pinnacle contact.' : null),
    status: i.status,
    affects_guest_readiness: i.affects_guest_readiness === 1,
    requires_client_action: i.requires_client_action === 1,
    created_at: i.created_at,
  })).filter((i: any) => i.client_summary || i.status === 'open')

  return c.json({
    turnover: {
      id: turnover.id,
      status: turnover.status,
      client_status: turnoverClientStatus(turnover.status),
      client_description: turnoverClientDescription(turnover.status),
      tone: turnoverStatusTone(turnover.status),
      turnover_date: turnover.turnover_date,
      checkout_at: turnover.checkout_at,
      required_complete_at: turnover.required_complete_at,
      completed_at: turnover.completed_at,
      package_label: strPackageLabel(turnover.service_package_key),
      package_badge: turnover.package_badge,
      source: turnover.source,
      property: {
        id: turnover.property_id,
        nickname: turnover.property_nickname,
        address: turnover.property_address,
        city: turnover.city,
        state: turnover.state,
        bedrooms: turnover.bedrooms,
        bathrooms: turnover.bathrooms,
        max_guests: turnover.max_guests,
        platform: turnover.platform,
      },
      provider_name: turnover.provider_name || 'TBD',
    },
    checklist: items.map((i: any) => ({
      id: i.id,
      category: i.category,
      label: i.label,
      required: i.required === 1,
      status: i.status,
      not_applicable_reason: i.not_applicable_reason,
    })),
    checklist_summary: { required: requiredCount, completed: completedCount, not_applicable: notApplicableCount },
    photos: (photos.results ?? []).map((p: any) => ({ id: p.id, label: p.label, file_name: p.file_name, content_type: p.content_type, size_bytes: p.size_bytes, captured_at: p.captured_at, url: `/portal/str/photos/${p.id}` })),
    issues: cleanedIssues,
    supplies: (supplies.results ?? []).map((s: any) => ({ name: s.supply_name, flag: s.flag })),
    needs_client_action: cleanedIssues.some((i: any) => i.requires_client_action),
  })
})

strPortalRoutes.post('/str/issues/:id/respond', async (c) => {
  const user = c.get('user')
  const issue = await c.env.DB.prepare('SELECT * FROM turnover_issues WHERE id = ?').bind(c.req.param('id')).first<any>()
  if (!issue) return c.json({ error: 'not found' }, 404)
  if (!(await canAccessClient(c.env, user, issue.client_user_id))) return c.json({ error: 'not found' }, 404)
  if (issue.status !== 'open' || issue.requires_client_action !== 1) return c.json({ error: 'this issue is not awaiting your decision' }, 409)
  const body = await c.req.json<any>().catch(() => null)
  const decision = text(body?.decision, 20)
  if (!['approved', 'declined'].includes(decision)) return c.json({ error: 'decision must be approved or declined' }, 400)
  await c.env.DB.prepare(
    `UPDATE turnover_issues SET status = ?, requires_client_action = 0, updated_at = datetime(?)
     WHERE id = ?`,
  ).bind(decision === 'approved' ? 'approved' : 'declined', isoNow(), issue.id).run()
  const turnover = await loadTurnover(c.env, issue.turnover_id)
  if (turnover && turnover.status === 'issue_reported') {
    const remaining = await c.env.DB.prepare("SELECT id FROM turnover_issues WHERE turnover_id = ? AND status = 'open' AND affects_guest_readiness = 1").bind(turnover.id).all()
    if (!remaining.results?.length) {
      await c.env.DB.prepare("UPDATE turnovers SET status = CASE WHEN started_at IS NULL THEN 'accepted' ELSE 'in_progress' END, updated_at = datetime(?) WHERE id = ?").bind(isoNow(), turnover.id).run()
    }
  }
  await notifyStaffTurnover(c.env, turnover || { id: issue.turnover_id, property_address: 'Turnover' }, 'str.client_response', `Client ${decision} a turnover request`, `${decision} for issue ${issueTypeLabel(issue.issue_type)} (${issue.turnover_id})`, `/admin/str/turnovers/${issue.turnover_id}`)
  await logActivity(c.env, { actorUserId: user.id, clientUserId: issue.client_user_id, kind: 'str_issue_client_responded', detail: { issue_id: issue.id, decision } })
  return c.json({ ok: true })
})

strPortalRoutes.get('/str/properties', async (c) => {
  const user = c.get('user')
  const clientIds = user.role === 'client' ? [user.id] : user.role === 'admin' ? null : []
  const where = clientIds === null ? '1=1' : `p.client_user_id IN (${clientIds.map(() => '?').join(',')})`
  const params = clientIds === null ? [] : clientIds
  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.address, p.city, p.state, sp.nickname, sp.platform, sp.bedrooms, sp.bathrooms,
            sp.max_guests, sp.service_package_key, sp.active,
            (SELECT COUNT(*) FROM turnovers t WHERE t.property_id = sp.property_id AND t.status NOT IN ('completed','cancelled')) AS active_turnovers,
            (SELECT MAX(turnover_date) FROM turnovers t WHERE t.property_id = sp.property_id) AS last_turnover_date
     FROM str_properties sp
     JOIN properties p ON p.id = sp.property_id
     WHERE ${where} ORDER BY p.name`,
  ).bind(...params).all<any>()
  return c.json({
    properties: (rows.results ?? []).map((p: any) => ({ ...p, package_label: strPackageShortLabel(p.service_package_key) })),
  })
})

// Client-safe photo serving — scoped to the photo's turnover client.
strPortalRoutes.get('/str/photos/:id', async (c) => {
  const user = c.get('user')
  const photo = await c.env.DB.prepare('SELECT * FROM turnover_photos WHERE id = ?').bind(c.req.param('id')).first<any>()
  if (!photo) return c.json({ error: 'not found' }, 404)
  const row = await c.env.DB.prepare('SELECT client_user_id FROM turnovers WHERE id = ?').bind(photo.turnover_id).first<any>()
  if (!row) return c.json({ error: 'not found' }, 404)
  if (!(await canAccessClient(c.env, user, row.client_user_id))) return c.json({ error: 'not found' }, 404)
  if (!c.env.UPLOADS) return c.json({ error: 'not found' }, 404)
  const obj = await c.env.UPLOADS.get(photo.object_key)
  if (!obj) return c.json({ error: 'not found' }, 404)
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
