import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff, requireAdmin } from '../mid'
import { logActivity } from '../activity'
import { uuid } from '../crypto'
import { canAccessClient } from '../scope'
import { resolveEligibleFieldProvider } from '../fieldProviders'
import { isCaseConversionTarget } from '../../../shared/operations'

export const casesRoutes = new Hono<AppEnv>()

// Cases live in the existing support_tickets table (schema at migration
// 0045). This module exposes the HQ-facing views: filtered list of every
// staff-visible case with denormalized client/assignee display fields,
// live SLA computation via response_due_at / resolution_due_at columns,
// and an over-SLA count for the header alert badge.
//
// SLA state is not persisted -it is derived at read time from the due
// timestamps and NOW(), so it stays correct without a scheduled job to
// tick counters. Consumers layer their own 1-second interval on top for
// the visible countdown UI.

interface CaseRow {
  id: string
  client_user_id: string
  subject: string
  category: string | null
  priority: string
  status: string
  service_key: string | null
  property_id: string | null
  waiting_on: string
  response_due_at: string | null
  resolution_due_at: string | null
  first_response_at: string | null
  resolved_at: string | null
  assigned_staff_user_id: string | null
  created_at: string
  updated_at: string | null
  client_name: string | null
  client_email: string | null
  client_public_ref: string | null
  assignee_name: string | null
  assignee_email: string | null
}

const BASE_SELECT = `SELECT st.*, cu.full_name AS client_name, cu.email AS client_email, cu.public_ref AS client_public_ref,
                            au.full_name AS assignee_name, au.email AS assignee_email
                            ,(SELECT COUNT(*) FROM support_ticket_conversions tc WHERE tc.ticket_id = st.id) AS conversion_count
                     FROM support_tickets st
                     LEFT JOIN users cu ON cu.id = st.client_user_id
                     LEFT JOIN users au ON au.id = st.assigned_staff_user_id`

casesRoutes.get('/cases', requireStaff, async (c) => {
  const status = c.req.query('status') || ''
  const priority = c.req.query('priority') || ''
  const waiting = c.req.query('waiting_on') || ''
  const search = (c.req.query('search') || '').trim().toLowerCase()
  const overSlaOnly = c.req.query('over_sla') === '1'
  const clauses: string[] = ['1=1']
  const params: unknown[] = []
  if (status) { clauses.push('st.status = ?'); params.push(status) }
  if (priority) { clauses.push('st.priority = ?'); params.push(priority) }
  if (waiting) { clauses.push('st.waiting_on = ?'); params.push(waiting) }

  const res = await c.env.DB.prepare(
    `${BASE_SELECT} WHERE ${clauses.join(' AND ')}
     ORDER BY CASE st.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
              COALESCE(st.response_due_at, st.resolution_due_at, st.created_at) ASC
     LIMIT 500`,
  ).bind(...params).all<CaseRow>()
  let cases = res.results ?? []

  if (overSlaOnly) {
    const now = Date.now()
    cases = cases.filter((row) => isOverSla(row, now))
  }
  if (search) {
    cases = cases.filter((row) => {
      const hay = [row.subject, row.client_name, row.client_email, row.assignee_name, row.assignee_email, row.category, row.priority, row.status].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(search)
    })
  }
  return c.json({ cases })
})

casesRoutes.get('/cases/over-sla-count', requireStaff, async (c) => {
  // Uses the same rule as the /cases list -open or in_progress and past
  // either due timestamp with no first response / resolution recorded yet.
  const res = await c.env.DB.prepare(
    `SELECT id, status, first_response_at, resolved_at, response_due_at, resolution_due_at
     FROM support_tickets
     WHERE status IN ('open','in_progress')`,
  ).all<{ id: string; status: string; first_response_at: string | null; resolved_at: string | null; response_due_at: string | null; resolution_due_at: string | null }>()
  const now = Date.now()
  const over = (res.results ?? []).filter((row) => isOverSla(row, now))
  return c.json({ count: over.length, ids: over.map((row) => row.id) })
})

casesRoutes.get('/cases/:id/conversions', requireStaff, async (c) => {
  const user = c.get('user')
  const ticket = await c.env.DB.prepare(
    'SELECT id, client_user_id FROM support_tickets WHERE id = ?',
  ).bind(c.req.param('id') || '').first<{ id: string; client_user_id: string }>()
  if (!ticket) return c.json({ error: 'case not found' }, 404)
  if (!(await canAccessClient(c.env, user, ticket.client_user_id))) return c.json({ error: 'forbidden' }, 403)
  const rows = await c.env.DB.prepare(
    `SELECT tc.*, u.full_name AS created_by_name
     FROM support_ticket_conversions tc
     LEFT JOIN users u ON u.id = tc.created_by_user_id
     WHERE tc.ticket_id = ?
     ORDER BY tc.created_at DESC`,
  ).bind(ticket.id).all()
  return c.json({ conversions: rows.results ?? [] })
})

casesRoutes.post('/cases/:id/convert', requireStaff, async (c) => {
  const actor = c.get('user')
  const ticket = await c.env.DB.prepare(
    `${BASE_SELECT} WHERE st.id = ?`,
  ).bind(c.req.param('id') || '').first<CaseRow & { details?: string | null; property_id?: string | null }>()
  if (!ticket) return c.json({ error: 'case not found' }, 404)
  if (!(await canAccessClient(c.env, actor, ticket.client_user_id))) return c.json({ error: 'forbidden' }, 403)

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>))
  const targetType = body.target_type
  if (!isCaseConversionTarget(targetType)) return c.json({ error: 'choose a valid conversion target' }, 400)

  const targetId = uuid()
  const conversionId = uuid()
  const title = String(body.title || ticket.subject || '').trim().slice(0, 300)
  const notes = String(body.notes || ticket.details || '').trim().slice(0, 4000) || null
  const dueDate = typeof body.due_date === 'string' && body.due_date ? body.due_date : null
  const statements = []
  let href = `clients/${ticket.client_public_ref || ticket.client_user_id}/manage`

  if (targetType === 'matter') {
    statements.push(c.env.DB.prepare(
      `INSERT INTO matters (id, client_user_id, title, type, status, due_date, assigned_staff_user_id, summary, property_id, updated_at)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, datetime('now'))`,
    ).bind(
      targetId,
      ticket.client_user_id,
      title,
      String(body.matter_type || ticket.category || 'other').slice(0, 80),
      dueDate,
      actor.id,
      notes,
      ticket.property_id || null,
    ))
  } else if (targetType === 'task') {
    const matterId = typeof body.matter_id === 'string' && body.matter_id ? body.matter_id : null
    if (matterId) {
      const matter = await c.env.DB.prepare(
        'SELECT id FROM matters WHERE id = ? AND client_user_id = ?',
      ).bind(matterId, ticket.client_user_id).first()
      if (!matter) return c.json({ error: 'matter does not belong to this client' }, 400)
    }
    statements.push(c.env.DB.prepare(
      `INSERT INTO client_tasks (id, client_user_id, matter_id, title, status, due_date, assigned_staff_user_id)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    ).bind(targetId, ticket.client_user_id, matterId, title, dueDate, actor.id))
  } else if (targetType === 'field_assignment') {
    const requestedProvider = typeof body.provider_user_id === 'string' && body.provider_user_id ? body.provider_user_id : actor.id
    const providerId = await resolveEligibleFieldProvider(c.env, requestedProvider)
    if (!providerId) return c.json({ error: 'provider must be an active staff or admin account' }, 400)
    const property = ticket.property_id
      ? await c.env.DB.prepare(
        'SELECT address, city, state, postal_code FROM properties WHERE id = ? AND client_user_id = ?',
      ).bind(ticket.property_id, ticket.client_user_id).first<{ address: string | null; city: string | null; state: string | null; postal_code: string | null }>()
      : null
    const kind = body.kind === 'ron' ? 'ron' : 'field'
    const serviceKey = String(body.service_key || ticket.service_key || ticket.category || 'general').trim().slice(0, 100) || 'general'
    statements.push(c.env.DB.prepare(
      `INSERT INTO field_assignments
        (id, kind, service_key, client_user_id, vendor_user_id, assigned_by_user_id,
         title, site_address, site_city, site_state, site_postal_code, scheduled_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      targetId,
      kind,
      serviceKey,
      ticket.client_user_id,
      providerId,
      actor.id,
      title,
      property?.address || null,
      property?.city || null,
      property?.state || null,
      property?.postal_code || null,
      typeof body.scheduled_at === 'string' && body.scheduled_at ? body.scheduled_at : null,
      notes,
    ))
    href = `field-work/${targetId}`
  } else {
    const amountCents = Math.max(0, Math.round(Number(body.amount_cents) || 0))
    const token = uuid()
    const quoteNumber = `PMV-Q-${new Date().getUTCFullYear()}-${targetId.slice(0, 8).toUpperCase()}`
    const validUntil = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO service_quotes
          (id, public_token, quote_number, status, title, client_user_id, service_key,
           recipient_name, recipient_email, intro_message, scope_notes, valid_until,
           subtotal_cents, discount_cents, total_cents, created_by_user_id)
         VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      ).bind(
        targetId,
        token,
        quoteNumber,
        title,
        ticket.client_user_id,
        ticket.service_key || null,
        ticket.client_name || ticket.client_email || 'Client',
        ticket.client_email || '',
        'Created from a client request. Review scope, pricing, and terms before sending.',
        notes,
        validUntil,
        amountCents,
        amountCents,
        actor.id,
      ),
      c.env.DB.prepare(
        `INSERT INTO service_quote_line_items
          (id, quote_id, name, description, quantity, unit_price_cents, discount_cents, is_optional, is_pass_through, sort_order)
         VALUES (?, ?, ?, ?, 1, ?, 0, 0, 0, 0)`,
      ).bind(uuid(), targetId, title, notes, amountCents),
      c.env.DB.prepare(
        `INSERT INTO service_quote_events (id, quote_id, kind, actor, detail)
         VALUES (?, ?, 'created', ?, ?)`,
      ).bind(uuid(), targetId, `staff:${actor.id}`, `Converted from client case ${ticket.id}`),
    )
    href = `quotes?quote=${targetId}`
  }

  statements.push(
    c.env.DB.prepare(
      `INSERT INTO support_ticket_conversions (id, ticket_id, target_type, target_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(conversionId, ticket.id, targetType, targetId, actor.id),
    c.env.DB.prepare(
      `UPDATE support_tickets
       SET status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
           assigned_staff_user_id = COALESCE(assigned_staff_user_id, ?),
           first_response_at = COALESCE(first_response_at, datetime('now')),
           waiting_on = 'pinnacle',
           updated_at = datetime('now')
       WHERE id = ?`,
    ).bind(actor.id, ticket.id),
  )

  await c.env.DB.batch(statements)
  await logActivity(c.env, {
    actorUserId: actor.id,
    clientUserId: ticket.client_user_id,
    kind: 'case_converted',
    detail: { ticket_id: ticket.id, target_type: targetType, target_id: targetId },
  })
  return c.json({ ok: true, target_type: targetType, target_id: targetId, href }, 201)
})

// -------- SLA policies (admin-only editor) --------

casesRoutes.get('/sla-policies', requireStaff, async (c) => {
  const res = await c.env.DB.prepare('SELECT priority, response_minutes, resolution_minutes, updated_at FROM sla_policies ORDER BY CASE priority WHEN \'urgent\' THEN 0 WHEN \'high\' THEN 1 WHEN \'normal\' THEN 2 WHEN \'low\' THEN 3 ELSE 4 END').all()
  return c.json({ policies: res.results ?? [] })
})

casesRoutes.patch('/sla-policies', requireAdmin, async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ policies: { priority: string; response_minutes: number; resolution_minutes: number }[] }>().catch(() => null)
  if (!body?.policies?.length) return c.json({ error: 'policies array required' }, 400)
  const stmts = body.policies
    .filter((row) => ['low', 'normal', 'high', 'urgent'].includes(row.priority))
    .map((row) =>
      c.env.DB.prepare(
        `INSERT INTO sla_policies (priority, response_minutes, resolution_minutes, updated_at, updated_by_user_id)
         VALUES (?, ?, ?, datetime('now'), ?)
         ON CONFLICT(priority) DO UPDATE SET
           response_minutes = excluded.response_minutes,
           resolution_minutes = excluded.resolution_minutes,
           updated_at = excluded.updated_at,
           updated_by_user_id = excluded.updated_by_user_id`,
      ).bind(row.priority, Math.max(1, Math.floor(row.response_minutes)), Math.max(1, Math.floor(row.resolution_minutes)), user.id),
    )
  await c.env.DB.batch(stmts)
  await logActivity(c.env, { actorUserId: user.id, kind: 'sla_policy_updated', detail: { count: stmts.length } })
  return c.json({ ok: true })
})

// -------- helpers --------

interface SlaSnapshot {
  status: string
  first_response_at: string | null
  resolved_at: string | null
  response_due_at: string | null
  resolution_due_at: string | null
}

function isOverSla(row: SlaSnapshot, nowMs: number): boolean {
  if (row.status === 'closed' && row.resolved_at) return false
  // Response SLA: over if no first response and now > response_due_at.
  if (!row.first_response_at && row.response_due_at && Date.parse(row.response_due_at) < nowMs) return true
  // Resolution SLA: over if not resolved and now > resolution_due_at.
  if (!row.resolved_at && row.resolution_due_at && Date.parse(row.resolution_due_at) < nowMs) return true
  return false
}
