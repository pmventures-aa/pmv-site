import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { uuid, hashPassword } from '../crypto'
import {
  createSession,
  destroySession,
  getUser,
  sessionCookie,
} from '../session'
import { logAudit, actorGeo, actorIp, actorUserAgent } from '../auditLog'
import { logActivity } from '../activity'
import { sendEmail, escapeHtml } from '../email'
import { renderPinnacleEmailLayout } from '../emailTemplates/layout'
import { CLIENT_PORTAL_URL, sendAccountWelcome } from '../accountEmails'
import { advanceInquiryLifecycle } from '../lifecycle'
import { getInviteByToken } from '../invites'
import { toDisplayCase } from '../../../shared/displayCase'
import { MIN_PASSWORD } from './auth'
import {
  isAuth0Provider,
  publicAuth0Status,
  readAuth0Config,
  type Auth0ProviderId,
} from '../auth0Config'
import { loginPathForRequest, safeReturnTo, securityPathForRequest, signupPathForRequest } from '../auth0ReturnTo'
import {
  GENERIC_AUTH0_ERROR,
  applyAuth0Cookies,
  defaultAuth0Bridge,
  type Auth0AppState,
  type Auth0Bridge,
  type Auth0Intent,
  type VerifiedAuth0Identity,
} from '../auth0Client'
import {
  IdentityConflictError,
  assertLinkable,
  createClientFromAuth0,
  findIdentity,
  getPortalUser,
  getPortalUserByEmail,
  identitiesForUser,
  insertIdentity,
  isPortalAllowed,
  providerLabel,
  sessionFromUser,
  touchIdentityLogin,
  unlinkIdentity,
  type PortalUserRow,
} from '../auth0Identities'

const PENDING_COOKIE = 'pmv_auth0_pending'
const PENDING_TTL = 30 * 60
const LINK_TTL = 30 * 60
const LOGIN_MAX = 12

export const GENERIC_LINK_ERROR = 'This sign-in method could not be connected to your account.'

function pendingCookie(token: string): string {
  return `${PENDING_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${PENDING_TTL}`
}

function clearPendingCookie(): string {
  return `${PENDING_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}

function cookieValue(request: Request, name: string): string | null {
  const match = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|; )${name}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

async function throttled(env: Env, ip: string): Promise<boolean> {
  const key = `auth0login:${ip}`
  const cur = parseInt((await env.SESSIONS.get(key)) || '0', 10)
  if (cur >= LOGIN_MAX) return true
  await env.SESSIONS.put(key, String(cur + 1), { expirationTtl: 15 * 60 })
  return false
}

function failLoginRedirect(request: Request, code: 'error' | 'sent' = 'error') {
  const url = new URL(loginPathForRequest(request), request.url)
  url.searchParams.set('auth0', code)
  return url.pathname + url.search
}

async function afterPortalLogin(env: Env, user: PortalUserRow, request: Request) {
  await env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(user.id).run()
  if (user.role === 'client') {
    await env.DB.prepare("UPDATE contact_inquiries SET client_user_id = COALESCE(client_user_id, ?), updated_at = datetime('now') WHERE lower(email) = lower(?) AND converted_at IS NULL AND archived_at IS NULL").bind(user.id, user.email).run().catch(() => undefined)
    await advanceInquiryLifecycle(env, { userId: user.id, email: user.email, target: 'prospect' }).catch(() => undefined)
  }
  await logAudit(env, {
    actorUserId: user.id,
    actorIp: actorIp(request),
    actorUserAgent: actorUserAgent(request),
    actorGeo: actorGeo(request),
    action: 'login',
    entityType: 'user',
    entityId: user.id,
    after: { method: 'auth0' },
  })
}

async function rotateSession(env: Env, user: PortalUserRow, request: Request): Promise<string> {
  await destroySession(env, request)
  return createSession(env, sessionFromUser(user), request)
}

function appendCookie(c: { header: (name: string, value: string, options?: { append: boolean }) => void }, value: string) {
  c.header('Set-Cookie', value, { append: true })
}

async function sendLinkVerification(env: Env, request: Request, user: PortalUserRow, identity: VerifiedAuth0Identity) {
  const token = uuid().replace(/-/g, '') + uuid().replace(/-/g, '')
  await env.SESSIONS.put(`auth0link:${token}`, JSON.stringify({
    userId: user.id,
    issuer: identity.issuer,
    subject: identity.subject,
    provider: identity.provider,
    email: identity.email,
  }), { expirationTtl: LINK_TTL })
  const confirm = new URL('/api/auth/auth0/confirm-link', `https://www.pinnaclemanagementventures.com`)
  confirm.searchParams.set('token', token)
  const origin = new URL(request.url)
  if (origin.hostname === 'localhost' || origin.hostname === '127.0.0.1') {
    confirm.protocol = origin.protocol
    confirm.host = origin.host
  }
  const firstName = user.first_name || String(user.full_name || '').split(/\s+/)[0] || 'there'
  const html = renderPinnacleEmailLayout({
    preheader: 'Connect a sign-in method to your Pinnacle account',
    eyebrow: 'Pinnacle account security',
    title: 'Connect a sign-in method',
    bodyHtml: `<p>Hi ${escapeHtml(firstName)},</p><p>Someone requested to connect ${escapeHtml(providerLabel(identity.provider))} sign-in to your Pinnacle account. This link expires in 30 minutes and can be used only once.</p><p style="margin:24px 0"><a href="${confirm.href}" style="display:inline-block;background:#c9a227;color:#06111f;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px">Connect this sign-in method</a></p><p>If you did not request this, you can ignore this email. Your current sign-in methods will remain unchanged.</p>`,
  })
  await sendEmail(env, {
    to: user.email,
    subject: 'Connect a sign-in method to your Pinnacle account',
    html,
    replyTo: 'support@pinnaclemanagementventures.com',
    tags: [{ name: 'category', value: 'account_security' }],
  })
  await logAudit(env, {
    actorUserId: user.id,
    actorIp: actorIp(request),
    actorUserAgent: actorUserAgent(request),
    actorGeo: actorGeo(request),
    action: 'identity_link_requested',
    entityType: 'user',
    entityId: user.id,
    after: { provider: identity.provider },
  })
}

async function acceptMatchingInvite(env: Env, identity: VerifiedAuth0Identity, inviteToken: string | undefined): Promise<PortalUserRow | null> {
  if (!inviteToken || !identity.emailVerified) return null
  const invite = await getInviteByToken(env, inviteToken)
  if (!invite || invite.status !== 'pending') return null
  if (invite.email !== identity.email) return null
  if (invite.invite_type !== 'client' && invite.invite_type !== 'trusted_contact') return null

  const existing = await getPortalUserByEmail(env, identity.email)
  if (existing) {
    if (!isPortalAllowed(existing)) return null
    if (invite.invite_type === 'client' && existing.role !== 'client') return null
    if (invite.invite_type === 'trusted_contact' && existing.role !== 'trusted_contact') return null
    await insertIdentity(env, existing.id, identity)
    await env.DB.prepare(
      "UPDATE access_invites SET status='accepted', accepted_by_user_id=?, accepted_at=datetime('now'), updated_at=datetime('now') WHERE id=?",
    ).bind(existing.id, invite.id).run()
    if (invite.invite_type === 'trusted_contact' && invite.client_user_id) {
      await env.DB.prepare(
        `UPDATE trusted_contacts SET contact_user_id = ?, status = 'active', accepted_at = datetime('now'), updated_at = datetime('now') WHERE invite_id = ? AND client_user_id = ?`,
      ).bind(existing.id, invite.id, invite.client_user_id).run()
    }
    return existing
  }

  if (invite.invite_type === 'trusted_contact') {
    if (!invite.client_user_id) return null
    const parts = (invite.full_name || `${identity.givenName} ${identity.familyName}`).trim().split(/\s+/).filter(Boolean)
    const fullName = toDisplayCase(invite.full_name || `${identity.givenName} ${identity.familyName}`.trim() || identity.email)
    const userId = uuid()
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users(id,email,password_hash,role,full_name,first_name,last_name,two_factor_enabled,status)
         VALUES(?,?,NULL,'trusted_contact',?,?,?,0,'active')`,
      ).bind(userId, identity.email, fullName, parts[0] || null, parts.slice(1).join(' ') || null),
      env.DB.prepare(
        `UPDATE trusted_contacts SET contact_user_id = ?, full_name = ?, status = 'active', accepted_at = datetime('now'), updated_at = datetime('now') WHERE invite_id = ? AND client_user_id = ?`,
      ).bind(userId, fullName, invite.id, invite.client_user_id),
      env.DB.prepare(
        "UPDATE access_invites SET status='accepted', accepted_by_user_id=?, accepted_at=datetime('now'), updated_at=datetime('now') WHERE id=?",
      ).bind(userId, invite.id),
    ])
    await insertIdentity(env, userId, identity)
    return getPortalUser(env, userId)
  }

  const firstName = toDisplayCase(identity.givenName || invite.full_name?.split(/\s+/)[0] || 'Client')
  const lastName = toDisplayCase(identity.familyName || invite.full_name?.split(/\s+/).slice(1).join(' ') || 'User')
  const created = await createClientFromAuth0(env, identity, { firstName, lastName, phone: 'not provided', businessName: null })
  await env.DB.prepare(
    "UPDATE access_invites SET status='accepted', accepted_by_user_id=?, accepted_at=datetime('now'), updated_at=datetime('now') WHERE id=?",
  ).bind(created.id, invite.id).run()
  return created
}

export function createAuth0Routes(bridge: Auth0Bridge = defaultAuth0Bridge) {
  const routes = new Hono<AppEnv>()

  routes.get('/auth0/status', (c) => c.json(publicAuth0Status(c.env)))

  routes.get('/auth0/login', async (c) => {
    const config = readAuth0Config(c.env)
    const ip = c.req.header('CF-Connecting-IP') || 'unknown'
    if (!config.enabled) return c.redirect(failLoginRedirect(c.req.raw))
    if (await throttled(c.env, ip)) return c.redirect(failLoginRedirect(c.req.raw))

    const connectionRaw = (c.req.query('connection') || '').trim()
    if (!isAuth0Provider(connectionRaw) || !config.connections.includes(connectionRaw)) {
      return c.redirect(failLoginRedirect(c.req.raw))
    }
    const intentRaw = (c.req.query('intent') || 'login').trim()
    const intent: Auth0Intent = intentRaw === 'link' || intentRaw === 'signup' ? intentRaw : 'login'
    const appState: Auth0AppState = {
      intent,
      connection: connectionRaw,
      returnTo: safeReturnTo(c.req.query('returnTo'), c.req.raw),
      inviteToken: c.req.query('invite') || undefined,
    }
    try {
      const started = await bridge.startLogin(c.env, c.req.raw, { connection: connectionRaw, appState })
      applyAuth0Cookies(c.res.headers, started.cookies)
      return c.redirect(started.url)
    } catch {
      return c.redirect(failLoginRedirect(c.req.raw))
    }
  })

  routes.get('/auth0/callback', async (c) => {
    const config = readAuth0Config(c.env)
    if (!config.enabled) return c.redirect(failLoginRedirect(c.req.raw))
    const url = new URL(c.req.raw.url)
    if (url.searchParams.get('error')) return c.redirect(failLoginRedirect(c.req.raw))
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state) return c.redirect(failLoginRedirect(c.req.raw))
    const usedKey = `auth0used:${code}`
    if (await c.env.SESSIONS.get(usedKey)) return c.redirect(failLoginRedirect(c.req.raw))
    await c.env.SESSIONS.put(usedKey, '1', { expirationTtl: 15 * 60 })
    try {
      const completed = await bridge.completeLogin(c.env, c.req.raw)
      applyAuth0Cookies(c.res.headers, completed.cookies)
      const { identity, appState } = completed
      const returnTo = safeReturnTo(appState.returnTo, c.req.raw)

      if (appState.intent === 'link') {
        const sessionUser = await getUser(c.env, c.req.raw)
        if (!sessionUser || sessionUser.id !== appState.userId) return c.redirect(failLoginRedirect(c.req.raw))
        const user = await getPortalUser(c.env, sessionUser.id)
        if (!user) return c.redirect(failLoginRedirect(c.req.raw))
        await assertLinkable(c.env, user, identity)
        await insertIdentity(c.env, user.id, identity)
        await logAudit(c.env, {
          actorUserId: user.id,
          actorIp: actorIp(c.req.raw),
          actorUserAgent: actorUserAgent(c.req.raw),
          actorGeo: actorGeo(c.req.raw),
          action: 'identity_linked',
          entityType: 'external_identity',
          entityId: user.id,
          after: { provider: identity.provider },
        })
        await logActivity(c.env, { actorUserId: user.id, kind: 'identity_linked', detail: { provider: identity.provider } })
        return c.redirect(securityPathForRequest(c.req.raw))
      }

      const linked = await findIdentity(c.env, identity.issuer, identity.subject)
      if (linked) {
        const user = await getPortalUser(c.env, linked.user_id)
        if (!user || !isPortalAllowed(user)) return c.redirect(failLoginRedirect(c.req.raw))
        if (!identity.emailVerified) return c.redirect(failLoginRedirect(c.req.raw))
        await touchIdentityLogin(c.env, linked.id, user.id)
        await afterPortalLogin(c.env, user, c.req.raw)
        const token = await rotateSession(c.env, user, c.req.raw)
        appendCookie(c, sessionCookie(token))
        return c.redirect(returnTo)
      }

      const invited = await acceptMatchingInvite(c.env, identity, appState.inviteToken)
      if (invited && isPortalAllowed(invited)) {
        await afterPortalLogin(c.env, invited, c.req.raw)
        const token = await rotateSession(c.env, invited, c.req.raw)
        appendCookie(c, sessionCookie(token))
        return c.redirect(returnTo)
      }

      const existing = await getPortalUserByEmail(c.env, identity.email)
      if (existing) {
        if (existing.status === 'active' && PORTAL_EMAIL_ROLES.includes(existing.role) && identity.emailVerified) {
          await sendLinkVerification(c.env, c.req.raw, existing, identity)
        }
        return c.redirect(failLoginRedirect(c.req.raw, 'sent'))
      }

      const pendingToken = uuid()
      await c.env.SESSIONS.put(`auth0pending:${pendingToken}`, JSON.stringify({
        issuer: identity.issuer,
        subject: identity.subject,
        provider: identity.provider,
        email: identity.email,
        emailVerified: identity.emailVerified,
        givenName: identity.givenName,
        familyName: identity.familyName,
      }), { expirationTtl: PENDING_TTL })
      appendCookie(c, pendingCookie(pendingToken))
      const signup = new URL(signupPathForRequest(c.req.raw), c.req.raw.url)
      signup.searchParams.set('auth0', 'pending')
      return c.redirect(signup.pathname + signup.search)
    } catch (error) {
      if (error instanceof IdentityConflictError) return c.redirect(failLoginRedirect(c.req.raw))
      return c.redirect(failLoginRedirect(c.req.raw))
    }
  })

  routes.get('/auth0/pending', async (c) => {
    const token = cookieValue(c.req.raw, PENDING_COOKIE)
    if (!token) return c.json({ pending: false })
    const raw = await c.env.SESSIONS.get(`auth0pending:${token}`)
    if (!raw) return c.json({ pending: false })
    try {
      const pending = JSON.parse(raw) as { email?: string; givenName?: string; familyName?: string; emailVerified?: boolean }
      if (!pending.emailVerified) return c.json({ pending: false })
      return c.json({ pending: true, email: pending.email, first_name: pending.givenName || '', last_name: pending.familyName || '' })
    } catch {
      return c.json({ pending: false })
    }
  })

  routes.post('/auth0/register', async (c) => {
    const token = cookieValue(c.req.raw, PENDING_COOKIE)
    if (!token) return c.json({ error: GENERIC_AUTH0_ERROR }, 400)
    const raw = await c.env.SESSIONS.get(`auth0pending:${token}`)
    if (!raw) return c.json({ error: GENERIC_AUTH0_ERROR }, 400)
    const body = await c.req.json<{
      first_name?: string
      last_name?: string
      phone?: string
      business_name?: string
      tos_accepted?: boolean
    }>().catch(() => ({} as Record<string, never>))
    if (body.tos_accepted !== true) return c.json({ error: 'you must accept the Terms of Service to create an account' }, 400)
    const firstName = toDisplayCase(body.first_name)
    const lastName = toDisplayCase(body.last_name)
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : ''
    if (!firstName || !lastName) return c.json({ error: 'first and last name are required' }, 400)
    if (!phone) return c.json({ error: 'a phone number is required' }, 400)

    let pending: VerifiedAuth0Identity
    try {
      const parsed = JSON.parse(raw) as {
        issuer: string
        subject: string
        provider: Auth0ProviderId
        email: string
        emailVerified: boolean
        givenName?: string
        familyName?: string
      }
      if (!parsed.emailVerified) return c.json({ error: GENERIC_AUTH0_ERROR }, 400)
      pending = {
        issuer: parsed.issuer,
        subject: parsed.subject,
        provider: parsed.provider,
        email: parsed.email,
        emailVerified: true,
        givenName: parsed.givenName || firstName,
        familyName: parsed.familyName || lastName,
        claims: { iss: parsed.issuer, sub: parsed.subject, email_verified: true },
      }
    } catch {
      return c.json({ error: GENERIC_AUTH0_ERROR }, 400)
    }

    try {
      const user = await createClientFromAuth0(c.env, pending, {
        firstName,
        lastName,
        phone,
        businessName: typeof body.business_name === 'string' ? body.business_name : null,
      })
      await c.env.SESSIONS.delete(`auth0pending:${token}`)
      await afterPortalLogin(c.env, user, c.req.raw)
      const session = await rotateSession(c.env, user, c.req.raw)
      appendCookie(c, sessionCookie(session))
      appendCookie(c, clearPendingCookie())
      const welcome = sendAccountWelcome(c.env, {
        userId: user.id,
        role: 'client',
        email: user.email,
        firstName,
        businessName: typeof body.business_name === 'string' ? body.business_name : null,
        creationType: 'self_signup',
        actionLabel: 'Open My Client Portal',
        actionUrl: CLIENT_PORTAL_URL,
      }).catch((err) => console.error('[account-email] auth0 signup welcome failed', err))
      try { c.executionCtx.waitUntil(welcome) } catch { void welcome }
      return c.json({ ok: true, user: sessionFromUser(user) }, 201)
    } catch (error) {
      if (error instanceof IdentityConflictError) return c.json({ error: GENERIC_AUTH0_ERROR }, 409)
      throw error
    }
  })

  routes.get('/auth0/confirm-link', async (c) => {
    const token = (c.req.query('token') || '').trim()
    if (!token) return c.redirect(failLoginRedirect(c.req.raw))
    const raw = await c.env.SESSIONS.get(`auth0link:${token}`)
    await c.env.SESSIONS.delete(`auth0link:${token}`)
    if (!raw) return c.redirect(failLoginRedirect(c.req.raw))
    try {
      const payload = JSON.parse(raw) as { userId: string; issuer: string; subject: string; provider: Auth0ProviderId; email: string }
      const user = await getPortalUser(c.env, payload.userId)
      if (!user || !isPortalAllowed(user) || user.email !== payload.email) return c.redirect(failLoginRedirect(c.req.raw))
      const identity: VerifiedAuth0Identity = {
        issuer: payload.issuer,
        subject: payload.subject,
        provider: payload.provider,
        email: payload.email,
        emailVerified: true,
        givenName: user.first_name || '',
        familyName: user.last_name || '',
        claims: { iss: payload.issuer, sub: payload.subject, email_verified: true },
      }
      await insertIdentity(c.env, user.id, identity)
      await logAudit(c.env, {
        actorUserId: user.id,
        actorIp: actorIp(c.req.raw),
        actorUserAgent: actorUserAgent(c.req.raw),
        actorGeo: actorGeo(c.req.raw),
        action: 'identity_linked',
        entityType: 'external_identity',
        entityId: user.id,
        after: { provider: payload.provider, method: 'email_confirmation' },
      })
      const session = await rotateSession(c.env, user, c.req.raw)
      appendCookie(c, sessionCookie(session))
      return c.redirect(safeReturnTo(undefined, c.req.raw))
    } catch {
      return c.redirect(failLoginRedirect(c.req.raw))
    }
  })

  routes.post('/auth0/link', async (c) => {
    const sessionUser = await getUser(c.env, c.req.raw)
    if (!sessionUser) return c.json({ error: 'unauthorized' }, 401)
    const user = await getPortalUser(c.env, sessionUser.id)
    if (!user || !isPortalAllowed(user)) return c.json({ error: 'forbidden' }, 403)
    const config = readAuth0Config(c.env)
    if (!config.enabled) return c.json({ error: 'this sign-in method is not available' }, 503)
    const body = await c.req.json<{ connection?: string; returnTo?: string }>().catch(() => ({} as { connection?: string; returnTo?: string }))
    const connection = (body.connection || '').trim()
    if (!isAuth0Provider(connection) || !config.connections.includes(connection)) {
      return c.json({ error: 'this sign-in method is not available' }, 400)
    }
    const ip = c.req.header('CF-Connecting-IP') || 'unknown'
    if (await throttled(c.env, ip)) return c.json({ error: 'too many attempts. Try again later.' }, 429)
    const appState: Auth0AppState = {
      intent: 'link',
      connection,
      userId: user.id,
      returnTo: safeReturnTo(body.returnTo || securityPathForRequest(c.req.raw), c.req.raw),
    }
    try {
      const started = await bridge.startLogin(c.env, c.req.raw, { connection, appState, prompt: 'login' })
      applyAuth0Cookies(c.res.headers, started.cookies)
      return c.json({ ok: true, authorization_url: started.url })
    } catch {
      return c.json({ error: GENERIC_LINK_ERROR }, 400)
    }
  })

  routes.post('/auth0/unlink', async (c) => {
    const sessionUser = await getUser(c.env, c.req.raw)
    if (!sessionUser) return c.json({ error: 'unauthorized' }, 401)
    const user = await getPortalUser(c.env, sessionUser.id)
    if (!user || !isPortalAllowed(user)) return c.json({ error: 'forbidden' }, 403)
    const body = await c.req.json<{ identity_id?: string }>().catch(() => ({} as { identity_id?: string }))
    const identityId = (body.identity_id || '').trim()
    if (!identityId) return c.json({ error: 'identity_id is required' }, 400)
    try {
      const removed = await unlinkIdentity(c.env, user, identityId)
      await logAudit(c.env, {
        actorUserId: user.id,
        actorIp: actorIp(c.req.raw),
        actorUserAgent: actorUserAgent(c.req.raw),
        actorGeo: actorGeo(c.req.raw),
        action: 'identity_unlinked',
        entityType: 'external_identity',
        entityId: removed.id,
        after: { provider: removed.provider },
      })
      await logActivity(c.env, { actorUserId: user.id, kind: 'identity_unlinked', detail: { provider: removed.provider } })
      return c.json({ ok: true })
    } catch (error) {
      if (error instanceof IdentityConflictError && error.code === 'last_method') {
        return c.json({ error: 'Keep at least one sign-in method on this account.' }, 400)
      }
      if (error instanceof IdentityConflictError) return c.json({ error: GENERIC_LINK_ERROR }, 400)
      throw error
    }
  })

  routes.get('/identities', async (c) => {
    const sessionUser = await getUser(c.env, c.req.raw)
    if (!sessionUser) return c.json({ error: 'unauthorized' }, 401)
    const user = await getPortalUser(c.env, sessionUser.id)
    if (!user || !isPortalAllowed(user)) return c.json({ error: 'forbidden' }, 403)
    const status = publicAuth0Status(c.env)
    const linked = await identitiesForUser(c.env, user.id)
    const methods = (user.password_hash ? 1 : 0) + linked.length
    return c.json({
      enabled: status.enabled,
      has_password: !!user.password_hash,
      connections: status.connections.map((connection) => {
        const identity = linked.find((row) => row.provider === connection.id)
        return {
          id: connection.id,
          label: connection.label,
          linked: !!identity,
          identity_id: identity?.id || null,
          email: identity?.provider_email || null,
          can_unlink: !!identity && methods > 1,
        }
      }),
    })
  })

  routes.post('/password', async (c) => {
    const sessionUser = await getUser(c.env, c.req.raw)
    if (!sessionUser) return c.json({ error: 'unauthorized' }, 401)
    const user = await getPortalUser(c.env, sessionUser.id)
    if (!user || !isPortalAllowed(user)) return c.json({ error: 'forbidden' }, 403)
    if (user.password_hash) return c.json({ error: 'this account already has a password' }, 409)
    const body = await c.req.json<{ password?: string }>().catch(() => ({} as { password?: string }))
    const password = String(body.password || '')
    if (password.length < MIN_PASSWORD) return c.json({ error: `password must be at least ${MIN_PASSWORD} characters` }, 400)
    const hash = await hashPassword(password, c.env.SESSION_SECRET)
    await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, user.id).run()
    await logAudit(c.env, {
      actorUserId: user.id,
      actorIp: actorIp(c.req.raw),
      actorUserAgent: actorUserAgent(c.req.raw),
      actorGeo: actorGeo(c.req.raw),
      action: 'password_created',
      entityType: 'user',
      entityId: user.id,
    })
    return c.json({ ok: true })
  })

  return routes
}

const PORTAL_EMAIL_ROLES: PortalUserRow['role'][] = ['client', 'trusted_contact']

export const auth0Routes = createAuth0Routes()
