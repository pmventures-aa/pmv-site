import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppEnv, Env, SessionUser } from '../types'
import { requireUser, requireStaff } from '../mid'
import { uuid } from '../crypto'
import { resolveClientId, ScopeError } from '../scope'
import { canAccessClient } from '../access'
import { activityInsert } from '../activity'
import { pushNotification } from '../notificationFeed'
import { loadCalendarEvents, loadCalendarEventRow } from '../calendarQuery'
import {
  isCalendarEventType,
  isCalendarEventStatus,
  isCalendarLocationType,
  isCalendarVisibility,
  parseCalendarDate,
  type CalendarEventType,
} from '../../../shared/calendarWorkspace'

// Unified Calendar / Scheduling API.
//
//   Portal (requireUser):
//     GET    /calendar/events               -> scoped list (client/staff/admin)
//     POST   /calendar/events               -> create a stored event
//     PATCH  /calendar/events/:id           -> update (role-restricted fields)
//     DELETE /calendar/events/:id           -> delete own/in-scope event
//
//   HQ (requireStaff):
//     GET    /calendar/events               -> org-wide list w/ filters
//     POST   /calendar/events               -> create internal or client event
//     PATCH  /calendar/events/:id           -> update
//     DELETE /calendar/events/:id           -> delete
//
// Derived entries (tasks/invoices/envelopes/matters/field visits/milestones/
// planned calls) are computed at read time by calendarQuery — never written
// here, so state is never duplicated. Mutations in this file only touch
// calendar_events rows, and every row access is role-scoped server-side.

export const portalCalendarRoutes = new Hono<AppEnv>()
portalCalendarRoutes.use('*', requireUser)
portalCalendarRoutes.onError((err, c) => {
  if (err instanceof ScopeError) return c.json({ error: err.message }, err.status as any)
  console.error(err)
  return c.json({ error: 'internal error' }, 500)
})

export const adminCalendarRoutes = new Hono<AppEnv>()
adminCalendarRoutes.use('*', requireStaff)
adminCalendarRoutes.onError((err, c) => {
  if (err instanceof ScopeError) return c.json({ error: err.message }, err.status as any)
  console.error(err)
  return c.json({ error: 'internal error' }, 500)
})

// ---- Shared input handling ----

interface EventInput {
  title?: string
  description?: string | null
  starts_at?: string
  ends_at?: string | null
  all_day?: boolean
  timezone?: string | null
  event_type?: string
  status?: string
  location_type?: string | null
  location_name?: string | null
  address?: string | null
  meeting_url?: string | null
  phone_number?: string | null
  recurrence_rule?: string | null
  assigned_user_id?: string | null
  client_user_id?: string | null
  matter_id?: string | null
  business_id?: string | null
  property_id?: string | null
  vendor_user_id?: string | null
  task_id?: string | null
  invoice_id?: string | null
  envelope_id?: string | null
  document_id?: string | null
  visibility?: string
}

const EVENT_FIELDS: (keyof EventInput)[] = [
  'title', 'description', 'starts_at', 'ends_at', 'all_day', 'timezone',
  'event_type', 'status', 'location_type', 'location_name', 'address',
  'meeting_url', 'phone_number', 'recurrence_rule', 'assigned_user_id',
  'client_user_id', 'matter_id', 'business_id', 'property_id', 'vendor_user_id',
  'task_id', 'invoice_id', 'envelope_id', 'document_id', 'visibility',
]

function isStaffUser(user: SessionUser): boolean {
  return user.role === 'staff' || user.role === 'admin'
}

async function resolveStaffUser(env: Env, id?: string | null): Promise<string | null> {
  if (!id) return null
  const row = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(id).first<{ role: string }>()
  if (!row || (row.role !== 'staff' && row.role !== 'admin')) return null
  return id
}

// Resolve the effective client for a stored event. Order: explicit
// client_user_id, then the client of any matter/property link, then null
// (internal event). Every path is access-checked for staff.
async function resolveEventClient(env: Env, user: SessionUser, input: EventInput): Promise<string | null> {
  if (user.role === 'client') return user.id
  if (input.client_user_id) return resolveClientId(env, user, input.client_user_id)
  if (input.matter_id) {
    const m = await env.DB.prepare('SELECT client_user_id FROM matters WHERE id = ?').bind(input.matter_id).first<{ client_user_id: string }>()
    if (!m) throw new ScopeError('matter not found', 400)
    const ok = await canAccessClient(env, user, m.client_user_id)
    if (!ok) throw new ScopeError('forbidden: no access to this matter', 403)
    return m.client_user_id
  }
  if (input.property_id) {
    const p = await env.DB.prepare('SELECT client_user_id FROM properties WHERE id = ?').bind(input.property_id).first<{ client_user_id: string }>()
    if (!p) throw new ScopeError('property not found', 400)
    const ok = await canAccessClient(env, user, p.client_user_id)
    if (!ok) throw new ScopeError('forbidden: no access to this property', 403)
    return p.client_user_id
  }
  return null
}

// When a client-linked domain record is referenced, verify it belongs to the
// resolved client (guards staff from linking a record of another client).
async function validateDomainLink(env: Env, user: SessionUser, clientId: string | null, table: string, column: string, id?: string | null): Promise<void> {
  if (!id || user.role === 'admin' || !clientId) return
  const row = await env.DB.prepare(`SELECT client_user_id FROM ${table} WHERE id = ?`).bind(id).first<{ client_user_id: string | null }>()
  if (!row) throw new ScopeError(`${table.replace(/_/g, ' ')} not found`, 400)
  if (row.client_user_id !== clientId) throw new ScopeError('linked record does not belong to this client', 400)
}

function buildStoredEvent(user: SessionUser, clientId: string | null, body: EventInput) {
  const title = (body.title ?? '').trim().slice(0, 300)
  if (!title) throw new ScopeError('title is required', 400)
  const startsAt = (body.starts_at ?? '').trim()
  if (!startsAt) throw new ScopeError('starts_at is required', 400)
  if (Number.isNaN(parseCalendarDate(startsAt).getTime())) throw new ScopeError('starts_at must be a valid date', 400)

  const eventType: CalendarEventType = isCalendarEventType(body.event_type) ? body.event_type : 'appointment'
  const status = isCalendarEventStatus(body.status) ? body.status : 'proposed'
  // Clients may not create internal (staff-only) events.
  const visibility = isCalendarVisibility(body.visibility)
    ? (body.visibility === 'internal' && !isStaffUser(user) ? 'client' : body.visibility)
    : 'client'

  return {
    title,
    description: body.description ? String(body.description).slice(0, 2000) : null,
    starts_at: startsAt,
    ends_at: body.ends_at || null,
    all_day: body.all_day ? 1 : 0,
    timezone: body.timezone || null,
    event_type: eventType,
    status,
    location_type: isCalendarLocationType(body.location_type) ? body.location_type : null,
    location_name: body.location_name || null,
    address: body.address || null,
    meeting_url: body.meeting_url || null,
    phone_number: body.phone_number || null,
    recurrence_rule: body.recurrence_rule || null,
    visibility,
  }
}

async function applyCreate(env: Env, user: SessionUser, body: EventInput) {
  const isStaff = isStaffUser(user)
  const clientId = await resolveEventClient(env, user, body)
  if (clientId) {
    await validateDomainLink(env, user, clientId, 'matters', 'client_user_id', body.matter_id)
    await validateDomainLink(env, user, clientId, 'properties', 'client_user_id', body.property_id)
    await validateDomainLink(env, user, clientId, 'invoices', 'client_user_id', body.invoice_id)
    await validateDomainLink(env, user, clientId, 'envelopes', 'client_id', body.envelope_id)
    await validateDomainLink(env, user, clientId, 'client_tasks', 'client_user_id', body.task_id)
    await validateDomainLink(env, user, clientId, 'client_documents', 'client_user_id', body.document_id)
  }
  const assignedUserId = isStaff ? await resolveStaffUser(env, body.assigned_user_id) : null
  const vendorUserId = isStaff ? await resolveStaffUser(env, body.vendor_user_id) : null
  const ev = buildStoredEvent(user, clientId, body)
  const id = uuid()

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO calendar_events (
        id, title, description, starts_at, ends_at, all_day, timezone, event_type, status,
        location_type, location_name, address, meeting_url, phone_number, recurrence_rule,
        created_by_user_id, assigned_user_id, client_user_id, matter_id, business_id, property_id,
        vendor_user_id, task_id, invoice_id, envelope_id, document_id, visibility, client_visible
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, ev.title, ev.description, ev.starts_at, ev.ends_at, ev.all_day, ev.timezone, ev.event_type, ev.status,
      ev.location_type, ev.location_name, ev.address, ev.meeting_url, ev.phone_number, ev.recurrence_rule,
      user.id, assignedUserId, clientId, body.matter_id ?? null, body.business_id ?? null, body.property_id ?? null,
      vendorUserId, body.task_id ?? null, body.invoice_id ?? null, body.envelope_id ?? null, body.document_id ?? null,
      ev.visibility, ev.visibility === 'internal' ? 0 : 1,
    ),
    activityInsert(env, {
      actorUserId: user.id,
      clientUserId: clientId ?? undefined,
      kind: 'calendar_event_created',
      detail: { title: ev.title, starts_at: ev.starts_at, event_type: ev.event_type },
    }),
  ])

  if (clientId && ev.visibility === 'client') {
    void pushNotification(env, {
      userId: clientId,
      kind: 'appointment_scheduled',
      subjectType: 'calendar_event',
      subjectId: id,
      title: `New ${ev.event_type.replace(/_/g, ' ')} scheduled`,
      body: ev.title,
      deepLinkPath: '/calendar',
      actorUserId: user.id,
      dedupeWindowSeconds: 60,
    })
  }
  return id
}

// ---- Portal routes ----

portalCalendarRoutes.get('/calendar/events', async (c) => {
  const user = c.get('user')
  const { from, to, event_type, status, include_derived } = c.req.query()
  const events = await loadCalendarEvents(c.env, user, {
    from: from ?? null,
    to: to ?? null,
    eventType: event_type || null,
    status: status || null,
    includeDerived: include_derived !== '0',
  })
  return c.json({ events })
})

portalCalendarRoutes.post('/calendar/events', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<EventInput>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request body' }, 400)
  const id = await applyCreate(c.env, user, body)
  return c.json({ ok: true, id }, 201)
})

async function handlePatchEvent(c: Context<AppEnv>) {
  const user = c.get('user')
  const row = await loadCalendarEventRow(c.env, user, c.req.param('id') ?? '')
  if (!row) throw new ScopeError('not found', 404)
  const body = await c.req.json<EventInput>().catch(() => ({} as EventInput))
  const patch: string[] = []
  const params: (string | number | null)[] = []

  const push = (sql: string, value: string | number | null) => { patch.push(sql); params.push(value) }
  const isStaff = isStaffUser(user)

  if (body.title !== undefined) push('title = ?', body.title.trim().slice(0, 300) || row.title)
  if (body.description !== undefined) push('description = ?', body.description ? String(body.description).slice(0, 2000) : null)
  if (body.starts_at !== undefined) {
    const at = (body.starts_at ?? '').trim()
    if (Number.isNaN(parseCalendarDate(at).getTime())) throw new ScopeError('starts_at must be a valid date', 400)
    push('starts_at = ?', at)
  }
  if (body.ends_at !== undefined) push('ends_at = ?', body.ends_at || null)
  if (body.all_day !== undefined) push('all_day = ?', body.all_day ? 1 : 0)
  if (body.timezone !== undefined) push('timezone = ?', body.timezone || null)
  if (body.event_type !== undefined) {
    const t = isCalendarEventType(body.event_type) ? body.event_type : 'appointment'
    push('event_type = ?', t)
  }
  // Clients may only cancel their own events; staff/admin may set any status.
  if (body.status !== undefined) {
    const s = isCalendarEventStatus(body.status) ? body.status : 'proposed'
    if (!isStaff && s !== 'cancelled') throw new ScopeError('clients may only cancel events', 403)
    push('status = ?', s)
  }
  if (body.location_type !== undefined) push('location_type = ?', isCalendarLocationType(body.location_type) ? body.location_type : null)
  if (body.location_name !== undefined) push('location_name = ?', body.location_name || null)
  if (body.address !== undefined) push('address = ?', body.address || null)
  if (body.meeting_url !== undefined) push('meeting_url = ?', body.meeting_url || null)
  if (body.phone_number !== undefined) push('phone_number = ?', body.phone_number || null)
  if (body.recurrence_rule !== undefined) push('recurrence_rule = ?', body.recurrence_rule || null)

  if (body.visibility !== undefined) {
    const v = isCalendarVisibility(body.visibility) ? body.visibility : 'client'
    if (v === 'internal' && !isStaff) throw new ScopeError('clients may not mark events internal', 403)
    push('visibility = ?', v)
    push('client_visible = ?', v === 'internal' ? 0 : 1)
  }
  if (isStaff && body.assigned_user_id !== undefined) push('assigned_user_id = ?', await resolveStaffUser(c.env, body.assigned_user_id))
  if (isStaff && body.vendor_user_id !== undefined) push('vendor_user_id = ?', await resolveStaffUser(c.env, body.vendor_user_id))
  if (isStaff && body.client_user_id !== undefined) {
    const cid = await resolveClientId(c.env, user, body.client_user_id)
    push('client_user_id = ?', cid)
    if (body.visibility === undefined && cid) push('client_visible = ?', row.visibility === 'internal' ? 0 : 1)
  }
  if (isStaff && body.matter_id !== undefined) push('matter_id = ?', body.matter_id || null)
  if (isStaff && body.property_id !== undefined) push('property_id = ?', body.property_id || null)
  if (isStaff && body.business_id !== undefined) push('business_id = ?', body.business_id || null)
  if (isStaff && body.task_id !== undefined) push('task_id = ?', body.task_id || null)
  if (isStaff && body.invoice_id !== undefined) push('invoice_id = ?', body.invoice_id || null)
  if (isStaff && body.envelope_id !== undefined) push('envelope_id = ?', body.envelope_id || null)
  if (isStaff && body.document_id !== undefined) push('document_id = ?', body.document_id || null)

  if (patch.length) {
    patch.push('updated_at = datetime(\'now\')')
    await c.env.DB.prepare(`UPDATE calendar_events SET ${patch.join(', ')} WHERE id = ?`).bind(...params, row.id).run()
    await activityInsert(c.env, {
      actorUserId: user.id,
      clientUserId: row.client_user_id ?? undefined,
      kind: 'calendar_event_updated',
      detail: { id: row.id, title: row.title, fields: patch.length },
    }).run()
  }
  return c.json({ ok: true })
}

portalCalendarRoutes.patch('/calendar/events/:id', handlePatchEvent)

async function handleDeleteEvent(c: Context<AppEnv>) {
  const user = c.get('user')
  const row = await loadCalendarEventRow(c.env, user, c.req.param('id') ?? '')
  if (!row) throw new ScopeError('not found', 404)
  if (user.role === 'client' && row.client_user_id !== user.id) throw new ScopeError('forbidden', 403)
  await c.env.DB.prepare('DELETE FROM calendar_events WHERE id = ?').bind(row.id).run()
  await activityInsert(c.env, {
    actorUserId: user.id,
    clientUserId: row.client_user_id ?? undefined,
    kind: 'calendar_event_deleted',
    detail: { id: row.id, title: row.title },
  }).run()
  return c.json({ ok: true })
}

portalCalendarRoutes.delete('/calendar/events/:id', handleDeleteEvent)

// ---- Admin routes ----

adminCalendarRoutes.get('/calendar/events', async (c) => {
  const user = c.get('user')
  const { from, to, event_type, status, client_user_id, matter_id, vendor_user_id, assigned_user_id, visibility, include_derived } = c.req.query()
  const events = await loadCalendarEvents(c.env, user, {
    from: from ?? null,
    to: to ?? null,
    eventType: event_type || null,
    status: status || null,
    clientUserId: client_user_id || null,
    matterId: matter_id || null,
    vendorUserId: vendor_user_id || null,
    assignedUserId: assigned_user_id || null,
    visibility: visibility || null,
    includeDerived: include_derived !== '0',
  })
  return c.json({ events })
})

adminCalendarRoutes.post('/calendar/events', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<EventInput>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request body' }, 400)
  const id = await applyCreate(c.env, user, body)
  return c.json({ ok: true, id }, 201)
})

adminCalendarRoutes.patch('/calendar/events/:id', handlePatchEvent)
adminCalendarRoutes.delete('/calendar/events/:id', handleDeleteEvent)
