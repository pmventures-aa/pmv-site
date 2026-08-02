import { Hono } from 'hono'
import type { AppEnv, SessionUser } from '../types'
import { uuid, hashPassword, verifyPassword } from '../crypto'
import { createSession, sessionCookie, clearCookie, destroySession } from '../session'

export const MIN_PASSWORD = 10
const MAX_FAILS = 5
const LOCKOUT_SECONDS = 15 * 60
const SIGNUP_MAX_PER_HOUR = 8

const norm = (e: string) => (e || '').trim().toLowerCase()
const cleanName = (s: unknown) => (typeof s === 'string' ? s.trim().slice(0, 120) : '')

async function throttleKey(email: string) {
  return `fail:${email}`
}
async function isLockedOut(env: AppEnv['Bindings'], email: string): Promise<boolean> {
  const raw = await env.SESSIONS.get(await throttleKey(email))
  return raw ? parseInt(raw, 10) >= MAX_FAILS : false
}
async function recordFailure(env: AppEnv['Bindings'], email: string) {
  const k = await throttleKey(email)
  const cur = parseInt((await env.SESSIONS.get(k)) || '0', 10) + 1
  await env.SESSIONS.put(k, String(cur), { expirationTtl: LOCKOUT_SECONDS })
}
async function clearFailures(env: AppEnv['Bindings'], email: string) {
  await env.SESSIONS.delete(await throttleKey(email))
}
async function signupThrottled(env: AppEnv['Bindings'], ip: string): Promise<boolean> {
  const k = `signup:${ip}`
  const cur = parseInt((await env.SESSIONS.get(k)) || '0', 10)
  if (cur >= SIGNUP_MAX_PER_HOUR) return true
  await env.SESSIONS.put(k, String(cur + 1), { expirationTtl: 3600 })
  return false
}

export const authRoutes = new Hono<AppEnv>()

authRoutes.get('/health', (c) => c.json({ ok: true, service: 'pmv-api', time: new Date().toISOString() }))

// ---------- self-service signup (clients only) ----------
authRoutes.post('/signup', async (c) => {
  const body = await c.req.json<{
    email: string
    password: string
    first_name: string
    last_name: string
    phone?: string
    business_name?: string
  }>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request body' }, 400)

  const e = norm(body.email)
  const firstName = cleanName(body.first_name)
  const lastName = cleanName(body.last_name)
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : null
  const businessName = typeof body.business_name === 'string' ? body.business_name.trim().slice(0, 200) : null

  if (!e || !e.includes('@')) return c.json({ error: 'a valid email is required' }, 400)
  if (!firstName || !lastName) return c.json({ error: 'first and last name are required' }, 400)
  if (!body.password || body.password.length < MIN_PASSWORD) {
    return c.json({ error: `password must be at least ${MIN_PASSWORD} characters` }, 400)
  }

  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  if (await signupThrottled(c.env, ip)) {
    return c.json({ error: 'too many signups from this network — try again later' }, 429)
  }

  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(e).first()
  if (exists) return c.json({ error: 'an account with that email already exists' }, 409)

  const id = uuid()
  const hash = await hashPassword(body.password)
  const fullName = `${firstName} ${lastName}`.trim()

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, phone, two_factor_enabled, status)
       VALUES (?, ?, ?, 'client', ?, ?, ?, ?, 0, 'active')`,
    ).bind(id, e, hash, fullName, firstName, lastName, phone),
    c.env.DB.prepare(
      `INSERT INTO client_profiles (id, user_id, business_name, onboarding_completed) VALUES (?, ?, ?, 0)`,
    ).bind(uuid(), id, businessName),
  ])

  const su: SessionUser = { id, email: e, role: 'client', full_name: fullName, first_name: firstName, last_name: lastName }
  const token = await createSession(c.env, su)
  c.header('Set-Cookie', sessionCookie(token))
  return c.json({ ok: true, user: su }, 201)
})

// ---------- first-admin bootstrap (only works while there are zero users) ----------
authRoutes.post('/bootstrap', async (c) => {
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
authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>()
    .catch(() => ({ email: '', password: '' }))
  const e = norm(email)
  if (!e || !password) return c.json({ error: 'email and password required' }, 400)

  if (await isLockedOut(c.env, e)) {
    return c.json({ error: 'too many attempts — try again in 15 minutes' }, 429)
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(e).first<any>()
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
  const su: SessionUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
  }
  const token = await createSession(c.env, su)
  c.header('Set-Cookie', sessionCookie(token))
  return c.json({ ok: true, user: su })
})

authRoutes.post('/logout', async (c) => {
  await destroySession(c.env, c.req.raw)
  c.header('Set-Cookie', clearCookie())
  return c.json({ ok: true })
})
