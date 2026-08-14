import { Hono } from 'hono'
import type { AppEnv, SessionUser } from '../types'
import { uuid, hashPassword, verifyPassword } from '../crypto'
import {
  createSession,
  sessionCookie,
  clearCookie,
  destroySession,
  createActivationToken,
  consumeActivationToken,
  createPasswordResetToken,
  consumePasswordResetToken,
  revokeUserSessions,
  getUser,
} from '../session'
import { activityInsert, logActivity } from '../activity'
import { logAudit, actorIp, actorUserAgent, actorGeo } from '../auditLog'
import { notifyStaff, escapeHtml, sendEmail } from '../email'
import { renderPinnacleEmailLayout } from '../emailTemplates/layout'
import { renderHqEmailOrFallback } from '../hqEmailTemplates'
import { CLIENT_PORTAL_URL, sendAccountWelcome, sendVendorApplicationReceived } from '../accountEmails'
import { PROVIDER_AGREEMENT_VERSION, normalizeProviderSignature } from '../../../shared/providerAgreement'
import { getCurrentProviderAgreementVersion } from '../managedTemplates'
import { toDisplayCase } from '../../../shared/displayCase'
import { advanceInquiryLifecycle } from '../lifecycle'
import { getInviteByToken } from '../invites'
import { canCompleteStagedVendorSignup, type ExistingAccount } from '../vendorStaging'
import { defaultAuth0Bridge } from '../auth0Client'

export const MIN_PASSWORD = 10
const MAX_FAILS = 5
const LOCKOUT_SECONDS = 15 * 60
const SIGNUP_MAX_PER_HOUR = 8
const RESET_MAX_PER_HOUR = 5

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
async function resetThrottled(env: AppEnv['Bindings'], email: string, ip: string): Promise<boolean> {
  const k = `pwreset-request:${ip}:${email}`
  const cur = parseInt((await env.SESSIONS.get(k)) || '0', 10)
  if (cur >= RESET_MAX_PER_HOUR) return true
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
  const firstName = toDisplayCase(cleanName(body.first_name))
  const lastName = toDisplayCase(cleanName(body.last_name))
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : ''
  const businessName = typeof body.business_name === 'string' ? toDisplayCase(body.business_name).slice(0, 200) || null : null

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
    return c.json({ error: 'too many signups from this network. Try again later.' }, 429)
  }

  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(e).first()
  if (exists) return c.json({ error: 'an account with that email already exists' }, 409)

  const id = uuid()
  const personPartyId = uuid()
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
    c.env.DB.prepare("INSERT INTO relationship_parties(id,party_type,display_name,email,phone) VALUES (?,'person',?,?,?)").bind(personPartyId,fullName,e,phone),
    c.env.DB.prepare('INSERT INTO relationship_people(party_id,first_name,last_name) VALUES (?,?,?)').bind(personPartyId,firstName,lastName),
    c.env.DB.prepare("INSERT INTO account_parties(user_id,party_id,access_role,is_primary) VALUES (?,?,'self',1)").bind(id,personPartyId),
    c.env.DB.prepare('UPDATE client_profiles SET primary_party_id=? WHERE user_id=?').bind(personPartyId,id),
    activityInsert(c.env, { clientUserId: id, kind: 'client_signed_up', detail: { email: e, business_name: businessName } }),
  ])

  if (businessName) {
    const businessPartyId = uuid()
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO relationship_parties(id,party_type,display_name) VALUES (?,'business',?)").bind(businessPartyId,businessName),
      c.env.DB.prepare('INSERT INTO relationship_businesses(party_id,legal_name,primary_contact_party_id) VALUES (?,?,?)').bind(businessPartyId,businessName,personPartyId),
      c.env.DB.prepare("INSERT INTO party_relationships(id,from_party_id,to_party_id,relationship_type,label) VALUES (?,?,?,'primary_contact','Primary Contact')").bind(uuid(),personPartyId,businessPartyId),
      c.env.DB.prepare('UPDATE client_profiles SET business_party_id=? WHERE user_id=?').bind(businessPartyId,id),
    ])
  }

  c.executionCtx.waitUntil(
    notifyStaff(c.env, {
      staffUserIds: [],
      kind: 'client_signed_up',
      subject: `New client signup: ${fullName}`,
      html: `<p><strong>${escapeHtml(fullName)}</strong> created a new Pinnacle client account.</p><p>Email: ${escapeHtml(e)}<br>Phone: ${escapeHtml(phone)}${businessName ? `<br>Business: ${escapeHtml(businessName)}` : ''}</p><p>The client can now continue through portal onboarding and service intake.</p>`,
    }),
  )
  c.executionCtx.waitUntil(
    sendAccountWelcome(c.env, {
      userId: id,
      role: 'client',
      email: e,
      firstName,
      businessName,
      creationType: 'self_signup',
      actionLabel: 'Open My Client Portal',
      actionUrl: CLIENT_PORTAL_URL,
    }).catch((err) => console.error('[account-email] client signup welcome failed', err)),
  )

  const su: SessionUser = { id, email: e, role: 'client', full_name: fullName, first_name: firstName, last_name: lastName }
  const token = await createSession(c.env, su, c.req.raw)
  c.header('Set-Cookie', sessionCookie(token))
  return c.json({ ok: true, user: su }, 201)
})

// ---------- self-service signup (vendors/providers) ----------
authRoutes.post('/vendor-signup', async (c) => {
  const body = await c.req.json<{
    email: string
    password: string
    full_name: string
    phone?: string
    company_name?: string
    vendor_category?: string
    notes?: string
    provider_agreement_version?: string
    provider_agreement_accepted?: boolean
    provider_signature_name?: string
    invite_token?: string
  }>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request body' }, 400)

  const e = norm(body.email)
  const fullName = toDisplayCase(cleanName(body.full_name))
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : ''
  const vendorCategory = typeof body.vendor_category === 'string' ? body.vendor_category.trim().slice(0, 100) : ''
  const companyName = typeof body.company_name === 'string' ? toDisplayCase(body.company_name).slice(0, 200) : ''
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : ''

  if (!e || !e.includes('@')) return c.json({ error: 'a valid email is required' }, 400)
  if (!fullName) return c.json({ error: 'your name is required' }, 400)
  if (!vendorCategory) return c.json({ error: 'please describe what you provide' }, 400)
  const currentAgreementVersion = await getCurrentProviderAgreementVersion(c.env)
  if (!body.provider_agreement_accepted || body.provider_agreement_version !== currentAgreementVersion) {
    return c.json({ error: 'accept the current Independent Provider Network Agreement to apply' }, 400)
  }
  const signatureName = cleanName(body.provider_signature_name)
  if (!signatureName || normalizeProviderSignature(signatureName) !== normalizeProviderSignature(fullName)) {
    return c.json({ error: 'your electronic signature must match your full legal name' }, 400)
  }
  if (!body.password || body.password.length < MIN_PASSWORD) {
    return c.json({ error: `password must be at least ${MIN_PASSWORD} characters` }, 400)
  }

  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  if (await signupThrottled(c.env, ip)) {
    return c.json({ error: 'too many signups from this network. Try again later.' }, 429)
  }

  const existing = await c.env.DB.prepare(
    `SELECT u.id, u.role, u.status, u.password_hash, tm.party_type
     FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id
     WHERE u.email = ?`,
  ).bind(e).first<ExistingAccount>()
  if (existing && !canCompleteStagedVendorSignup(existing)) {
    return c.json({ error: 'an account with that email already exists' }, 409)
  }

  const id = existing?.id || uuid()
  const hash = await hashPassword(body.password, c.env.SESSION_SECRET)
  const title = companyName ? `${vendorCategory}: ${companyName}` : vendorCategory
  const statements = existing
    ? [
      c.env.DB.prepare(
        `UPDATE users SET password_hash = ?, full_name = ?, phone = COALESCE(?, phone) WHERE id = ?`,
      ).bind(hash, fullName, phone || null, id),
      c.env.DB.prepare(
        `UPDATE team_members SET title = ?, party_type = 'vendor', vendor_category = COALESCE(?, vendor_category), network_status = 'vetting' WHERE user_id = ?`,
      ).bind(title, vendorCategory, id),
    ]
    : [
      c.env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, role, full_name, phone, two_factor_enabled, status)
         VALUES (?, ?, ?, 'staff', ?, ?, 0, 'pending')`,
      ).bind(id, e, hash, fullName, phone || null),
      c.env.DB.prepare(
        `INSERT INTO team_members (id, user_id, staff_role, title, party_type, vendor_category, network_status)
         VALUES (?, ?, 'support_specialist', ?, 'vendor', ?, 'vetting')`,
      ).bind(uuid(), id, title, vendorCategory),
    ]

  await c.env.DB.batch([
    ...statements,
    c.env.DB.prepare(
      `INSERT INTO provider_agreement_acceptances
       (id, user_id, agreement_version, signature_name, ip_address, user_agent, acceptance_method)
       VALUES (?, ?, ?, ?, ?, ?, 'provider_application')`,
    ).bind(uuid(), id, currentAgreementVersion, signatureName, actorIp(c.req.raw), actorUserAgent(c.req.raw)),
    activityInsert(c.env, { actorUserId: id, kind: 'vendor_signup_submitted', detail: { email: e, full_name: fullName, vendor_category: vendorCategory, company_name: companyName || undefined } }),
  ])

  if (existing) {
    const member = await c.env.DB.prepare('SELECT id FROM team_members WHERE user_id = ?').bind(id).first<{ id: string }>()
    if (!member) {
      await c.env.DB.prepare(
        `INSERT INTO team_members (id, user_id, staff_role, title, party_type, vendor_category, network_status)
         VALUES (?, ?, 'support_specialist', ?, 'vendor', ?, 'vetting')`,
      ).bind(uuid(), id, title, vendorCategory).run()
    }
  }

  const inviteToken = typeof body.invite_token === 'string' ? body.invite_token.trim() : ''
  if (inviteToken) {
    const invite = await getInviteByToken(c.env, inviteToken)
    if (invite && invite.invite_type === 'vendor' && invite.status === 'pending' && invite.email === e) {
      await c.env.DB.prepare(
        `UPDATE access_invites SET status = 'accepted', accepted_by_user_id = ?, accepted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      ).bind(id, invite.id).run()
    }
  }

  c.executionCtx.waitUntil(
    notifyStaff(c.env, {
      staffUserIds: [],
      kind: 'vendor_signup_submitted',
      subject: `New vendor/provider signup: ${fullName}`,
      html: `<p><strong>${escapeHtml(fullName)}</strong> applied for a vendor/provider account.</p><p>Email: ${escapeHtml(e)}${phone ? `<br>Phone: ${escapeHtml(phone)}` : ''}<br>Provides: ${escapeHtml(vendorCategory)}${companyName ? `<br>Company: ${escapeHtml(companyName)}` : ''}${notes ? `<br>Notes: ${escapeHtml(notes)}` : ''}</p><p>Review and approve from Team &amp; Vendors in HQ before they can sign in.</p>`,
    }),
  )
  c.executionCtx.waitUntil(
    sendVendorApplicationReceived(c.env, {
      userId: id,
      email: e,
      firstName: fullName.split(/\s+/)[0] || fullName,
    }).catch((err) => console.error('[account-email] vendor receipt failed', err)),
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
  if ((count?.n ?? 0) > 0) return c.json({ error: 'bootstrap disabled because an account already exists' }, 403)

  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, role, full_name, two_factor_enabled, status)
     VALUES (?, ?, NULL, 'admin', ?, 0, 'active')`,
  ).bind(id, e, full_name ?? null).run()

  const setupToken = await createActivationToken(c.env, id)
  return c.json({ ok: true, user: { id, email: e, role: 'admin', full_name: full_name ?? null }, setup_token: setupToken }, 201)
})

// ---------- set password from a one-time activation token ----------
authRoutes.post('/set-password', async (c) => {
  const { token, password } = await c.req.json<{ token: string; password: string }>()
    .catch(() => ({ token: '', password: '' }))
  if (!token || !password) return c.json({ error: 'token and password required' }, 400)
  if (password.length < MIN_PASSWORD) return c.json({ error: `password must be at least ${MIN_PASSWORD} characters` }, 400)

  const userId = await consumeActivationToken(c.env, token)
  if (!userId) return c.json({ error: 'this setup link is invalid or has expired. Ask an admin for a new one.' }, 400)

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<any>()
  if (!user || user.status !== 'active') return c.json({ error: 'account not found or inactive' }, 400)

  const hash = await hashPassword(password, c.env.SESSION_SECRET)
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, last_login_at = datetime('now') WHERE id = ?").bind(hash, userId).run()
  await c.env.DB.prepare("UPDATE contact_inquiries SET client_user_id = COALESCE(client_user_id, ?), updated_at = datetime('now') WHERE lower(email) = lower(?) AND converted_at IS NULL AND archived_at IS NULL").bind(userId, user.email).run()
  await advanceInquiryLifecycle(c.env, { userId, email: user.email, target: 'prospect' })

  const su: SessionUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
  }
  const sessToken = await createSession(c.env, su, c.req.raw)
  c.header('Set-Cookie', sessionCookie(sessToken))
  return c.json({ ok: true, user: su })
})

// ---------- password recovery ----------
authRoutes.post('/forgot-password', async (c) => {
  const body = await c.req.json<{ email?: string; surface?: 'client' | 'staff' }>()
    .catch(() => ({} as { email?: string; surface?: 'client' | 'staff' }))
  const email = norm(body.email || '')
  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  const generic = { ok: true, message: 'If an active Pinnacle account matches that email, a reset link is on the way.' }
  if (!email || !email.includes('@')) return c.json(generic)
  if (await resetThrottled(c.env, email, ip)) return c.json(generic)

  const user = await c.env.DB.prepare(
    "SELECT id,email,role,full_name,first_name,status FROM users WHERE email=? AND status='active'",
  ).bind(email).first<any>()
  if (!user) return c.json(generic)

  const token = await createPasswordResetToken(c.env, user.id)
  const isStaff = user.role === 'staff' || user.role === 'admin'
  const resetUrl = isStaff
    ? `https://www.pinnaclemanagementventures.com/admin/reset-password?token=${encodeURIComponent(token)}`
    : `https://www.pinnaclemanagementventures.com/portal/reset-password?token=${encodeURIComponent(token)}`
  const firstName = user.first_name || String(user.full_name || '').split(/\s+/)[0] || 'there'
  const fallbackHtml = renderPinnacleEmailLayout({
    preheader: 'Reset your Pinnacle password',
    eyebrow: isStaff ? 'Pinnacle HQ security' : 'Pinnacle account security',
    title: 'Reset your password',
    bodyHtml: `<p>Hi ${escapeHtml(firstName)},</p><p>We received a request to reset the password for your Pinnacle account. This secure link expires in 30 minutes and can be used only once.</p><p style="margin:24px 0"><a href="${resetUrl}" style="display:inline-block;background:#c9a227;color:#06111f;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px">Reset My Password</a></p><p>If you did not request this, you can ignore this email. Your current password will remain unchanged.</p>`,
  })
  const rendered = await renderHqEmailOrFallback(c.env, 'password_reset', {
    first_name: firstName,
    action_url: resetUrl,
    action_label: 'Reset My Password',
  }, { subject: 'Reset your Pinnacle password', html: fallbackHtml, text: `Reset your Pinnacle password: ${resetUrl}` })
  c.executionCtx.waitUntil(sendEmail(c.env, {
    to: user.email,
    subject: rendered.subject,
    html: rendered.html,
    replyTo: 'support@pinnaclemanagementventures.com',
    tags: [{ name: 'category', value: 'account_security' }],
  }))
  c.executionCtx.waitUntil(logAudit(c.env, {
    actorUserId: user.id,
    actorIp: ip,
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'password_reset_requested',
    entityType: 'user',
    entityId: user.id,
    after: { requested_surface: body.surface || null },
  }))
  // Emit an activity event so the reset request lands in the HQ
  // notification bell (categorized as security-red). Owners specifically
  // asked for a heads-up on every reset attempt so they can see unusual
  // patterns without opening the audit log.
  c.executionCtx.waitUntil(logActivity(c.env, {
    actorUserId: user.id,
    kind: 'password_reset',
    detail: { email: user.email, ip, surface: body.surface || null, target_name: user.full_name || null },
  }))
  return c.json(generic)
})

authRoutes.post('/reset-password', async (c) => {
  const body = await c.req.json<{ token?: string; password?: string }>()
    .catch(() => ({} as { token?: string; password?: string }))
  const token = String(body.token || '')
  const password = String(body.password || '')
  if (!token || !password) return c.json({ error: 'reset token and new password are required' }, 400)
  if (password.length < MIN_PASSWORD) return c.json({ error: `password must be at least ${MIN_PASSWORD} characters` }, 400)

  const userId = await consumePasswordResetToken(c.env, token)
  if (!userId) return c.json({ error: 'this password reset link is invalid or has expired' }, 400)
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(userId).first<any>()
  if (!user || user.status !== 'active') return c.json({ error: 'account not found or inactive' }, 400)

  const hash = await hashPassword(password, c.env.SESSION_SECRET)
  await c.env.DB.prepare("UPDATE users SET password_hash=?,last_login_at=datetime('now') WHERE id=?").bind(hash, userId).run()
  await revokeUserSessions(c.env, userId, userId, null)

  const su: SessionUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
  }
  const session = await createSession(c.env, su, c.req.raw)
  c.header('Set-Cookie', sessionCookie(session))
  await logAudit(c.env, {
    actorUserId: userId,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'password_reset_completed',
    entityType: 'user',
    entityId: userId,
  })
  return c.json({ ok: true, user: su })
})

// ---------- login with password and throttling ----------
authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>()
    .catch(() => ({ email: '', password: '' }))
  const e = norm(email)
  if (!e || !password) return c.json({ error: 'email and password required' }, 400)
  const ip = c.req.header('CF-Connecting-IP') || 'unknown'

  if (await isLockedOut(c.env, e, ip)) {
    return c.json({ error: 'too many attempts. Try again in 15 minutes.' }, 429)
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
    await logAudit(c.env, {
      actorUserId: user?.id ?? null,
      actorIp: ip,
      actorUserAgent: actorUserAgent(c.req.raw),
      actorGeo: actorGeo(c.req.raw),
      action: 'login_failed',
      entityType: 'user',
      entityId: user?.id ?? null,
      after: { email: e },
    })
    return c.json({ error: 'invalid email or password' }, 401)
  }

  await clearFailures(c.env, e, ip)
  await c.env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(user.id).run()
  if (user.role === 'client') {
    await c.env.DB.prepare("UPDATE contact_inquiries SET client_user_id = COALESCE(client_user_id, ?), updated_at = datetime('now') WHERE lower(email) = lower(?) AND converted_at IS NULL AND archived_at IS NULL").bind(user.id, user.email).run()
    await advanceInquiryLifecycle(c.env, { userId: user.id, email: user.email, target: 'prospect' })
  }
  const su: SessionUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
  }
  const token = await createSession(c.env, su, c.req.raw)
  c.header('Set-Cookie', sessionCookie(token))
  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: ip,
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'login',
  })
  return c.json({ ok: true, user: su })
})

authRoutes.post('/logout', async (c) => {
  const user = await getUser(c.env, c.req.raw)
  await destroySession(c.env, c.req.raw)
  c.header('Set-Cookie', clearCookie())
  if (user) await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'logout',
  })
  let federated_logout_url: string | null = null
  if (c.req.query('federated') === '1') {
    federated_logout_url = await defaultAuth0Bridge.federatedLogoutUrl(c.env, c.req.raw).catch(() => null)
  }
  return c.json({ ok: true, federated_logout_url })
})
