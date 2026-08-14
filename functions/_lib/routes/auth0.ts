import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { createAuth0Client } from '../auth0Client'
import {
  AUTH0_PROVIDERS,
  auth0ErrorRedirect,
  isAllowedAuth0Connection,
  publicAuth0Status,
  resolveAuth0Config,
  sanitizeAuth0ReturnTo,
  type Auth0ConnectionId,
} from '../auth0Config'
import {
  buildAuth0Transaction,
  consumeAuth0Transaction,
  newAuth0Nonce,
  newAuth0State,
  saveAuth0Transaction,
} from '../auth0Transaction'
import {
  claimsToAuth0Identity,
  linkExternalIdentity,
  listIdentitiesForUser,
  resolveAuth0LoginUser,
  unlinkExternalIdentity,
  userHasPassword,
} from '../externalIdentities'
import { createSession, destroySession, getUser, sessionCookie, clearCookie } from '../session'
import { logAudit, actorIp, actorUserAgent, actorGeo } from '../auditLog'
import { requireUser } from '../mid'
import { advanceInquiryLifecycle } from '../lifecycle'

const AUTH0_LOGIN_MAX_PER_HOUR = 30

export const auth0Routes = new Hono<AppEnv>()

async function auth0LoginThrottled(env: AppEnv['Bindings'], ip: string): Promise<boolean> {
  const k = `auth0login:${ip}`
  const cur = parseInt((await env.SESSIONS.get(k)) || '0', 10)
  if (cur >= AUTH0_LOGIN_MAX_PER_HOUR) return true
  await env.SESSIONS.put(k, String(cur + 1), { expirationTtl: 3600 })
  return false
}

function portalFallback(cfgLogoutUrl: string): string {
  try {
    const u = new URL(cfgLogoutUrl)
    return `${u.origin}/portal`
  } catch {
    return '/portal'
  }
}

auth0Routes.get('/auth0/status', (c) => c.json(publicAuth0Status(c.env)))

auth0Routes.get('/auth0/login', async (c) => {
  const cfg = resolveAuth0Config(c.env)
  if (!cfg.enabled) {
    return c.json({ error: 'external sign-in is not configured' }, 503)
  }

  const connection = (c.req.query('connection') || '').trim()
  if (!isAllowedAuth0Connection(c.env, connection)) {
    return c.json({ error: 'that sign-in method is not available' }, 400)
  }

  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  if (await auth0LoginThrottled(c.env, ip)) {
    return c.json({ error: 'too many sign-in attempts. Try again later.' }, 429)
  }

  const returnTo = sanitizeAuth0ReturnTo(c.req.query('returnTo'), '/portal')
  const mode = c.req.query('mode') === 'link' ? 'link' : 'login'
  let linkUserId: string | null = null
  if (mode === 'link') {
    const user = await getUser(c.env, c.req.raw)
    if (!user) return c.json({ error: 'sign in before connecting an account' }, 401)
    if (user.role !== 'client' && user.role !== 'trusted_contact') {
      return c.json({ error: 'external sign-in is available for client portal accounts' }, 403)
    }
    linkUserId = user.id
  }

  const bundled = createAuth0Client(c.env)
  if (!bundled) return c.json({ error: 'external sign-in is not configured' }, 503)

  const state = newAuth0State()
  const nonce = newAuth0Nonce()
  try {
    const { authorizationUrl, codeVerifier } = await bundled.client.buildAuthorizationUrl({
      authorizationParams: {
        connection,
        state,
        nonce,
        redirect_uri: cfg.callbackUrl,
        scope: 'openid profile email',
        ...(cfg.audience ? { audience: cfg.audience } : {}),
      },
    })

    await saveAuth0Transaction(
      c.env,
      state,
      buildAuth0Transaction({
        codeVerifier,
        nonce,
        returnTo,
        mode,
        connection: connection as Auth0ConnectionId,
        linkUserId,
      }),
    )

    return c.redirect(authorizationUrl.toString(), 302)
  } catch (err) {
    console.error('[auth0] login start failed', err instanceof Error ? err.message : 'error')
    return c.redirect(auth0ErrorRedirect(cfg.logoutUrl, 'start_failed'), 302)
  }
})

auth0Routes.get('/auth0/callback', async (c) => {
  const cfg = resolveAuth0Config(c.env)
  if (!cfg.enabled) {
    return c.redirect(auth0ErrorRedirect(cfg.logoutUrl || '/portal/login', 'not_configured'), 302)
  }

  const oauthError = c.req.query('error')
  if (oauthError) {
    return c.redirect(auth0ErrorRedirect(cfg.logoutUrl, 'provider_denied'), 302)
  }

  const state = c.req.query('state') || ''
  const tx = await consumeAuth0Transaction(c.env, state)
  if (!tx) {
    return c.redirect(auth0ErrorRedirect(cfg.logoutUrl, 'invalid_state'), 302)
  }

  const bundled = createAuth0Client(c.env)
  if (!bundled) {
    return c.redirect(auth0ErrorRedirect(cfg.logoutUrl, 'not_configured'), 302)
  }

  let claims: Record<string, unknown>
  try {
    const callbackUrl = new URL(c.req.url)
    // Normalize to the registered callback URL host/path while keeping query params.
    const tokenUrl = new URL(cfg.callbackUrl)
    tokenUrl.search = callbackUrl.search
    const tokenResponse = await bundled.client.getTokenByCode(tokenUrl, { codeVerifier: tx.codeVerifier })
    claims = (tokenResponse.claims || {}) as Record<string, unknown>
  } catch (err) {
    console.error('[auth0] callback token exchange failed', err instanceof Error ? err.message : 'error')
    return c.redirect(auth0ErrorRedirect(cfg.logoutUrl, 'token_invalid'), 302)
  }

  // Nonce + issuer validation beyond what the SDK already enforced on signature/exp/aud.
  if (typeof claims.nonce !== 'string' || claims.nonce !== tx.nonce) {
    return c.redirect(auth0ErrorRedirect(cfg.logoutUrl, 'nonce_invalid'), 302)
  }

  const identityOrErr = claimsToAuth0Identity(claims, tx.connection, cfg.issuer)
  if ('error' in identityOrErr) {
    return c.redirect(auth0ErrorRedirect(cfg.logoutUrl, 'claims_invalid'), 302)
  }
  const identity = identityOrErr

  // Never keep Auth0 tokens — identity claims only.
  // (tokenResponse goes out of scope; nothing stored)

  if (tx.mode === 'link') {
    const sessionUser = await getUser(c.env, c.req.raw)
    if (!sessionUser || sessionUser.id !== tx.linkUserId) {
      return c.redirect(auth0ErrorRedirect(cfg.logoutUrl, 'link_session'), 302)
    }
    const linked = await linkExternalIdentity(c.env, sessionUser.id, identity)
    if (!linked.ok) {
      const code = linked.status === 409 ? 'link_conflict' : 'link_failed'
      return c.redirect(auth0ErrorRedirect(cfg.logoutUrl.replace('/login', '/security'), code), 302)
    }
    await logAudit(c.env, {
      actorUserId: sessionUser.id,
      actorIp: actorIp(c.req.raw),
      actorUserAgent: actorUserAgent(c.req.raw),
      actorGeo: actorGeo(c.req.raw),
      action: 'auth0_identity_linked',
      entityType: 'external_identity',
      entityId: linked.identityId,
      after: { provider: identity.connection },
    })
    const dest = new URL(cfg.logoutUrl)
    dest.pathname = dest.pathname.replace(/\/login\/?$/, '/security')
    if (!dest.pathname.includes('security')) dest.pathname = '/portal/security'
    dest.searchParams.set('auth0_linked', identity.connection)
    return c.redirect(dest.toString(), 302)
  }

  const resolved = await resolveAuth0LoginUser(c.env, identity)
  if (resolved.kind === 'unverified_email') {
    return c.redirect(auth0ErrorRedirect(cfg.logoutUrl, 'email_unverified'), 302)
  }
  if (resolved.kind === 'needs_link') {
    return c.redirect(auth0ErrorRedirect(cfg.logoutUrl, 'account_exists'), 302)
  }
  if (resolved.kind === 'disabled') {
    return c.redirect(auth0ErrorRedirect(cfg.logoutUrl, 'account_unavailable'), 302)
  }
  if (resolved.kind === 'error') {
    return c.redirect(auth0ErrorRedirect(cfg.logoutUrl, 'signin_failed'), 302)
  }

  // Session fixation: always mint a fresh Pinnacle session (new opaque token).
  await destroySession(c.env, c.req.raw)
  const token = await createSession(c.env, resolved.user, c.req.raw)
  c.header('Set-Cookie', sessionCookie(token))

  await c.env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(resolved.user.id).run()
  if (resolved.user.role === 'client') {
    await c.env.DB.prepare(
      "UPDATE contact_inquiries SET client_user_id = COALESCE(client_user_id, ?), updated_at = datetime('now') WHERE lower(email) = lower(?) AND converted_at IS NULL AND archived_at IS NULL",
    ).bind(resolved.user.id, resolved.user.email).run()
    await advanceInquiryLifecycle(c.env, { userId: resolved.user.id, email: resolved.user.email, target: 'prospect' })
  }

  await logAudit(c.env, {
    actorUserId: resolved.user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'login',
    after: { method: 'auth0', provider: identity.connection, created: resolved.created },
  })

  const returnPath = sanitizeAuth0ReturnTo(tx.returnTo, '/portal')
  try {
    const dest = new URL(cfg.logoutUrl)
    // Prefer absolute same-origin redirect using logout URL origin (www or secure).
    if (returnPath.startsWith('/')) {
      dest.pathname = returnPath.split('?')[0]
      dest.search = returnPath.includes('?') ? `?${returnPath.split('?')[1]}` : ''
      dest.hash = ''
      return c.redirect(dest.toString(), 302)
    }
  } catch { /* fall through */ }
  return c.redirect(portalFallback(cfg.logoutUrl), 302)
})

auth0Routes.post('/auth0/link', requireUser, async (c) => {
  const cfg = resolveAuth0Config(c.env)
  if (!cfg.enabled) return c.json({ error: 'external sign-in is not configured' }, 503)

  const user = c.get('user')
  if (user.role !== 'client' && user.role !== 'trusted_contact') {
    return c.json({ error: 'external sign-in is available for client portal accounts' }, 403)
  }

  const body = await c.req.json<{ connection?: string; returnTo?: string }>().catch(() => ({} as { connection?: string }))
  const connection = (body.connection || '').trim()
  if (!isAllowedAuth0Connection(c.env, connection)) {
    return c.json({ error: 'that sign-in method is not available' }, 400)
  }

  const returnTo = sanitizeAuth0ReturnTo(body.returnTo, '/portal/security')
  const loginUrl = new URL(c.req.url)
  loginUrl.pathname = loginUrl.pathname.replace(/\/auth0\/link$/, '/auth0/login')
  loginUrl.search = ''
  loginUrl.searchParams.set('connection', connection)
  loginUrl.searchParams.set('mode', 'link')
  loginUrl.searchParams.set('returnTo', returnTo)
  return c.json({ ok: true, redirect_to: `${loginUrl.pathname}${loginUrl.search}` })
})

auth0Routes.post('/auth0/unlink', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role !== 'client' && user.role !== 'trusted_contact') {
    return c.json({ error: 'external sign-in is available for client portal accounts' }, 403)
  }
  const body = await c.req.json<{ identity_id?: string }>().catch(() => ({} as { identity_id?: string }))
  const identityId = typeof body.identity_id === 'string' ? body.identity_id.trim() : ''
  if (!identityId) return c.json({ error: 'identity_id is required' }, 400)

  const result = await unlinkExternalIdentity(c.env, user.id, identityId)
  if (!result.ok) return c.json({ error: result.error }, result.status)

  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'auth0_identity_unlinked',
    entityType: 'external_identity',
    entityId: identityId,
  })
  return c.json({ ok: true })
})

auth0Routes.get('/identities', requireUser, async (c) => {
  const user = c.get('user')
  const [identities, hasPassword, status] = await Promise.all([
    listIdentitiesForUser(c.env, user.id),
    userHasPassword(c.env, user.id),
    Promise.resolve(publicAuth0Status(c.env)),
  ])
  return c.json({
    ok: true,
    password: hasPassword,
    auth0: status,
    identities: identities.map((row) => ({
      id: row.id,
      provider: row.provider,
      connection_name: row.connection_name,
      provider_email: row.provider_email,
      email_verified: Boolean(row.email_verified),
      created_at: row.created_at,
      last_login_at: row.last_login_at,
      label: AUTH0_PROVIDERS[row.provider as Auth0ConnectionId]?.label || row.provider,
    })),
  })
})
