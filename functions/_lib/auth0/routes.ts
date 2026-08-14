import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getUser, rotateSession, sessionCookie, destroySession, clearCookie } from '../session'
import { logAudit, actorIp, actorUserAgent, actorGeo } from '../auditLog'
import { requireUser } from '../mid'
import {
  AUTH0_GENERIC_ERROR,
  AUTH0_UNAVAILABLE_ERROR,
  inspectAuth0Config,
  isAuth0Ready,
  loginRedirectPath,
  resolveCallbackUrl,
  resolveLogoutReturnUrl,
  resolveProvider,
  securityReturnTo,
} from './config'
import { validateReturnTo } from './returnTo'
import { extractIdentityClaims } from './claims'
import { getAuth0Sdk, MissingTransactionError, redactAuth0Error, type Auth0AppState } from './sdk'
import { newStoreOptions } from './stores'
import { listIdentities } from './identities'
import { confirmAuth0Link, resolveAuth0Login, unlinkIdentityForUser } from './resolve'

export const auth0Routes = new Hono<AppEnv>()

const LOGIN_MAX_PER_HOUR = 20
const CALLBACK_MAX_PER_HOUR = 40

function originOf(request: Request): string {
  try { return new URL(request.url).origin } catch { return '' }
}

function callbackRedirect(request: Request, path: string, extraSetCookie?: string[]): Response {
  const headers = new Headers({ Location: path, 'Cache-Control': 'no-store' })
  if (extraSetCookie) {
    for (const cookie of extraSetCookie) headers.append('Set-Cookie', cookie)
  }
  return new Response(null, { status: 302, headers })
}

function errorRedirect(request: Request, code: 'signin' | 'link' | 'unavailable' = 'signin'): Response {
  return callbackRedirect(request, `${loginRedirectPath(request)}?auth_error=${code}`)
}

async function throttled(env: AppEnv['Bindings'], key: string, max: number): Promise<boolean> {
  const cur = parseInt((await env.SESSIONS.get(key)) || '0', 10)
  if (cur >= max) return true
  await env.SESSIONS.put(key, String(cur + 1), { expirationTtl: 3600 })
  return false
}

async function markCodeUsed(env: AppEnv['Bindings'], code: string): Promise<boolean> {
  const key = `auth0-code:${code}`
  const existing = await env.SESSIONS.get(key)
  if (existing) return false
  await env.SESSIONS.put(key, '1', { expirationTtl: 600 })
  return true
}

auth0Routes.get('/auth0/status', (c) => {
  const inspected = inspectAuth0Config(c.env)
  if (inspected.status !== 'ready') {
    return c.json({ enabled: false, providers: [] as Array<{ id: string; label: string }> })
  }
  return c.json({
    enabled: true,
    providers: inspected.config.providers.map((provider) => ({ id: provider.id, label: provider.label })),
  })
})

auth0Routes.get('/auth0/login', async (c) => {
  if (!isAuth0Ready(c.env)) return errorRedirect(c.req.raw, 'unavailable')
  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  if (await throttled(c.env, `auth0login:${ip}`, LOGIN_MAX_PER_HOUR)) return errorRedirect(c.req.raw, 'signin')

  const provider = resolveProvider(c.env, c.req.query('connection'))
  if (!provider) return errorRedirect(c.req.raw, 'unavailable')

  const callbackUrl = resolveCallbackUrl(c.env, c.req.raw)
  if (!callbackUrl) return errorRedirect(c.req.raw, 'unavailable')

  const sdk = getAuth0Sdk(c.env)
  if (!sdk) return errorRedirect(c.req.raw, 'unavailable')

  const returnTo = validateReturnTo(c.req.query('returnTo') || c.req.query('return_to'), c.req.raw)
  const appState: Auth0AppState = {
    intent: 'login',
    returnTo,
    connection: provider.connection,
    provider: provider.id,
  }

  try {
    const storeOptions = newStoreOptions(c)
    const authorizationUrl = await sdk.startInteractiveLogin({
      appState,
      authorizationParams: {
        redirect_uri: callbackUrl,
        connection: provider.connection,
        prompt: 'select_account',
        scope: 'openid profile email',
      },
    }, storeOptions)
    return c.redirect(authorizationUrl.href, 302)
  } catch (error) {
    console.error('[auth0] login start failed', redactAuth0Error(error))
    return errorRedirect(c.req.raw, 'signin')
  }
})

auth0Routes.post('/auth0/link', requireUser, async (c) => {
  if (!isAuth0Ready(c.env)) return c.json({ error: AUTH0_UNAVAILABLE_ERROR }, 503)
  const user = c.get('user')
  const body = await c.req.json<{ connection?: string }>().catch(() => ({ connection: '' }))
  const provider = resolveProvider(c.env, body.connection)
  if (!provider) return c.json({ error: AUTH0_UNAVAILABLE_ERROR }, 400)
  const callbackUrl = resolveCallbackUrl(c.env, c.req.raw)
  const sdk = getAuth0Sdk(c.env)
  if (!callbackUrl || !sdk) return c.json({ error: AUTH0_UNAVAILABLE_ERROR }, 503)

  const appState: Auth0AppState = {
    intent: 'link',
    returnTo: validateReturnTo(securityReturnTo(c.req.raw), c.req.raw),
    connection: provider.connection,
    provider: provider.id,
    userId: user.id,
  }
  try {
    const storeOptions = newStoreOptions(c)
    const authorizationUrl = await sdk.startInteractiveLogin({
      appState,
      authorizationParams: {
        redirect_uri: callbackUrl,
        connection: provider.connection,
        prompt: 'select_account',
        scope: 'openid profile email',
      },
    }, storeOptions)
    return c.json({ ok: true, authorization_url: authorizationUrl.href })
  } catch (error) {
    console.error('[auth0] link start failed', redactAuth0Error(error))
    return c.json({ error: AUTH0_GENERIC_ERROR }, 400)
  }
})

auth0Routes.get('/auth0/callback', async (c) => {
  if (!isAuth0Ready(c.env)) return errorRedirect(c.req.raw, 'unavailable')
  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  if (await throttled(c.env, `auth0callback:${ip}`, CALLBACK_MAX_PER_HOUR)) return errorRedirect(c.req.raw, 'signin')

  const oauthError = c.req.query('error')
  if (oauthError) return errorRedirect(c.req.raw, 'signin')

  const code = c.req.query('code') || ''
  if (code && !(await markCodeUsed(c.env, code))) return errorRedirect(c.req.raw, 'signin')

  const sdk = getAuth0Sdk(c.env)
  const inspected = inspectAuth0Config(c.env)
  if (!sdk || inspected.status !== 'ready') return errorRedirect(c.req.raw, 'unavailable')

  const storeOptions = newStoreOptions(c)
  let appState: Auth0AppState | undefined
  try {
    const url = new URL(c.req.url)
    const completed = await sdk.completeInteractiveLogin(url, storeOptions)
    appState = completed.appState
    const userClaims = await sdk.getUser(storeOptions)
    const provider = resolveProvider(c.env, appState?.connection || appState?.provider)
    const claims = extractIdentityClaims(userClaims, inspected.config.issuer, provider?.connection)
    if (!claims || !provider || !appState) return errorRedirect(c.req.raw, 'signin')

    const authenticated = await getUser(c.env, c.req.raw)
    const result = await resolveAuth0Login({
      env: c.env,
      request: c.req.raw,
      claims,
      appState,
      provider,
      authenticatedUserId: authenticated?.id || null,
      confirmLinkBase: `${originOf(c.req.raw)}/api/auth/auth0/confirm-link`,
    })
    if (!result.ok) return errorRedirect(c.req.raw, result.code)

    const token = await rotateSession(c.env, c.req.raw, result.user)
    return callbackRedirect(c.req.raw, result.returnTo, [sessionCookie(token)])
  } catch (error) {
    if (error instanceof MissingTransactionError) return errorRedirect(c.req.raw, 'signin')
    console.error('[auth0] callback failed', redactAuth0Error(error))
    return errorRedirect(c.req.raw, 'signin')
  }
})

auth0Routes.get('/auth0/confirm-link', async (c) => {
  const token = c.req.query('token') || ''
  if (!token) return errorRedirect(c.req.raw, 'link')
  const result = await confirmAuth0Link(c.env, c.req.raw, token)
  if (!result.ok) return errorRedirect(c.req.raw, result.code)
  const session = await rotateSession(c.env, c.req.raw, result.user)
  return callbackRedirect(c.req.raw, result.returnTo, [sessionCookie(session)])
})

auth0Routes.get('/identities', requireUser, async (c) => {
  const user = c.get('user')
  const identities = await listIdentities(c.env, user.id)
  const live = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string | null }>()
  return c.json({
    password: Boolean(live?.password_hash),
    identities: identities.map((row) => ({
      id: row.id,
      provider: row.provider,
      email: row.email,
      email_verified: Boolean(row.email_verified),
      created_at: row.created_at,
      last_login_at: row.last_login_at,
    })),
  })
})

auth0Routes.post('/auth0/unlink', requireUser, async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ identity_id?: string }>().catch(() => ({ identity_id: '' }))
  const identityId = typeof body.identity_id === 'string' ? body.identity_id.trim() : ''
  if (!identityId) return c.json({ error: 'identity_id is required' }, 400)
  const result = await unlinkIdentityForUser(c.env, c.req.raw, user, identityId)
  if (!result.ok) return c.json({ error: result.error }, result.status as 400)
  return c.json({ ok: true })
})

auth0Routes.get('/auth0/logout', async (c) => {
  const user = await getUser(c.env, c.req.raw)
  await destroySession(c.env, c.req.raw)
  c.header('Set-Cookie', clearCookie())
  if (user) {
    await logAudit(c.env, {
      actorUserId: user.id,
      actorIp: actorIp(c.req.raw),
      actorUserAgent: actorUserAgent(c.req.raw),
      actorGeo: actorGeo(c.req.raw),
      action: 'logout',
    })
  }
  const federated = c.req.query('federated') === '1'
  if (!federated || !isAuth0Ready(c.env)) {
    return c.redirect(loginRedirectPath(c.req.raw), 302)
  }
  const returnTo = resolveLogoutReturnUrl(c.env, c.req.raw)
  const inspected = inspectAuth0Config(c.env)
  if (inspected.status !== 'ready') return c.redirect(loginRedirectPath(c.req.raw), 302)
  const logoutUrl = new URL(`https://${inspected.config.domain}/v2/logout`)
  logoutUrl.searchParams.set('client_id', inspected.config.clientId)
  logoutUrl.searchParams.set('returnTo', returnTo)
  return c.redirect(logoutUrl.href, 302)
})
