import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import type { Env, SessionUser } from '../_lib/types'
import { uuid, hashPassword, verifyPassword } from '../_lib/crypto'
import { createSession, sessionCookie, clearCookie, getUser, destroySession } from '../_lib/session'
import { visibleClientIds } from '../_lib/access'

type Vars = { user: SessionUser }
const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath('/api')

const MIN_PASSWORD = 10
const MAX_FAILS = 5           // failed attempts before lockout
const LOCKOUT_SECONDS = 15 * 60

// ---------- helpers ----------
const norm = (e: string) => (e || '').trim().toLowerCase()

async function throttleKey(env: Env, email: string) {
  return `fail:${email}`
}
async function isLockedOut(env: Env, email: string): Promise<boolean> {
  const raw = await env.SESSIONS.get(await throttleKey(env, email))
  return raw ? parseInt(raw, 10) >= MAX_FAILS : false
}
async function recordFailure(env: Env, email: string) {
  const k = await throttleKey(env, email)
  const cur = parseInt((await env.SESSIONS.get(k)) || '0', 10) + 1
  await env.SESSIONS.put(k, String(cur), { expirationTtl: LOCKOUT_SECONDS })
}
async function clearFailures(env: Env, email: string) {
  await env.SESSIONS.delete(await throttleKey(env, email))
}

// ---------- health ----------
app.get('/health', (c) => c.json({ ok: true, service: 'pmv-api', time: new Date().toISOString() }))

// ---------- first-admin bootstrap (only works while there are zero users) ----------
app.post('/auth/bootstrap', async (c) => {
  const { email, password, full_name } = await c.req.json<{ email: string; password: string; full_name?: string }>()
    .catch(() => ({ email: '', password: '', full_name: '' }))
  const e = norm(email)
  if (!e || !password) return c.json({ error: 'email and password required' }, 400)
  if (password.length < MIN_PASSWORD) return c.json({ error: `password must be at least ${MIN_PASSWORD} characters` }, 400)

  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()
  if ((count?.n ?? 0) > 0) return c.json({ error: 'bootstrap disabled: an account already exists' }, 403)

  const id = uuid()
  const hash = await hashPassword(password)
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, role, full_name, two_factor_enabled, status)
     VALUES (?, ?, ?, 'admin', ?, 0, 'active')`,
  ).bind(id, e, hash, full_name ?? null).run()

  const su: SessionUser = { id, email: e, role: 'admin', full_name: full_name ?? null }
  const token = await createSession(c.env, su)
  c.header('Set-Cookie', sessionCookie(token))
  return c.json({ ok: true, user: su })
})

// ---------- login (password) with throttling ----------
app.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>()
    .catch(() => ({ email: '', password: '' }))
  const e = norm(email)
  if (!e || !password) return c.json({ error: 'email and password required' }, 400)

  if (await isLockedOut(c.env, e)) {
    return c.json({ error: 'too many attempts — try again in 15 minutes' }, 429)
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(e).first<any>()
  // Constant-ish: still run a verify to reduce user-enumeration timing differences.
  let ok = false
  if (user && user.status === 'active' && user.password_hash) {
    ok = await verifyPassword(password, user.password_hash)
  } else {
    // dummy verify to equalize timing and reduce user enumeration
    await verifyPassword(password, 'pbkdf2$120000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')
  }

  if (!user || user.status !== 'active' || !ok) {
    await recordFailure(c.env, e)
    return c.json({ error: 'invalid email or password' }, 401)
  }

  await clearFailures(c.env, e)
  await c.env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(user.id).run()
  const su: SessionUser = { id: user.id, email: user.email, role: user.role, full_name: user.full_name }
  const token = await createSession(c.env, su)
  c.header('Set-Cookie', sessionCookie(token))
  return c.json({ ok: true, user: su })
})

app.post('/auth/logout', async (c) => {
  await destroySession(c.env, c.req.raw)
  c.header('Set-Cookie', clearCookie())
  return c.json({ ok: true })
})

// ---------- auth guards ----------
async function requireUser(c: any, next: any) {
  const user = await getUser(c.env, c.req.raw)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  c.set('user', user)
  await next()
}
async function requireAdmin(c: any, next: any) {
  const user = await getUser(c.env, c.req.raw)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  c.set('user', user)
  await next()
}

app.use('/me', requireUser)
app.use('/portal/*', requireUser)
app.use('/admin/*', requireAdmin)

app.get('/me', (c) => c.json({ user: c.get('user') }))

// ---------- admin: create a user (client or staff) ----------
app.post('/admin/users', async (c) => {
  const { email, password, role, full_name } = await c.req.json<{
    email: string; password: string; role?: string; full_name?: string
  }>().catch(() => ({ email: '', password: '', role: 'client', full_name: '' }))
  const e = norm(email)
  const r = ['client', 'staff', 'admin'].includes(role ?? '') ? (role as string) : 'client'
  if (!e || !password) return c.json({ error: 'email and password required' }, 400)
  if (password.length < MIN_PASSWORD) return c.json({ error: `password must be at least ${MIN_PASSWORD} characters` }, 400)

  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(e).first()
  if (exists) return c.json({ error: 'a user with that email already exists' }, 409)

  const id = uuid()
  const hash = await hashPassword(password)
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, role, full_name, two_factor_enabled, status)
     VALUES (?, ?, ?, ?, ?, 0, 'active')`,
  ).bind(id, e, hash, r, full_name ?? null).run()
  return c.json({ ok: true, user: { id, email: e, role: r, full_name: full_name ?? null } })
})

// ---------- sample access-scoped route ----------
app.get('/portal/matters', async (c) => {
  const user = c.get('user')
  const ids = await visibleClientIds(c.env, user)
  let res
  if (ids === null) {
    res = await c.env.DB.prepare('SELECT * FROM matters ORDER BY created_at DESC LIMIT 100').all()
  } else if (ids.length === 0) {
    return c.json({ matters: [] })
  } else {
    const ph = ids.map(() => '?').join(',')
    res = await c.env.DB.prepare(
      `SELECT * FROM matters WHERE client_user_id IN (${ph}) ORDER BY created_at DESC LIMIT 100`,
    ).bind(...ids).all()
  }
  return c.json({ matters: res.results ?? [] })
})

export const onRequest = handle(app)
