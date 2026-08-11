import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff, requireAdmin } from '../mid'
import { logActivity } from '../activity'

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
  assignee_name: string | null
  assignee_email: string | null
}

const BASE_SELECT = `SELECT st.*, cu.full_name AS client_name, cu.email AS client_email,
                            au.full_name AS assignee_name, au.email AS assignee_email
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
