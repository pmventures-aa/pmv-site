import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff, requireAdmin } from '../mid'
import { uuid, hashPassword } from '../crypto'
import { scopeFilter, canAccessClient, ScopeError } from '../scope'
import { visibleClientIds } from '../access'
import { MIN_PASSWORD } from './auth'

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
  const [openTickets, openMatters, pendingTasks, pendingCalls, openInvoices] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) n FROM support_tickets WHERE ${w2} AND status = 'open'`).bind(...p2).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM matters WHERE ${w2} AND status != 'closed'`).bind(...p2).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM client_tasks WHERE ${w2} AND status != 'done'`).bind(...p2).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM planned_calls WHERE ${w2} AND status = 'requested'`).bind(...p2).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM invoices WHERE ${w2} AND status = 'open'`).bind(...p2).first<{ n: number }>(),
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

// ---------------- admin-only: users ----------------
adminRoutes.get('/users', requireAdmin, async (c) => {
  const res = await c.env.DB.prepare(
    'SELECT id, email, role, full_name, first_name, last_name, status, created_at, last_login_at FROM users ORDER BY created_at DESC LIMIT 500',
  ).all()
  return c.json({ users: res.results ?? [] })
})

adminRoutes.post('/users', requireAdmin, async (c) => {
  const { email, password, role, full_name, first_name, last_name } = await c.req.json<{
    email: string; password: string; role?: string; full_name?: string; first_name?: string; last_name?: string
  }>().catch(() => ({ email: '', password: '', role: 'client', full_name: '', first_name: '', last_name: '' }))
  const e = (email || '').trim().toLowerCase()
  const r = ['client', 'staff', 'admin'].includes(role ?? '') ? (role as string) : 'client'
  if (!e || !password) return c.json({ error: 'email and password required' }, 400)
  if (password.length < MIN_PASSWORD) return c.json({ error: `password must be at least ${MIN_PASSWORD} characters` }, 400)

  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(e).first()
  if (exists) return c.json({ error: 'a user with that email already exists' }, 409)

  const id = uuid()
  const hash = await hashPassword(password)
  const fn = full_name || [first_name, last_name].filter(Boolean).join(' ') || null
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, two_factor_enabled, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'active')`,
  ).bind(id, e, hash, r, fn, first_name ?? null, last_name ?? null).run()

  if (r === 'client') {
    await c.env.DB.prepare('INSERT INTO client_profiles (id, user_id, onboarding_completed) VALUES (?, ?, 0)').bind(uuid(), id).run()
  } else if (r === 'staff') {
    await c.env.DB.prepare("INSERT INTO team_members (id, user_id, staff_role) VALUES (?, ?, 'pinnacle_admin')").bind(uuid(), id).run()
  }

  return c.json({ ok: true, user: { id, email: e, role: r, full_name: fn } }, 201)
})

adminRoutes.patch('/users/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ status?: string; role?: string }>().catch(() => ({} as { status?: string; role?: string }))
  const status = ['active', 'suspended'].includes(body.status ?? '') ? body.status : undefined
  const role = ['client', 'staff', 'admin'].includes(body.role ?? '') ? body.role : undefined
  if (!status && !role) return c.json({ error: 'nothing to update' }, 400)
  await c.env.DB.prepare(
    'UPDATE users SET status = COALESCE(?, status), role = COALESCE(?, role) WHERE id = ?',
  ).bind(status ?? null, role ?? null, id).run()
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

// unused import guard (visibleClientIds retained for potential future use in reports)
void visibleClientIds
