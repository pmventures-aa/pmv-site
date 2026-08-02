import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import type { Env, SessionUser } from '../_lib/types'
import { uuid, randomCode, hashSecret, constantTimeEqual } from '../_lib/crypto'
import {
  createSession, sessionCookie, clearCookie, getUser, destroySession,
} from '../_lib/session'
import { visibleClientIds } from '../_lib/access'

type Vars = { user: SessionUser }
const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath('/api')

// ---------- health ----------
app.get('/health', (c) => c.json({ ok: true, service: 'pmv-api', time: new Date().toISOString() }))

// ---------- auth: step 1 — request an OTP ----------
app.post('/auth/request-otp', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password?: string }>().catch(() => ({ email: '', password: undefined as string | undefined }))
  if (!email) return c.json({ error: 'email required' }, 400)

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?')
    .bind(email.toLowerCase()).first<any>()
  // Always return ok to avoid leaking which emails exist.
  if (!user || user.status !== 'active') return c.json({ ok: true })

  // Optional password gate before OTP.
  if (user.password_hash && password !== undefined) {
    const ph = await hashSecret(password, user.id)
    if (!(await constantTimeEqual(ph, user.password_hash))) return c.json({ error: 'invalid credentials' }, 401)
  }

  const code = randomCode(6)
  const codeHash = await hashSecret(code, user.id)
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  await c.env.DB.prepare(
    'INSERT INTO otp_codes (id, user_id, purpose, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(uuid(), user.id, 'login', codeHash, expires).run()

  // TODO(phase-2): send `code` via email (and SMS if phone_verified) instead of returning it.
  const debug = c.env.SESSION_SECRET === 'dev' ? { dev_code: code } : {}
  return c.json({ ok: true, ...debug })
})

// ---------- auth: step 2 — verify OTP, issue session ----------
app.post('/auth/verify-otp', async (c) => {
  const { email, code } = await c.req.json<{ email: string; code: string }>().catch(() => ({ email: '', code: '' }))
  if (!email || !code) return c.json({ error: 'email and code required' }, 400)

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?')
    .bind(email.toLowerCase()).first<any>()
  if (!user) return c.json({ error: 'invalid code' }, 401)

  const row = await c.env.DB.prepare(
    `SELECT * FROM otp_codes WHERE user_id = ? AND purpose = 'login' AND consumed = 0
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(user.id).first<any>()
  if (!row) return c.json({ error: 'invalid code' }, 401)
  if (row.attempts >= 5) return c.json({ error: 'too many attempts' }, 429)
  if (new Date(row.expires_at).getTime() < Date.now()) return c.json({ error: 'code expired' }, 401)

  const ok = await constantTimeEqual(await hashSecret(code, user.id), row.code_hash)
  if (!ok) {
    await c.env.DB.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run()
    return c.json({ error: 'invalid code' }, 401)
  }
  await c.env.DB.prepare('UPDATE otp_codes SET consumed = 1 WHERE id = ?').bind(row.id).run()
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

// ---------- auth guard for everything under /api/me and /api/portal ----------
app.use('/me', async (c, next) => requireUser(c, next))
app.use('/portal/*', async (c, next) => requireUser(c, next))

async function requireUser(c: any, next: any) {
  const user = await getUser(c.env, c.req.raw)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  c.set('user', user)
  await next()
}

app.get('/me', (c) => c.json({ user: c.get('user') }))

// ---------- sample authenticated, access-scoped route ----------
// Returns the caller's visible matters. Clients see their own; staff see
// assigned clients'; admins see all — enforced by visibleClientIds().
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
