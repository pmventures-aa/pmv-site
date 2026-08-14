import { Hono } from 'hono'
import type { Context } from 'hono'
import type { UserClaims } from '@auth0/auth0-server-js'
import type { AppEnv, SessionUser } from '../types'
import { requireUser } from '../mid'
import {
  createSession,
  sessionCookie,
  destroySession,
  getUser,
} from '../session'
import { logAudit, actorIp, actorUserAgent, actorGeo } from '../auditLog'
import { advanceInquiryLifecycle } from '../lifecycle'
import { getAuth0Config, providerById, auth0ConfigIssues, type Auth0ProviderId } from '../auth0/config'
import {
  auth0ClientForEnv,
  createAuth0StoreOptions,
  applyAuth0Cookies,
} from '../auth0/client'
import { sanitizeReturnTo, loginErrorRedirect } from '../auth0/returnTo'
import {
  findIdentityByIssuerSubject,
  insertExternalIdentity,
  touchIdentityLogin,
  listIdentitiesForUser,
  deleteExternalIdentity,
  loadPortalEligibleUser,
  canUseClientPortalAuth,
  countUsableAuthMethods,
  userHasPassword,
} from '../auth0/identities'

export const auth0Routes = new Hono<AppEnv>()

const AUTH0_LOGIN_MAX_PER_HOUR = 30

type Auth0AppState = {
  purpose: 'login' | 'link'
  returnTo: string
  providerId: Auth0ProviderId
  connection: string
  linkUserId?: string
  nonce: string
}

function publicProviders(env: AppEnv['Bindings']) {
  const config = getAuth0Config(env)
  const issues = auth0ConfigIssues(env)
  return {
    enabled: config.configured && config.providers.length > 0 && issues.length === 0,
    providers: config.providers.map((p) => ({ id: p.id, label: p.label })),
    configured: config.configured,
  }
}

async function auth0Throttled(env: AppEnv['Bindings'], ip: string): Promise<boolean> {
  const k = `auth0-login:${ip}`
  const cur = parseInt((await env.SESSIONS.get(k)) || '0', 10)
  if (cur >= AUTH0_LOGIN_MAX_PER_HOUR) return true
  await env.SESSIONS.put(k, String(cur + 1), { expirationTtl: 3600 })
  return false
}

function extractIdentity(claims: UserClaims, fallbackIssuer: string): {
  issuer: string
  subject: string
  email: string | null
  emailVerified: boolean
} | null {
  const subject = typeof claims.sub === 'string' ? claims.sub.trim() : ''
  if (!subject) return null
  const issuerRaw = typeof (claims as { iss?: unknown }).iss === 'string'
    ? String((claims as { iss?: string }).iss).trim()
    : fallbackIssuer
  const issuer = issuerRaw.endsWith('/') ? issuerRaw : `${issuerRaw}/`
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : null
  const emailVerified = claims.email_verified === true
  return { issuer, subject, email, emailVerified }
}

async function establishPinnacleSession(
  c: Context<AppEnv>,
  user: SessionUser,
  meta: { provider: string; connection: string; identityId: string },
): Promise<string> {
  // Rotate: invalidate any prior cookie session before issuing a new one.
  await destroySession(c.env, c.req.raw)
  await c.env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(user.id).run()
  if (user.role === 'client') {
    await c.env.DB.prepare(
      "UPDATE contact_inquiries SET client_user_id = COALESCE(client_user_id, ?), updated_at = datetime('now') WHERE lower(email) = lower(?) AND converted_at IS NULL AND archived_at IS NULL",
    ).bind(user.id, user.email).run()
    await advanceInquiryLifecycle(c.env, { userId: user.id, email: user.email, target: 'prospect' })
  }
  await touchIdentityLogin(c.env, meta.identityId)
  const token = await createSession(c.env, user, c.req.raw)
  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'login',
    entityType: 'user',
    entityId: user.id,
    after: { method: 'auth0', provider: meta.provider, connection: meta.connection },
  })
  return token
}

// ---------- public: which provider buttons to show ----------
auth0Routes.get('/auth0/providers', (c) => c.json(publicProviders(c.env)))

// ---------- login initiation ----------
auth0Routes.get('/auth0/login', async (c) => {
  const wired = auth0ClientForEnv(c.env)
  const config = wired?.config || getAuth0Config(c.env)
  if (!wired || config.providers.length === 0) {
    return c.json({ error: 'Auth0 sign-in is not configured.' }, 503)
  }

  const providerId = (c.req.query('provider') || '').trim() as Auth0ProviderId
  const provider = providerById(config, providerId)
  if (!provider) {
    return c.json({ error: 'That sign-in method is not available.' }, 400)
  }

  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  if (await auth0Throttled(c.env, ip)) {
    return c.json({ error: 'too many sign-in attempts. Try again later.' }, 429)
  }

  const returnTo = sanitizeReturnTo(c.req.query('returnTo') || '/portal', '/portal')
  const store = createAuth0StoreOptions(c)
  const appState: Auth0AppState = {
    purpose: 'login',
    returnTo,
    providerId: provider.id,
    connection: provider.connection,
    nonce: crypto.randomUUID(),
  }

  try {
    const authorizationParams: Record<string, string> = {
      connection: provider.connection,
      redirect_uri: config.callbackUrl,
      scope: 'openid profile email',
    }
    if (config.audience) authorizationParams.audience = config.audience

    const url = await wired.client.startInteractiveLogin(
      { appState, authorizationParams },
      store,
    )
    applyAuth0Cookies(c, store)
    return c.redirect(url.toString(), 302)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'auth0_start_failed'
    console.error('[auth0] login start failed', message)
    return c.json({ error: 'Could not start Auth0 sign-in. Please try again.' }, 500)
  }
})

// ---------- callback ----------
auth0Routes.get('/auth0/callback', async (c) => {
  const wired = auth0ClientForEnv(c.env)
  const config = wired?.config || getAuth0Config(c.env)
  const fail = (code: string) => c.redirect(loginErrorRedirect(config.logoutUrl || '/portal/login', code), 302)

  if (!wired) return fail('unavailable')

  // Auth0 error responses (access_denied, etc.) — never echo details.
  if (c.req.query('error')) return fail('denied')

  const store = createAuth0StoreOptions(c)
  let appState: Auth0AppState | undefined
  let claims: UserClaims | undefined

  try {
    const callbackUrl = new URL(c.req.url)
    // Ensure the host matches configured callback for exact-URL tenants.
    const result = await wired.client.completeInteractiveLogin<Auth0AppState>(callbackUrl, store)
    appState = result.appState
    claims = await wired.client.getUser(store)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'callback_failed'
    // Do not log tokens, codes, or full claim sets.
    console.error('[auth0] callback validation failed', message.slice(0, 200))
    applyAuth0Cookies(c, store)
    if (/transaction|state/i.test(message)) return fail('invalid_state')
    if (/expired|expir/i.test(message)) return fail('expired')
    if (/nonce|token|jwt|signature|issuer|audience/i.test(message)) return fail('invalid_token')
    return fail('failed')
  }

  // Drop any Auth0 session cookies the SDK may have staged; identity-only.
  store.memoryState.clear()

  if (!appState || !claims) {
    applyAuth0Cookies(c, store)
    return fail('failed')
  }

  const identity = extractIdentity(claims, config.issuer)
  if (!identity) {
    applyAuth0Cookies(c, store)
    return fail('invalid_token')
  }

  // Require verified email from the provider before linking or signing in.
  if (!identity.email || !identity.emailVerified) {
    applyAuth0Cookies(c, store)
    return fail('email_unverified')
  }

  // Ignore Auth0 roles/org claims entirely for authorization.
  // claims.org_id / custom role claims must never grant portal access.
  if (claims.org_id || claims['https://pinnacle/roles']) {
    // intentionally unused — Auth0 metadata is identity context only
  }

  if (appState.purpose === 'link') {
    return handleLinkCallback(c, store, config, appState, identity)
  }

  return handleLoginCallback(c, store, config, appState, identity)
})

async function handleLoginCallback(
  c: Context<AppEnv>,
  store: ReturnType<typeof createAuth0StoreOptions>,
  config: ReturnType<typeof getAuth0Config>,
  appState: Auth0AppState,
  identity: { issuer: string; subject: string; email: string | null; emailVerified: boolean },
) {
  const fail = (code: string) => {
    applyAuth0Cookies(c, store)
    return c.redirect(loginErrorRedirect(config.logoutUrl, code), 302)
  }

  const linked = await findIdentityByIssuerSubject(c.env, identity.issuer, identity.subject)
  if (!linked) {
    // Never auto-link by email and never invent client relationships.
    return fail('unlinked')
  }

  const user = await loadPortalEligibleUser(c.env, linked.user_id)
  if (!user || !canUseClientPortalAuth(user.role, user.status)) {
    return fail('disabled')
  }

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    first_name: user.first_name,
    last_name: user.last_name,
  }

  const token = await establishPinnacleSession(c, sessionUser, {
    provider: appState.providerId,
    connection: appState.connection,
    identityId: linked.id,
  })
  applyAuth0Cookies(c, store, [sessionCookie(token)])
  const dest = sanitizeReturnTo(appState.returnTo, '/portal')
  return c.redirect(dest, 302)
}

async function handleLinkCallback(
  c: Context<AppEnv>,
  store: ReturnType<typeof createAuth0StoreOptions>,
  config: ReturnType<typeof getAuth0Config>,
  appState: Auth0AppState,
  identity: { issuer: string; subject: string; email: string | null; emailVerified: boolean },
) {
  const fail = (code: string) => {
    applyAuth0Cookies(c, store)
    const securityBase = config.logoutUrl.includes('/portal/login')
      ? config.logoutUrl.replace(/\/portal\/login.*$/, '/portal/security')
      : '/portal/security'
    return c.redirect(loginErrorRedirect(securityBase, code), 302)
  }

  const sessionUser = await getUser(c.env, c.req.raw)
  if (!sessionUser || sessionUser.id !== appState.linkUserId) {
    return fail('link_session')
  }
  if (!canUseClientPortalAuth(sessionUser.role, 'active')) {
    return fail('disabled')
  }

  const inserted = await insertExternalIdentity(c.env, {
    userId: sessionUser.id,
    provider: appState.providerId,
    connectionName: appState.connection,
    issuer: identity.issuer,
    subject: identity.subject,
    providerEmail: identity.email,
    emailVerified: identity.emailVerified,
  })

  if (!inserted.ok) {
    await logAudit(c.env, {
      actorUserId: sessionUser.id,
      actorIp: actorIp(c.req.raw),
      actorUserAgent: actorUserAgent(c.req.raw),
      actorGeo: actorGeo(c.req.raw),
      action: 'auth0_link_failed',
      entityType: 'user',
      entityId: sessionUser.id,
      after: { reason: inserted.reason, provider: appState.providerId },
    })
    return fail(inserted.reason === 'duplicate_identity' ? 'already_linked' : 'link_failed')
  }

  await logAudit(c.env, {
    actorUserId: sessionUser.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'auth0_linked',
    entityType: 'external_identity',
    entityId: inserted.id,
    after: { provider: appState.providerId, connection: appState.connection },
  })

  applyAuth0Cookies(c, store)
  return c.redirect(sanitizeReturnTo(appState.returnTo || '/portal/security', '/portal/security'), 302)
}

// ---------- authenticated: list / link / unlink ----------
auth0Routes.get('/identities', requireUser, async (c) => {
  const user = c.get('user')
  if (!canUseClientPortalAuth(user.role, 'active')) {
    return c.json({ error: 'client accounts only' }, 403)
  }
  const identities = await listIdentitiesForUser(c.env, user.id)
  const methods = await countUsableAuthMethods(c.env, user.id)
  const providers = publicProviders(c.env)
  return c.json({
    identities,
    has_password: methods.password,
    providers: providers.providers,
    auth0_enabled: providers.enabled,
  })
})

auth0Routes.post('/auth0/link', requireUser, async (c) => {
  const user = c.get('user')
  if (!canUseClientPortalAuth(user.role, 'active')) {
    return c.json({ error: 'client accounts only' }, 403)
  }

  const wired = auth0ClientForEnv(c.env)
  if (!wired || wired.config.providers.length === 0) {
    return c.json({ error: 'Auth0 is not configured.' }, 503)
  }

  const body = await c.req.json<{ provider?: string; returnTo?: string }>().catch(() => ({ provider: undefined as string | undefined, returnTo: undefined as string | undefined }))
  const provider = providerById(wired.config, String(body.provider || '').trim())
  if (!provider) return c.json({ error: 'That sign-in method is not available.' }, 400)

  const existing = await listIdentitiesForUser(c.env, user.id)
  if (existing.some((row) => row.provider === provider.id || row.connection_name === provider.connection)) {
    return c.json({ error: 'That sign-in method is already connected.' }, 409)
  }

  const returnTo = sanitizeReturnTo(body.returnTo || '/portal/security', '/portal/security')
  const store = createAuth0StoreOptions(c)
  const appState: Auth0AppState = {
    purpose: 'link',
    returnTo,
    providerId: provider.id,
    connection: provider.connection,
    linkUserId: user.id,
    nonce: crypto.randomUUID(),
  }

  try {
    const authorizationParams: Record<string, string> = {
      connection: provider.connection,
      redirect_uri: wired.config.callbackUrl,
      scope: 'openid profile email',
      // Prompt consent so the user explicitly connects this identity.
      prompt: 'login',
    }
    if (wired.config.audience) authorizationParams.audience = wired.config.audience

    const url = await wired.client.startInteractiveLogin(
      { appState, authorizationParams },
      store,
    )
    applyAuth0Cookies(c, store)
    return c.json({ ok: true, authorize_url: url.toString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'link_start_failed'
    console.error('[auth0] link start failed', message.slice(0, 200))
    return c.json({ error: 'Could not start account linking. Please try again.' }, 500)
  }
})

auth0Routes.post('/auth0/unlink', requireUser, async (c) => {
  const user = c.get('user')
  if (!canUseClientPortalAuth(user.role, 'active')) {
    return c.json({ error: 'client accounts only' }, 403)
  }

  const body = await c.req.json<{ identity_id?: string }>().catch(() => ({} as { identity_id?: string }))
  const identityId = String(body.identity_id || '').trim()
  if (!identityId) return c.json({ error: 'identity_id is required' }, 400)

  const result = await deleteExternalIdentity(c.env, user.id, identityId)
  if (!result.ok) {
    if (result.reason === 'last_method') {
      return c.json({ error: 'Keep at least one sign-in method. Set a password or connect another method before disconnecting this one.' }, 400)
    }
    return c.json({ error: 'Sign-in method not found.' }, 404)
  }

  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'auth0_unlinked',
    entityType: 'external_identity',
    entityId: identityId,
  })

  const methods = await countUsableAuthMethods(c.env, user.id)
  return c.json({ ok: true, has_password: methods.password, remaining_identities: methods.identities })
})

// Exported for tests
export const __auth0TestUtils = {
  extractIdentity,
  publicProviders,
  sanitizeReturnTo,
  userHasPassword,
}
