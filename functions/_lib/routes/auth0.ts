import { Hono } from 'hono'
import type { AppEnv, SessionUser } from '../types'
import {
  auth0ProviderByConnection,
  auth0ProviderByKey,
  isAuth0Configured,
  loadAuth0Config,
  validateAuth0Startup,
} from '../auth0Config'
import {
  completeAuth0Callback,
  consumeTransaction,
  createAuth0LoginRequest,
  auth0LogoutUrl,
} from '../auth0OAuth'
import {
  deleteExternalIdentity,
  findExternalIdentityByIssuerSubject,
  insertExternalIdentity,
  listExternalIdentities,
  touchExternalIdentityLogin,
  userCanUnlinkIdentity,
  userHasPassword,
} from '../auth0Identities'
import { loginErrorRedirect, portalSecurityPath, sanitizeReturnPath } from '../auth0Redirect'
import {
  clearCookie,
  destroySession,
  getUser,
  rotateSession,
  sessionCookie,
} from '../session'
import { requireUser } from '../mid'
import { logAudit, actorIp, actorUserAgent, actorGeo } from '../auditLog'
import { advanceInquiryLifecycle } from '../lifecycle'
import { PUBLIC_SITE_URL } from '../appUrls'

const LOGIN_MAX_PER_MINUTE = 20

export const auth0Routes = new Hono<AppEnv>()

function redirectResponse(location: string, cookie?: string): Response {
  const headers = new Headers({ Location: location })
  if (cookie) headers.append('Set-Cookie', cookie)
  return new Response(null, { status: 302, headers })
}

async function loginThrottled(env: AppEnv['Bindings'], ip: string): Promise<boolean> {
  const key = `auth0-login:${ip}`
  const cur = parseInt((await env.SESSIONS.get(key)) || '0', 10)
  if (cur >= LOGIN_MAX_PER_MINUTE) return true
  await env.SESSIONS.put(key, String(cur + 1), { expirationTtl: 60 })
  return false
}

function publicProviders(config: NonNullable<ReturnType<typeof loadAuth0Config>>) {
  return config.providers.map((provider) => ({
    key: provider.key,
    label: provider.label,
    connection: provider.connection,
  }))
}

auth0Routes.get('/auth0/providers', (c) => {
  const config = loadAuth0Config(c.env)
  if (!config || config.providers.length === 0) {
    return c.json({ enabled: false, providers: [] })
  }
  return c.json({ enabled: true, providers: publicProviders(config) })
})

auth0Routes.get('/auth0/login', async (c) => {
  const config = loadAuth0Config(c.env)
  if (!config || config.providers.length === 0) {
    return c.json({ error: 'social sign-in is not available right now' }, 503)
  }

  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  if (await loginThrottled(c.env, ip)) {
    return c.json({ error: 'too many sign-in attempts. Try again shortly.' }, 429)
  }

  const providerKey = (c.req.query('provider') || '').trim().toLowerCase()
  const connectionParam = (c.req.query('connection') || '').trim()
  const provider = providerKey
    ? auth0ProviderByKey(config, providerKey)
    : connectionParam
      ? auth0ProviderByConnection(config, connectionParam)
      : null
  if (!provider) return c.json({ error: 'unsupported sign-in provider' }, 400)

  const mode = c.req.query('mode') === 'link' ? 'link' : 'login'
  const returnTo = sanitizeReturnPath(c.req.query('returnTo'), mode === 'link' ? portalSecurityPath() : '/portal/')
  let linkUserId: string | null = null

  if (mode === 'link') {
    const user = await getUser(c.env, c.req.raw)
    if (!user) return c.json({ error: 'unauthorized' }, 401)
    if (user.role !== 'client' && user.role !== 'trusted_contact') {
      return c.json({ error: 'client portal accounts only' }, 403)
    }
    linkUserId = user.id
  }

  const { authorizeUrl } = await createAuth0LoginRequest(c.env, config, {
    connection: provider.connection,
    returnTo,
    mode,
    linkUserId,
  })
  return redirectResponse(authorizeUrl)
})

auth0Routes.get('/auth0/callback', async (c) => {
  const config = loadAuth0Config(c.env)
  const returnToFallback = '/portal/login'
  if (!config) {
    return redirectResponse(loginErrorRedirect('sign_in_unavailable', returnToFallback))
  }

  const state = (c.req.query('state') || '').trim()
  if (!state) {
    return redirectResponse(loginErrorRedirect('sign_in_failed', returnToFallback))
  }

  const tx = await consumeTransaction(c.env, state)
  if (!tx) {
    return redirectResponse(loginErrorRedirect('sign_in_failed', returnToFallback))
  }

  const requestUrl = new URL(c.req.url)
  try {
    const { claims } = await completeAuth0Callback(c.env, config, requestUrl, tx)

    if (tx.mode === 'link') {
      const owner = tx.linkUserId ? await c.env.DB.prepare(
        "SELECT id,email,role,full_name,first_name,last_name,status FROM users WHERE id=?",
      ).bind(tx.linkUserId).first<any>() : null
      if (!owner || owner.status !== 'active') {
        return redirectResponse(loginErrorRedirect('account_inactive', portalSecurityPath()))
      }
      if (!claims.emailVerified) {
        return redirectResponse(loginErrorRedirect('sign_in_failed', portalSecurityPath()))
      }
      const existing = await findExternalIdentityByIssuerSubject(c.env, claims.issuer, claims.subject)
      if (existing && existing.user_id !== owner.id) {
        return redirectResponse(loginErrorRedirect('sign_in_failed', portalSecurityPath()))
      }
      if (!existing) {
        await insertExternalIdentity(c.env, { userId: owner.id, claims })
      } else {
        await touchExternalIdentityLogin(c.env, existing.id)
      }
      await logAudit(c.env, {
        actorUserId: owner.id,
        actorIp: actorIp(c.req.raw),
        actorUserAgent: actorUserAgent(c.req.raw),
        actorGeo: actorGeo(c.req.raw),
        action: 'auth0_identity_linked',
        entityType: 'external_identity',
        entityId: claims.subject,
        after: { connection: claims.connection, provider: 'auth0' },
      })
      return redirectResponse(sanitizeReturnPath(tx.returnTo, portalSecurityPath()))
    }

    const identity = await findExternalIdentityByIssuerSubject(c.env, claims.issuer, claims.subject)
    if (!identity) {
      return redirectResponse(loginErrorRedirect('account_not_linked', tx.returnTo || returnToFallback))
    }

    const user = await c.env.DB.prepare(
      "SELECT id,email,role,full_name,first_name,last_name,status FROM users WHERE id=?",
    ).bind(identity.user_id).first<any>()
    if (!user || user.status !== 'active') {
      return redirectResponse(loginErrorRedirect('account_inactive', tx.returnTo || returnToFallback))
    }
    if (user.role !== 'client' && user.role !== 'trusted_contact') {
      return redirectResponse(loginErrorRedirect('sign_in_failed', tx.returnTo || returnToFallback))
    }

    await touchExternalIdentityLogin(c.env, identity.id)
    await c.env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(user.id).run()
    if (user.role === 'client') {
      await c.env.DB.prepare(
        "UPDATE contact_inquiries SET client_user_id = COALESCE(client_user_id, ?), updated_at = datetime('now') WHERE lower(email) = lower(?) AND converted_at IS NULL AND archived_at IS NULL",
      ).bind(user.id, user.email).run()
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
    const token = await rotateSession(c.env, c.req.raw, su)
    await logAudit(c.env, {
      actorUserId: user.id,
      actorIp: actorIp(c.req.raw),
      actorUserAgent: actorUserAgent(c.req.raw),
      actorGeo: actorGeo(c.req.raw),
      action: 'auth0_login',
      after: { connection: claims.connection },
    })
    const destination = sanitizeReturnPath(tx.returnTo, user.role === 'trusted_contact' ? '/portal/trusted' : '/portal/')
    return redirectResponse(destination, sessionCookie(token))
  } catch (err) {
    console.error('[auth0] callback failed', err instanceof Error ? err.message : err)
    return redirectResponse(loginErrorRedirect('sign_in_failed', tx.returnTo || returnToFallback))
  }
})

auth0Routes.get('/identities', requireUser, async (c) => {
  const user = c.get('user')
  const identities = await listExternalIdentities(c.env, user.id)
  const hasPassword = await userHasPassword(c.env, user.id)
  return c.json({
    identities: identities.map((identity) => ({
      id: identity.id,
      provider: identity.provider,
      connection: identity.connection,
      email: identity.email,
      email_verified: !!identity.email_verified,
      created_at: identity.created_at,
      last_login_at: identity.last_login_at,
      label: identity.connection.includes('google') ? 'Google' : identity.connection.includes('windows') || identity.connection.includes('microsoft') ? 'Microsoft' : identity.connection,
    })),
    has_password: hasPassword,
    auth0_enabled: isAuth0Configured(c.env),
  })
})

auth0Routes.post('/auth0/link', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role !== 'client' && user.role !== 'trusted_contact') {
    return c.json({ error: 'client portal accounts only' }, 403)
  }
  const config = loadAuth0Config(c.env)
  if (!config) return c.json({ error: 'social sign-in is not available right now' }, 503)
  const body = await c.req.json<{ provider?: string }>().catch(() => ({} as { provider?: string }))
  const provider = auth0ProviderByKey(config, body.provider || '')
  if (!provider) return c.json({ error: 'unsupported sign-in provider' }, 400)
  const { authorizeUrl } = await createAuth0LoginRequest(c.env, config, {
    connection: provider.connection,
    returnTo: portalSecurityPath(),
    mode: 'link',
    linkUserId: user.id,
  })
  return c.json({ ok: true, authorize_url: authorizeUrl })
})

auth0Routes.post('/auth0/unlink', requireUser, async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ identity_id?: string }>().catch(() => ({} as { identity_id?: string }))
  const identityId = (body.identity_id || '').trim()
  if (!identityId) return c.json({ error: 'identity_id is required' }, 400)

  const canUnlink = await userCanUnlinkIdentity(c.env, user.id)
  if (!canUnlink) {
    return c.json({ error: 'add a password or another sign-in method before removing this one' }, 409)
  }

  const removed = await deleteExternalIdentity(c.env, identityId, user.id)
  if (!removed) return c.json({ error: 'sign-in method not found' }, 404)

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

auth0Routes.get('/auth0/logout', async (c) => {
  const config = loadAuth0Config(c.env)
  const user = await getUser(c.env, c.req.raw)
  await destroySession(c.env, c.req.raw)
  if (user) {
    await logAudit(c.env, {
      actorUserId: user.id,
      actorIp: actorIp(c.req.raw),
      actorUserAgent: actorUserAgent(c.req.raw),
      actorGeo: actorGeo(c.req.raw),
      action: 'logout',
      after: { via: 'auth0_federated' },
    })
  }
  const returnTo = sanitizeReturnPath(c.req.query('returnTo'), config?.logoutReturnUrl || `${PUBLIC_SITE_URL}/portal/login`)
  if (!config) {
    return redirectResponse(returnTo, clearCookie())
  }
  const logoutUrl = auth0LogoutUrl(config, returnTo)
  return redirectResponse(logoutUrl, clearCookie())
})

export function logAuth0StartupWarnings(env: AppEnv['Bindings']): void {
  for (const warning of validateAuth0Startup(env)) {
    console.warn(`[auth0] ${warning}`)
  }
}
