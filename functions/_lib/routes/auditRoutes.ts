import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { requireCapability } from '../capabilities'
import { csvResponse } from '../csv'

export const auditRoutes = new Hono<AppEnv>()

interface Filter {
  where: string
  params: unknown[]
}

// Shared WHERE-builder for both the paginated list and the CSV export, so
// "export what I'm looking at" always matches what's on screen.
function buildFilter(c: { req: { query(key: string): string | undefined } }): Filter {
  const clauses: string[] = ['1=1']
  const params: unknown[] = []
  const actor = c.req.query('actor')
  const action = c.req.query('action')
  const entityType = c.req.query('entity_type')
  const from = c.req.query('from')
  const to = c.req.query('to')
  const before = c.req.query('before')
  if (actor) {
    clauses.push('al.actor_user_id = ?')
    params.push(actor)
  }
  if (action) {
    clauses.push('al.action = ?')
    params.push(action)
  }
  if (entityType) {
    clauses.push('al.entity_type = ?')
    params.push(entityType)
  }
  if (from) {
    clauses.push('al.created_at >= ?')
    params.push(from)
  }
  if (to) {
    clauses.push('al.created_at <= ?')
    params.push(to)
  }
  if (before) {
    clauses.push('al.created_at < ?')
    params.push(before)
  }
  return { where: clauses.join(' AND '), params }
}

// Server-paginated from the start (cursor on created_at via ?before=) —
// with potentially years of audit history, a fetch-everything-then-filter
// pattern (fine for a couple of today's smaller admin lists) would not
// hold up here. Read-only: no route ever updates or deletes a row here.
auditRoutes.get('/audit-log', requireStaff, requireCapability('can_view_audit_log'), async (c) => {
  const { where, params } = buildFilter(c)
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '50', 10) || 50, 1), 200)
  const res = await c.env.DB.prepare(
    `SELECT al.*, u.full_name AS actor_name, u.email AS actor_email
     FROM audit_log al LEFT JOIN users u ON u.id = al.actor_user_id
     WHERE ${where}
     ORDER BY al.created_at DESC LIMIT ?`,
  ).bind(...params, limit).all()
  return c.json({ entries: res.results ?? [] })
})

auditRoutes.get('/audit-log/actions', requireStaff, requireCapability('can_view_audit_log'), async (c) => {
  const res = await c.env.DB.prepare('SELECT DISTINCT action FROM audit_log ORDER BY action').all<{ action: string }>()
  return c.json({ actions: (res.results ?? []).map((r) => r.action) })
})

auditRoutes.get('/audit-log/export.csv', requireStaff, requireCapability('can_view_audit_log'), async (c) => {
  const { where, params } = buildFilter(c)
  const res = await c.env.DB.prepare(
    `SELECT al.created_at, u.full_name AS actor_name, u.email AS actor_email, al.action, al.entity_type, al.entity_id, al.actor_ip, al.actor_user_agent, al.actor_city, al.actor_region, al.actor_country
     FROM audit_log al LEFT JOIN users u ON u.id = al.actor_user_id
     WHERE ${where}
     ORDER BY al.created_at DESC LIMIT 5000`,
  ).bind(...params).all<{
    created_at: string
    actor_name: string | null
    actor_email: string | null
    action: string
    entity_type: string | null
    entity_id: string | null
    actor_ip: string | null
    actor_user_agent: string | null
    actor_city: string | null
    actor_region: string | null
    actor_country: string | null
  }>()
  const rows = (res.results ?? []).map((r) => [
    r.created_at,
    r.actor_name ?? r.actor_email ?? 'System',
    r.actor_email ?? '',
    r.action,
    r.entity_type ?? '',
    r.entity_id ?? '',
    r.actor_ip ?? '',
    [r.actor_city, r.actor_region, r.actor_country].filter(Boolean).join(', '),
    r.actor_user_agent ?? '',
  ])
  return csvResponse('audit-log.csv', ['Timestamp (UTC)', 'Actor', 'Actor Email', 'Action', 'Entity Type', 'Entity ID', 'IP', 'Location', 'User Agent'], rows)
})
