import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff, requireAdmin } from '../mid'
import { uuid } from '../crypto'
import { scopeFilter, canAccessClient, ScopeError } from '../scope'
import { visibleClientIds } from '../access'
import { createActivationToken } from '../session'
import { activityInsert, logActivity } from '../activity'

export const adminRoutes = new Hono<AppEnv>()

adminRoutes.onError((err, c) => {
  if (err instanceof ScopeError) return c.json({ error: err.message }, err.status as any)
  console.error(err)
  return c.json({ error: 'internal error' }, 500)
})

// ---------------- staff + admin: cross-client views ----------------
adminRoutes.get('/dashboard', requireStaff, async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user, 'user_id')
  const clientCount = await c.env.DB.prepare(`SELECT COUNT(*) n FROM client_profiles WHERE ${where}`).bind(...params).first<{ n: number }>()

  const { where: w2, params: p2 } = await scopeFilter(c.env, user)
  const [openTickets, openMatters, pendingTasks, pendingCalls, openInvoices, appts, activity] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) n FROM support_tickets WHERE ${w2} AND status = 'open'`).bind(...p2).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM matters WHERE ${w2} AND status != 'closed'`).bind(...p2).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM client_tasks WHERE ${w2} AND status != 'done'`).bind(...p2).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM planned_calls WHERE ${w2} AND status = 'requested'`).bind(...p2).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM invoices WHERE ${w2} AND status = 'open'`).bind(...p2).first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT a.*, u.full_name AS client_name, u.email AS client_email FROM appointments a JOIN users u ON u.id = a.client_user_id
       WHERE ${w2.replace(/client_user_id/g, 'a.client_user_id')} AND a.starts_at >= datetime('now') AND a.status != 'cancelled'
       ORDER BY a.starts_at ASC LIMIT 5`,
    ).bind(...p2).all(),
    c.env.DB.prepare(
      `SELECT ae.*, actor.full_name AS actor_name, cu.full_name AS client_name, cu.email AS client_email
       FROM activity_events ae
       LEFT JOIN users actor ON actor.id = ae.actor_user_id
       LEFT JOIN users cu ON cu.id = ae.client_user_id
       WHERE (${w2.replace(/client_user_id/g, 'ae.client_user_id')}) OR ae.client_user_id IS NULL
       ORDER BY ae.created_at DESC LIMIT 15`,
    ).bind(...p2).all(),
  ])

  return c.json({
    stats: {
      clients: clientCount?.n ?? 0,
      open_tickets: openTickets?.n ?? 0,
      open_matters: openMatters?.n ?? 0,
      pending_tasks: pendingTasks?.n ?? 0,
      pending_calls: pendingCalls?.n ?? 0,
      open_invoices: openInvoices?.n ?? 0,
    },
    upcoming_appointments: appts.results ?? [],
    recent_activity: activity.results ?? [],
  })
})

adminRoutes.get('/clients', requireStaff, async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user, 'u.id')
  const res = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.first_name, u.last_name, u.status, u.created_at,
            cp.business_name, cp.onboarding_completed
     FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id
     WHERE u.role = 'client' AND ${where}
     ORDER BY u.created_at DESC LIMIT 500`,
  ).bind(...params).all()
  return c.json({ clients: res.results ?? [] })
})

adminRoutes.get('/clients/:id', requireStaff, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')!
  const ok = await canAccessClient(c.env, user, id)
  if (!ok) return c.json({ error: 'forbidden' }, 403)

  const [profile, account, services, matters, tasks, docs, invoices, funding, properties, tax, tickets, calls, appts] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM client_profiles WHERE user_id = ?').bind(id).first(),
    c.env.DB.prepare('SELECT id, email, full_name, first_name, last_name, phone, status, created_at, last_login_at FROM users WHERE id = ?').bind(id).first(),
    c.env.DB.prepare('SELECT cs.*, s.name FROM client_services cs JOIN services s ON s.key = cs.service_key WHERE client_user_id = ?').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM matters WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM client_tasks WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM client_documents WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM invoices WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM funding_applications WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM properties WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM tax_filings WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM support_tickets WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM planned_calls WHERE client_user_id = ? ORDER BY created_at DESC').bind(id).all(),
    c.env.DB.prepare('SELECT * FROM appointments WHERE client_user_id = ? ORDER BY starts_at DESC').bind(id).all(),
  ])

  if (!account) return c.json({ error: 'not found' }, 404)

  return c.json({
    account,
    profile,
    services: services.results ?? [],
    matters: matters.results ?? [],
    tasks: tasks.results ?? [],
    documents: docs.results ?? [],
    invoices: invoices.results ?? [],
    funding: funding.results ?? [],
    properties: properties.results ?? [],
    tax_filings: tax.results ?? [],
    tickets: tickets.results ?? [],
    calls: calls.results ?? [],
    appointments: appts.results ?? [],
  })
})

// ---------------- staff + admin: contact inquiries ----------------
adminRoutes.get('/inquiries', requireStaff, async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT ci.*, s.name AS service_name FROM contact_inquiries ci
     LEFT JOIN services s ON s.key = ci.service_key
     ORDER BY ci.created_at DESC LIMIT 200`,
  ).all()
  return c.json({ inquiries: res.results ?? [] })
})

adminRoutes.patch('/inquiries/:id', requireStaff, async (c) => {
  const body = await c.req.json<{ status?: string }>().catch(() => ({} as { status?: string }))
  const status = ['new', 'contacted', 'closed'].includes(body.status ?? '') ? body.status : undefined
  if (status) {
    await c.env.DB.prepare('UPDATE contact_inquiries SET status = ? WHERE id = ?').bind(status, c.req.param('id')).run()
  }
  return c.json({ ok: true })
})

// ---------------- admin-only: users ----------------
adminRoutes.get('/users', requireAdmin, async (c) => {
  const res = await c.env.DB.prepare(
    'SELECT id, email, role, full_name, first_name, last_name, status, created_at, last_login_at FROM users ORDER BY created_at DESC LIMIT 500',
  ).all()
  return c.json({ users: res.results ?? [] })
})

// Creates a user account AND, for clients, a real client_profile with
// business details — not just a bare login shell. No password is
// accepted here either: like bootstrap, this returns a one-time
// activation link (via setup_token) for the new account holder to set
// their own password, consistent with the "never invent/hardcode a
// password" rule applied to the admin account.
adminRoutes.post('/users', requireAdmin, async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{
    email: string
    role?: string
    full_name?: string
    first_name?: string
    last_name?: string
    phone?: string
    business_name?: string
    entity_type?: string
    ein?: string
    state?: string
    services_enrolled?: string[]
  }>().catch(() => ({ email: '' }) as any)
  const e = (body.email || '').trim().toLowerCase()
  const r = ['client', 'staff', 'admin'].includes(body.role ?? '') ? (body.role as string) : 'client'
  if (!e) return c.json({ error: 'email required' }, 400)

  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(e).first()
  if (exists) return c.json({ error: 'a user with that email already exists' }, 409)

  const id = uuid()
  const fn = body.full_name || [body.first_name, body.last_name].filter(Boolean).join(' ') || null
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) || null : null

  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, phone, two_factor_enabled, status)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 0, 'active')`,
    ).bind(id, e, r, fn, body.first_name ?? null, body.last_name ?? null, phone),
  ]
  if (r === 'client') {
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO client_profiles (id, user_id, business_name, entity_type, ein, state, services_enrolled, onboarding_completed)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      ).bind(
        uuid(),
        id,
        body.business_name ?? null,
        body.entity_type ?? null,
        body.ein ?? null,
        body.state ?? null,
        Array.isArray(body.services_enrolled) ? JSON.stringify(body.services_enrolled) : null,
      ),
    )
  } else if (r === 'staff') {
    stmts.push(c.env.DB.prepare("INSERT INTO team_members (id, user_id, staff_role) VALUES (?, ?, 'pinnacle_admin')").bind(uuid(), id))
  }
  stmts.push(
    activityInsert(c.env, {
      actorUserId: user.id,
      clientUserId: r === 'client' ? id : null,
      kind: 'user_created',
      detail: { email: e, role: r, full_name: fn },
    }),
  )
  await c.env.DB.batch(stmts)

  const setupToken = await createActivationToken(c.env, id)
  return c.json({ ok: true, user: { id, email: e, role: r, full_name: fn }, setup_token: setupToken }, 201)
})

adminRoutes.patch('/users/:id', requireAdmin, async (c) => {
  const actor = c.get('user')
  const id = c.req.param('id')
  const body = await c.req.json<{ status?: string; role?: string }>().catch(() => ({} as { status?: string; role?: string }))
  const status = ['active', 'suspended'].includes(body.status ?? '') ? body.status : undefined
  const role = ['client', 'staff', 'admin'].includes(body.role ?? '') ? body.role : undefined
  if (!status && !role) return c.json({ error: 'nothing to update' }, 400)
  const target = await c.env.DB.prepare('SELECT role, status, full_name, email FROM users WHERE id = ?').bind(id).first<any>()
  await c.env.DB.prepare(
    'UPDATE users SET status = COALESCE(?, status), role = COALESCE(?, role) WHERE id = ?',
  ).bind(status ?? null, role ?? null, id).run()
  if (target && ((status && status !== target.status) || (role && role !== target.role))) {
    await logActivity(c.env, {
      actorUserId: actor.id,
      clientUserId: target.role === 'client' ? id : null,
      kind: 'user_status_changed',
      detail: { name: target.full_name || target.email, from: { status: target.status, role: target.role }, to: { status: status ?? target.status, role: role ?? target.role } },
    })
  }
  return c.json({ ok: true })
})

// ---------------- admin-only: staff assignments ----------------
adminRoutes.get('/assignments', requireAdmin, async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT sa.*, su.email AS staff_email, su.full_name AS staff_name, cu.email AS client_email, cu.full_name AS client_name
     FROM staff_assignments sa
     JOIN users su ON su.id = sa.staff_user_id
     JOIN users cu ON cu.id = sa.client_user_id
     ORDER BY sa.created_at DESC LIMIT 500`,
  ).all()
  return c.json({ assignments: res.results ?? [] })
})

adminRoutes.post('/assignments', requireAdmin, async (c) => {
  const { staff_user_id, client_user_id } = await c.req.json<{ staff_user_id: string; client_user_id: string }>()
    .catch(() => ({ staff_user_id: '', client_user_id: '' }))
  if (!staff_user_id || !client_user_id) return c.json({ error: 'staff_user_id and client_user_id are required' }, 400)
  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO staff_assignments (id, staff_user_id, client_user_id) VALUES (?, ?, ?)
     ON CONFLICT(staff_user_id, client_user_id) DO NOTHING`,
  ).bind(id, staff_user_id, client_user_id).run()
  return c.json({ ok: true, id }, 201)
})

adminRoutes.delete('/assignments/:id', requireAdmin, async (c) => {
  await c.env.DB.prepare('DELETE FROM staff_assignments WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// ---------------- admin-only: settings ----------------
adminRoutes.get('/settings', requireAdmin, async (c) => {
  const res = await c.env.DB.prepare('SELECT * FROM app_settings').all()
  return c.json({ settings: res.results ?? [] })
})

adminRoutes.patch('/settings', requireAdmin, async (c) => {
  const body = await c.req.json<Record<string, string>>().catch(() => ({} as Record<string, string>))
  const entries = Object.entries(body).slice(0, 50)
  for (const [key, value] of entries) {
    await c.env.DB.prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).bind(key, String(value)).run()
  }
  return c.json({ ok: true })
})

// ---------------- staff + admin: activity feed / notifications ----------------
// Events with client_user_id = NULL (new inquiry, new staff/admin user) are firm-wide
// and shown to every staff member regardless of client assignment.
const ACTIVITY_SEEN_KEY = (userId: string) => `activity_seen:${userId}`

adminRoutes.get('/activity', requireStaff, async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user, 'ae.client_user_id')
  const res = await c.env.DB.prepare(
    `SELECT ae.*, actor.full_name AS actor_name, actor.email AS actor_email,
            cu.full_name AS client_name, cu.email AS client_email
     FROM activity_events ae
     LEFT JOIN users actor ON actor.id = ae.actor_user_id
     LEFT JOIN users cu ON cu.id = ae.client_user_id
     WHERE (${where}) OR ae.client_user_id IS NULL
     ORDER BY ae.created_at DESC LIMIT 100`,
  ).bind(...params).all()
  return c.json({ events: res.results ?? [] })
})

adminRoutes.get('/activity/unread-count', requireStaff, async (c) => {
  const user = c.get('user')
  const seen = (await c.env.SESSIONS.get(ACTIVITY_SEEN_KEY(user.id))) || '1970-01-01T00:00:00.000Z'
  const { where, params } = await scopeFilter(c.env, user, 'ae.client_user_id')
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) n FROM activity_events ae WHERE ((${where}) OR ae.client_user_id IS NULL) AND ae.created_at > ?`,
  ).bind(...params, seen).first<{ n: number }>()
  return c.json({ count: row?.n ?? 0 })
})

adminRoutes.post('/activity/mark-seen', requireStaff, async (c) => {
  const user = c.get('user')
  await c.env.SESSIONS.put(ACTIVITY_SEEN_KEY(user.id), new Date().toISOString())
  return c.json({ ok: true })
})

// ---------------- staff + admin: open-items drill-down (from dashboard stat cards) ----------------
const OPEN_ITEM_CONFIG: Record<string, { table: string; statusPredicate: string }> = {
  tickets: { table: 'support_tickets', statusPredicate: "t.status = 'open'" },
  matters: { table: 'matters', statusPredicate: "t.status != 'closed'" },
  tasks: { table: 'client_tasks', statusPredicate: "t.status != 'done'" },
  calls: { table: 'planned_calls', statusPredicate: "t.status = 'requested'" },
  invoices: { table: 'invoices', statusPredicate: "t.status = 'open'" },
}

adminRoutes.get('/open-items', requireStaff, async (c) => {
  const user = c.get('user')
  const type = c.req.query('type') ?? ''
  const cfg = OPEN_ITEM_CONFIG[type]
  if (!cfg) return c.json({ error: 'unknown type — expected one of ' + Object.keys(OPEN_ITEM_CONFIG).join(', ') }, 400)
  const { where, params } = await scopeFilter(c.env, user, 't.client_user_id')
  const res = await c.env.DB.prepare(
    `SELECT t.*, u.full_name AS client_name, u.email AS client_email
     FROM ${cfg.table} t JOIN users u ON u.id = t.client_user_id
     WHERE ${where} AND ${cfg.statusPredicate}
     ORDER BY t.created_at DESC LIMIT 200`,
  ).bind(...params).all()
  return c.json({ type, items: res.results ?? [] })
})

// unused import guard (visibleClientIds retained for potential future use in reports)
void visibleClientIds
