import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff, requireOwner } from '../mid'
import { uuid, verifyPassword } from '../crypto'
import { canAccessClient, scopeFilter } from '../scope'
import { auditInsert, actorIp } from '../auditLog'

export const deletionRoutes = new Hono<AppEnv>()

// Entities a staff/admin may archive (soft-delete) — table name is always
// one of these hardcoded literals, never the raw :entity URL param, so
// there's no SQL-injection surface even though the table name ends up
// interpolated into the query text below.
const ARCHIVABLE: Record<string, string> = {
  inquiries: 'contact_inquiries',
  matters: 'matters',
  tasks: 'client_tasks',
  invoices: 'invoices',
  documents: 'client_documents',
  tickets: 'support_tickets',
  notes: 'internal_notes',
}
// Everything archivable is also permanently deletable, plus user accounts
// (which archive via the existing status='suspended' state, not a new
// column, but still need an Owner-only permanent-delete path).
const DELETABLE: Record<string, string> = { ...ARCHIVABLE, users: 'users' }
// Entities with no client_user_id to scope staff visibility by (leads
// aren't assigned to specific staff today, and a user row *is* the
// account, not something scoped to itself).
const UNSCOPED = new Set(['inquiries', 'users'])

async function loadRow(env: AppEnv['Bindings'], table: string, id: string): Promise<Record<string, unknown> | null> {
  return env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Record<string, unknown>>()
}

// ---------------- archive / restore ----------------

deletionRoutes.patch('/records/:entity/:id/archive', requireStaff, async (c) => {
  const entity = c.req.param('entity')!
  const table = ARCHIVABLE[entity]
  if (!table) return c.json({ error: 'unknown or non-archivable entity' }, 404)
  const user = c.get('user')
  const id = c.req.param('id')!

  const row = await loadRow(c.env, table, id)
  if (!row) return c.json({ error: 'not found' }, 404)
  if (!UNSCOPED.has(entity) && row.client_user_id) {
    const ok = await canAccessClient(c.env, user, row.client_user_id as string)
    if (!ok) return c.json({ error: 'forbidden' }, 403)
  }
  if (row.archived_at) return c.json({ error: 'already archived' }, 409)

  const body = await c.req.json<{ reason?: string }>().catch(() => ({}) as { reason?: string })
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) || null : null

  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE ${table} SET archived_at = datetime('now'), archived_by = ?, archived_reason = ? WHERE id = ?`).bind(user.id, reason, id),
    auditInsert(c.env, { actorUserId: user.id, actorIp: actorIp(c.req.raw), action: 'record_archived', entityType: entity, entityId: id, before: row }),
  ])
  return c.json({ ok: true })
})

deletionRoutes.patch('/records/:entity/:id/restore', requireStaff, async (c) => {
  const entity = c.req.param('entity')!
  const table = ARCHIVABLE[entity]
  if (!table) return c.json({ error: 'unknown or non-archivable entity' }, 404)
  const user = c.get('user')
  const id = c.req.param('id')!

  const row = await loadRow(c.env, table, id)
  if (!row) return c.json({ error: 'not found' }, 404)
  if (!UNSCOPED.has(entity) && row.client_user_id) {
    const ok = await canAccessClient(c.env, user, row.client_user_id as string)
    if (!ok) return c.json({ error: 'forbidden' }, 403)
  }
  if (!row.archived_at) return c.json({ error: 'not archived' }, 409)

  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE ${table} SET archived_at = NULL, archived_by = NULL, archived_reason = NULL WHERE id = ?`).bind(id),
    auditInsert(c.env, { actorUserId: user.id, actorIp: actorIp(c.req.raw), action: 'record_restored', entityType: entity, entityId: id, before: row }),
  ])
  return c.json({ ok: true })
})

deletionRoutes.get('/records/:entity/archived', requireStaff, async (c) => {
  const entity = c.req.param('entity')!
  const table = ARCHIVABLE[entity]
  if (!table) return c.json({ error: 'unknown or non-archivable entity' }, 404)
  const user = c.get('user')

  let where = 'archived_at IS NOT NULL'
  let params: unknown[] = []
  if (!UNSCOPED.has(entity)) {
    const sf = await scopeFilter(c.env, user)
    where += ` AND (client_user_id IS NULL OR ${sf.where})`
    params = sf.params
  }
  const res = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE ${where} ORDER BY archived_at DESC LIMIT 200`).bind(...params).all()
  return c.json({ entity, records: res.results ?? [] })
})

// ---------------- permanent deletion (Owner only) ----------------

deletionRoutes.delete('/records/:entity/:id/permanent', requireOwner, async (c) => {
  const entity = c.req.param('entity')!
  const table = DELETABLE[entity]
  if (!table) return c.json({ error: 'unknown entity' }, 404)
  const user = c.get('user')
  const id = c.req.param('id')!

  if (entity === 'users' && id === user.id) {
    return c.json({ error: "you can't permanently delete your own account" }, 400)
  }

  const body = await c.req.json<{ password?: string; reason?: string }>().catch(() => ({}) as { password?: string; reason?: string })
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 5) return c.json({ error: 'a reason (at least 5 characters) is required' }, 400)
  if (!body.password) return c.json({ error: 'password is required' }, 400)

  const actor = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string | null }>()
  if (!actor?.password_hash || !(await verifyPassword(body.password, actor.password_hash, c.env.SESSION_SECRET))) {
    return c.json({ error: 'incorrect password' }, 401)
  }

  const row = await loadRow(c.env, table, id)
  if (!row) return c.json({ error: 'not found' }, 404)

  const ip = actorIp(c.req.raw)
  const permId = uuid()
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO permanent_deletions (id, entity_type, entity_id, snapshot_json, deleted_by, reason, actor_ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(permId, entity, id, JSON.stringify(row), user.id, reason.slice(0, 500), ip),
    auditInsert(c.env, { actorUserId: user.id, actorIp: ip, action: 'record_permanently_deleted', entityType: entity, entityId: id, before: row }),
    c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id),
  ])
  return c.json({ ok: true })
})

// Read-only permanent ledger — Owner only, same as the delete action itself.
deletionRoutes.get('/permanent-deletions', requireOwner, async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT pd.*, u.full_name AS deleted_by_name, u.email AS deleted_by_email
     FROM permanent_deletions pd JOIN users u ON u.id = pd.deleted_by
     ORDER BY pd.deleted_at DESC LIMIT 500`,
  ).all()
  return c.json({ deletions: res.results ?? [] })
})
