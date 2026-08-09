import { Hono } from 'hono'
import type { AppEnv, SessionUser } from '../types'
import { uuid, hashPassword, verifyPassword } from '../crypto'
import { createSession, sessionCookie, clearCookie, destroySession, createActivationToken, consumeActivationToken, getUser } from '../session'
import { activityInsert } from '../activity'
import { logAudit, actorIp, actorUserAgent } from '../auditLog'
import { notifyStaff, escapeHtml } from '../email'

export const MIN_PASSWORD = 10
const MAX_FAILS = 5
const LOCKOUT_SECONDS = 15 * 60
const SIGNUP_MAX_PER_HOUR = 8

const norm = (e: string) => (e || '').trim().toLowerCase()
const cleanName = (s: unknown) => (typeof s === 'string' ? s.trim().slice(0, 120) : '')

function throttleKey(email: string, ip: string) {
  return `fail:${email}:${ip}`
}
async function isLockedOut(env: AppEnv['Bindings'], email: string, ip: string): Promise<boolean> {
  const raw = await env.SESSIONS.get(throttleKey(email, ip))
  return raw ? parseInt(raw, 10) >= MAX_FAILS : false
}
async function recordFailure(env: AppEnv['Bindings'], email: string, ip: string) {
  const k = throttleKey(email, ip)
  const cur = parseInt((await env.SESSIONS.get(k)) || '0', 10) + 1
  await env.SESSIONS.put(k, String(cur), { expirationTtl: LOCKOUT_SECONDS })
}
async function clearFailures(env: AppEnv['Bindings'], email: string, ip: string) {
  await env.SESSIONS.delete(throttleKey(email, ip))
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
    tos_accepted?: boolean
  }>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request body' }, 400)

  const e = norm(body.email)
  const firstName = cleanName(body.first_name)
  const lastName = cleanName(body.last_name)
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : ''
  const businessName = typeof body.business_name === 'string' ? body.business_name.trim().slice(0, 200) : null

  if (!e || !e.includes('@')) return c.json({ error: 'a valid email is required' }, 400)
  if (!firstName || !lastName) return c.json({ error: 'first and last name are required' }, 400)
  if (!phone) return c.json({ error: 'a phone number is required' }, 400)
  if (!body.password || body.password.length < MIN_PASSWORD) {
    return c.json({ error: `password must be at least ${MIN_PASSWORD} characters` }, 400)
  }
  if (body.tos_accepted !== true) {
    return c.json({ error: 'you must accept the Terms of Service to create an account' }, 400)
  }

  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  if (await signupThrottled(c.env, ip)) {
    return c.json({ error: 'too many signups from this network — try again later' }, 429)
  }

  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(e).first()
  if (exists) return c.json({ error: 'an account with that email already exists' }, 409)

  const id = uuid()
  const hash = await hashPassword(body.password, c.env.SESSION_SECRET)
  const fullName = `${firstName} ${lastName}`.trim()

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, phone, two_factor_enabled, status, tos_accepted_at)
       VALUES (?, ?, ?, 'client', ?, ?, ?, ?, 0, 'active', datetime('now'))`,
    ).bind(id, e, hash, fullName, firstName, lastName, phone),
    c.env.DB.prepare(
      `INSERT INTO client_profiles (id, user_id, business_name, onboarding_completed) VALUES (?, ?, ?, 0)`,
    ).bind(uuid(), id, businessName),
    activityInsert(c.env, { clientUserId: id, kind: 'client_signed_up', detail: { email: e, business_name: businessName } }),
  ])

  c.executionCtx.waitUntil(
    notifyStaff(c.env, {
      staffUserIds: [],
      kind: 'client_signed_up',
      subject: `New client signup: ${fullName}`,
      html: `<p><strong>${escapeHtml(fullName)}</strong> created a new Pinnacle client account.</p><p>Email: ${escapeHtml(e)}<br>Phone: ${escapeHtml(phone)}${businessName ? `<br>Business: ${escapeHtml(businessName)}` : ''}</p><p>The client can now continue through portal onboarding and service intake.</p>`,
    }),
  )

  const su: SessionUser = { id, email: e, role: 'client', full_name: fullName, first_name: firstName, last_name: lastName }
  const token = await createSession(c.env, su)
  c.header('Set-Cookie', sessionCookie(token))
  return c.json({ ok: true, user: su }, 201)
})

// ---------- self-service signup (vendors/providers) ----------
// Creates a staff-role account like any employee, but party_type='vendor'
// and status='pending' — the existing `status !== 'active'` check in the
// login handlers below already blocks sign-in, so a pending vendor simply
// can't log in until an admin/owner approves them from Team & Vendors
// (which sets status='active' and assigns capabilities/role there).
authRoutes.post('/vendor-signup', async (c) => {
  const body = await c.req.json<{
    email: string
    password: string
    full_name: string
    phone?: string
    company_name?: string
    vendor_category?: string
    notes?: string
  }>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request body' }, 400)

  const e = norm(body.email)
  const fullName = cleanName(body.full_name)
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : ''
  const vendorCategory = typeof body.vendor_category === 'string' ? body.vendor_category.trim().slice(0, 100) : ''
  const companyName = typeof body.company_name === 'string' ? body.company_name.trim().slice(0, 200) : ''
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : ''

  if (!e || !e.includes('@')) return c.json({ error: 'a valid email is required' }, 400)
  if (!fullName) return c.json({ error: 'your name is required' }, 400)
  if (!vendorCategory) return c.json({ error: 'please describe what you provide' }, 400)
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
  const hash = await hashPassword(body.password, c.env.SESSION_SECRET)
  const title = companyName ? `${vendorCategory} — ${companyName}` : vendorCategory

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, full_name, phone, two_factor_enabled, status)
       VALUES (?, ?, ?, 'staff', ?, ?, 0, 'pending')`,
    ).bind(id, e, hash, fullName, phone || null),
    c.env.DB.prepare(
      `INSERT INTO team_members (id, user_id, staff_role, title, party_type, vendor_category)
       VALUES (?, ?, 'support_specialist', ?, 'vendor', ?)`,
    ).bind(uuid(), id, title, vendorCategory),
    activityInsert(c.env, { actorUserId: id, kind: 'vendor_signup_submitted', detail: { email: e, full_name: fullName, vendor_category: vendorCategory, company_name: companyName || undefined } }),
  ])

  c.executionCtx.waitUntil(
    notifyStaff(c.env, {
      staffUserIds: [],
      kind: 'vendor_signup_submitted',
      subject: `New vendor/provider signup: ${fullName}`,
      html: `<p><strong>${escapeHtml(fullName)}</strong> applied for a vendor/provider account.</p><p>Email: ${escapeHtml(e)}${phone ? `<br>Phone: ${escapeHtml(phone)}` : ''}<br>Provides: ${escapeHtml(vendorCategory)}${companyName ? `<br>Company: ${escapeHtml(companyName)}` : ''}${notes ? `<br>Notes: ${escapeHtml(notes)}` : ''}</p><p>Review and approve from Team &amp; Vendors in HQ before they can sign in.</p>`,
    }),
  )

  return c.json({ ok: true, status: 'pending' }, 201)
})

// ---------- first-admin bootstrap (only works while there are zero users) ----------
authRoutes.post('/bootstrap', async (c) => {
  const { email, full_name } = await c.req.json<{ email: string; full_name?: string }>()
    .catch(() => ({ email: '', full_name: '' }))
  const e = norm(email)
  if (!e) return c.json({ error: 'email required' }, 400)

  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()
  if ((count?.n ?? 0) > 0) return c.json({ error: 'bootstrap disabled: an account already exists' }, 403)

  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, role, full_name, two_factor_enabled, status)
     VALUES (?, ?, NULL, 'admin', ?, 0, 'active')`,
  ).bind(id, e, full_name ?? null).run()

  const setupToken = await createActivationToken(c.env, id)
  return c.json({ ok: true, user: { id, email: e, role: 'admin', full_name: full_name ?? null }, setup_token: setupToken }, 201)
})

// ---------- set-password (consumes a one-time activation token) ----------
authRoutes.post('/set-password', async (c) => {
  const { token, password } = await c.req.json<{ token: string; password: string }>()
    .catch(() => ({ token: '', password: '' }))
  if (!token || !password) return c.json({ error: 'token and password required' }, 400)
  if (password.length < MIN_PASSWORD) return c.json({ error: `password must be at least ${MIN_PASSWORD} characters` }, 400)

  const userId = await consumeActivationToken(c.env, token)
  if (!userId) return c.json({ error: 'this setup link is invalid or has expired — ask an admin for a new one' }, 400)

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<any>()
  if (!user || user.status !== 'active') return c.json({ error: 'account not found or inactive' }, 400)

  const hash = await hashPassword(password, c.env.SESSION_SECRET)
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, last_login_at = datetime('now') WHERE id = ?").bind(hash, userId).run()

  const su: SessionUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
  }
  const sessToken = await createSession(c.env, su)
  c.header('Set-Cookie', sessionCookie(sessToken))
  return c.json({ ok: true, user: su })
})

// ---------- login (password) with throttling ----------
authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>()
    .catch(() => ({ email: '', password: '' }))
  const e = norm(email)
  if (!e || !password) return c.json({ error: 'email and password required' }, 400)
  const ip = c.req.header('CF-Connecting-IP') || 'unknown'

  if (await isLockedOut(c.env, e, ip)) {
    return c.json({ error: 'too many attempts — try again in 15 minutes' }, 429)
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(e).first<any>()
  let ok = false
  if (user && user.status === 'active' && user.password_hash) {
    ok = await verifyPassword(password, user.password_hash, c.env.SESSION_SECRET)
  } else {
    await verifyPassword(password, 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', c.env.SESSION_SECRET)
  }

  if (!user || user.status !== 'active' || !ok) {
    await recordFailure(c.env, e, ip)
    return c.json({ error: 'invalid email or password' }, 401)
  }

  await clearFailures(c.env, e, ip)
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
  await logAudit(c.env, { actorUserId: user.id, actorIp: ip, actorUserAgent: actorUserAgent(c.req.raw), action: 'login' })
  return c.json({ ok: true, user: su })
})

authRoutes.post('/logout', async (c) => {
  const user = await getUser(c.env, c.req.raw)
  await destroySession(c.env, c.req.raw)
  c.header('Set-Cookie', clearCookie())
  if (user) await logAudit(c.env, { actorUserId: user.id, actorIp: actorIp(c.req.raw), actorUserAgent: actorUserAgent(c.req.raw), action: 'logout' })
  return c.json({ ok: true })
})
