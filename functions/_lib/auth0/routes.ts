import { Hono } from 'hono'
import type { AppEnv, SessionUser } from '../types'
import { createSession, destroySession, getUser, sessionCookie } from '../session'
import { logAudit, actorIp, actorUserAgent, actorGeo } from '../auditLog'
import { advanceInquiryLifecycle } from '../lifecycle'
import { requireUser } from '../mid'
import { readAuth0Config, isKnownConnection, publicAuth0Providers, isAllowedAuth0CsrfOrigin } from './config'
import { d1Auth0Db } from './db'
import { appendCookies, getAuth0Flow, type Auth0AppState } from './flow'
import { canUnlinkIdentity, resolveAuth0Identity } from './identity'
import { callbackErrorPath, defaultReturnTo, isDedicatedAppHost, loginPathFor, sanitizeReturnTo, type Auth0Surface } from './returnTo'

export const auth0Routes = new Hono<AppEnv>()

const GENERIC_SIGNIN = 'We could not complete that sign-in. Try again or use your email and password.'
const AUTH0_LOGIN_MAX = 10
const AUTH0_LOGIN_WINDOW = 15 * 60

function surfaceOf(value: string | null | undefined): Auth0Surface {
  return value === 'staff' ? 'staff' : 'client'
}

function allowedOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin')
  if (!origin) return true
  return isAllowedAuth0CsrfOrigin(origin, request.url)
}

async function rateLimited(env: AppEnv['Bindings'], key: string, max: number, ttl: number): Promise<boolean> {
  const cur = parseInt((await env.SESSIONS.get(key)) || '0', 10)
  if (cur >= max) return true
  await env.SESSIONS.put(key, String(cur + 1), { expirationTtl: ttl })
  return false
}

function redirectWithCookies(location: string, cookies: string[], extra?: string) {
  const headers = new Headers({ Location: location })
  if (extra) headers.append('Set-Cookie', extra)
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)
  return new Response(null, { status: 302, headers })
}

function toSessionUser(user: { id: string; email: string; role: SessionUser['role']; full_name: string | null; first_name: string | null; last_name: string | null }): SessionUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    first_name: user.first_name,
    last_name: user.last_name,
  }
}

auth0Routes.get('/auth0/providers', (c) => {
  return c.json(publicAuth0Providers(readAuth0Config(c.env)))
})

auth0Routes.get('/auth0/login', async (c) => {
  const config = readAuth0Config(c.env)
  const host = new URL(c.req.url).hostname
  const surface = surfaceOf(c.req.query('surface'))
  const loginPath = loginPathFor(surface, host)
  if (!config.enabled) return c.redirect(callbackErrorPath(loginPath), 302)

  const connection = c.req.query('connection') || ''
  if (!isKnownConnection(connection) || !config.connections.includes(connection)) {
    return c.redirect(callbackErrorPath(loginPath), 302)
  }

  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  if (await rateLimited(c.env, `auth0login:${ip}`, AUTH0_LOGIN_MAX, AUTH0_LOGIN_WINDOW)) {
    return c.json({ error: 'too many attempts. Try again in 15 minutes.' }, 429)
  }

  const returnTo = sanitizeReturnTo(c.req.query('returnTo'), surface)
  const flow = getAuth0Flow(config, c.env)
  try {
    const started = await flow.startLogin({
      connection,
      purpose: 'login',
      surface,
      returnTo,
      loginPath,
      request: c.req.raw,
    })
    return redirectWithCookies(started.url.toString(), started.cookies)
  } catch (error) {
    console.error('[auth0] login start failed')
    return c.redirect(callbackErrorPath(loginPath), 302)
  }
})

auth0Routes.get('/auth0/callback', async (c) => {
  const config = readAuth0Config(c.env)
  const url = new URL(c.req.url)
  const host = url.hostname
  const fallbackLogin = loginPathFor('client', host)
  if (!config.enabled) return c.redirect(callbackErrorPath(fallbackLogin), 302)
  if (url.searchParams.get('error')) return c.redirect(callbackErrorPath(fallbackLogin), 302)

  const flow = getAuth0Flow(config, c.env)
  let completed: { claims: Awaited<ReturnType<typeof flow.completeLogin>>['claims']; appState: Auth0AppState; cookies: string[] }
  try {
    completed = await flow.completeLogin(url, c.req.raw)
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'invalid_state' || code === 'missing_transaction') {
      return c.redirect(callbackErrorPath(fallbackLogin), 302)
    }
    console.error('[auth0] callback validation failed')
    return c.redirect(callbackErrorPath(fallbackLogin), 302)
  }

  const { claims, appState, cookies } = completed
  const loginPath = appState.loginPath || fallbackLogin
  const db = d1Auth0Db(c.env)
  const result = await resolveAuth0Identity(db, claims, {
    purpose: appState.purpose,
    surface: appState.surface,
    linkingUserId: appState.linkingUserId,
  })

  if (!result.ok) {
    await logAudit(c.env, {
      actorIp: actorIp(c.req.raw),
      actorUserAgent: actorUserAgent(c.req.raw),
      actorGeo: actorGeo(c.req.raw),
      action: appState.purpose === 'link' ? 'identity_link_failed' : 'login_failed',
      entityType: 'external_identity',
      after: { provider: claims.connection, reason: result.code },
    })
    return redirectWithCookies(callbackErrorPath(loginPath), cookies)
  }

  const user = result.user
  if (appState.purpose === 'login' && user.role === 'client') {
    await c.env.DB.prepare(
      "UPDATE contact_inquiries SET client_user_id = COALESCE(client_user_id, ?), updated_at = datetime('now') WHERE lower(email) = lower(?) AND converted_at IS NULL AND archived_at IS NULL",
    ).bind(user.id, user.email).run().catch(() => undefined)
    await advanceInquiryLifecycle(c.env, { userId: user.id, email: user.email, target: 'prospect' }).catch(() => undefined)
  }

  await destroySession(c.env, c.req.raw)
  const sessionUser = toSessionUser(user)
  const token = await createSession(c.env, sessionUser, c.req.raw)
  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: appState.purpose === 'link' ? 'identity_linked' : 'login',
    entityType: 'external_identity',
    after: { provider: claims.connection, method: 'auth0', created: result.created },
  })

  const dedicated = isDedicatedAppHost(host)
  const destination = sanitizeReturnTo(appState.returnTo, appState.surface) || defaultReturnTo(appState.surface, dedicated)
  return redirectWithCookies(destination, cookies, sessionCookie(token))
})

auth0Routes.post('/auth0/link', requireUser, async (c) => {
  if (!allowedOrigin(c.req.raw)) return c.json({ error: 'forbidden' }, 403)
  const config = readAuth0Config(c.env)
  if (!config.enabled) return c.json({ error: 'this sign-in method is not available' }, 503)
  const user = c.get('user')
  if (user.impersonated_by_user_id) return c.json({ error: 'blocked during impersonation' }, 403)
  const body = await c.req.json<{ connection?: string }>().catch(() => ({} as { connection?: string }))
  const connection = body.connection || ''
  if (!isKnownConnection(connection) || !config.connections.includes(connection)) {
    return c.json({ error: 'that sign-in method is not available' }, 400)
  }
  const host = new URL(c.req.url).hostname
  const surface: Auth0Surface = user.role === 'staff' || user.role === 'admin' ? 'staff' : 'client'
  const flow = getAuth0Flow(config, c.env)
  try {
    const started = await flow.startLogin({
      connection,
      purpose: 'link',
      surface,
      returnTo: surface === 'client' ? (isDedicatedAppHost(host) ? '/security' : '/portal/security') : null,
      loginPath: loginPathFor(surface, host),
      linkingUserId: user.id,
      request: c.req.raw,
    })
    return appendCookies(c.json({ ok: true, url: started.url.toString() }), started.cookies)
  } catch {
    console.error('[auth0] link start failed')
    return c.json({ error: GENERIC_SIGNIN }, 400)
  }
})

auth0Routes.post('/auth0/unlink', requireUser, async (c) => {
  if (!allowedOrigin(c.req.raw)) return c.json({ error: 'forbidden' }, 403)
  const user = c.get('user')
  if (user.impersonated_by_user_id) return c.json({ error: 'blocked during impersonation' }, 403)
  const body = await c.req.json<{ identity_id?: string }>().catch(() => ({} as { identity_id?: string }))
  const identityId = String(body.identity_id || '')
  if (!identityId) return c.json({ error: 'identity_id is required' }, 400)

  const db = d1Auth0Db(c.env)
  const live = await db.findUserById(user.id)
  if (!live || live.status !== 'active') return c.json({ error: 'unauthorized' }, 401)
  const identities = await db.listIdentities(user.id)
  if (!canUnlinkIdentity(live, identities, identityId)) {
    return c.json({ error: 'keep at least one sign-in method on this account' }, 400)
  }
  const removed = await db.deleteIdentity(identityId, user.id)
  if (!removed) return c.json({ error: 'sign-in method not found' }, 404)
  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'identity_unlinked',
    entityType: 'external_identity',
    entityId: identityId,
  })
  return c.json({ ok: true })
})

auth0Routes.get('/identities', requireUser, async (c) => {
  const config = readAuth0Config(c.env)
  const user = c.get('user')
  const db = d1Auth0Db(c.env)
  const live = await db.findUserById(user.id)
  const identities = await db.listIdentities(user.id)
  return c.json({
    password: { enabled: !!live?.password_hash },
    identities: identities.map((row) => ({
      id: row.id,
      provider: row.provider,
      label: row.provider === 'google-oauth2' ? 'Google' : row.provider === 'windowslive' ? 'Microsoft' : row.provider,
      email: row.email,
      email_verified: !!row.email_verified,
      created_at: row.created_at,
      last_login_at: row.last_login_at,
      can_unlink: live ? canUnlinkIdentity(live, identities, row.id) : false,
    })),
    providers: publicAuth0Providers(config),
  })
})
