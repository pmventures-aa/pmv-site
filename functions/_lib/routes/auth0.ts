import { Hono } from 'hono'
import type { UserClaims } from '@auth0/auth0-server-js'
import type { AppEnv, SessionUser } from '../types'
import { uuid } from '../crypto'
import {
  createSession,
  destroySession,
  getUser,
  sessionCookie,
  clearCookie,
} from '../session'
import { requireUser } from '../mid'
import { logAudit, actorIp, actorUserAgent, actorGeo } from '../auditLog'
import { activityInsert } from '../activity'
import { advanceInquiryLifecycle } from '../lifecycle'
import { toDisplayCase } from '../../../shared/displayCase'
import { getAuth0Config, findAuth0Provider, isAuth0Configured } from '../auth0Config'
import {
  applyAuth0Cookies,
  auth0ClientFromEnv,
  claimsIssuer,
  clearAuth0SdkSession,
  createAuth0StoreOptions,
  readAuth0User,
  type Auth0AppState,
} from '../auth0Client'
import {
  countAuthMethods,
  deleteExternalIdentity,
  findIdentityByIssuerSubject,
  insertExternalIdentity,
  listIdentitiesForUser,
  touchIdentityLogin,
} from '../externalIdentities'
import { portalLoginErrorUrl, sanitizeReturnTo } from '../auth0ReturnTo'
import { resolveAuth0Link, resolveAuth0Login, canUnlinkAuthMethod } from '../auth0Resolve'

const AUTH0_LOGIN_MAX_PER_HOUR = 30
const NEUTRAL_LOGIN_ERROR = 'We could not complete sign-in. Please try again or use email and password.'
const NEUTRAL_LINK_ERROR = 'We could not connect that sign-in method. Please try again.'

function normEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function auth0LoginThrottled(env: AppEnv['Bindings'], ip: string): Promise<boolean> {
  const key = `auth0-login:${ip}`
  const cur = parseInt((await env.SESSIONS.get(key)) || '0', 10)
  if (cur >= AUTH0_LOGIN_MAX_PER_HOUR) return true
  await env.SESSIONS.put(key, String(cur + 1), { expirationTtl: 3600 })
  return false
}

function sessionUserFromRow(user: {
  id: string
  email: string
  role: SessionUser['role']
  full_name: string | null
  first_name?: string | null
  last_name?: string | null
}): SessionUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
  }
}

function splitName(claims: UserClaims): { firstName: string; lastName: string; fullName: string } {
  const given = typeof claims.given_name === 'string' ? claims.given_name.trim() : ''
  const family = typeof claims.family_name === 'string' ? claims.family_name.trim() : ''
  const name = typeof claims.name === 'string' ? claims.name.trim() : ''
  const firstName = toDisplayCase(given || name.split(/\s+/)[0] || 'Client')
  const lastName = toDisplayCase(family || name.split(/\s+/).slice(1).join(' ') || '')
  const fullName = `${firstName}${lastName ? ` ${lastName}` : ''}`.trim()
  return { firstName, lastName, fullName }
}

async function rotateToPinnacleSession(
  env: AppEnv['Bindings'],
  request: Request,
  user: SessionUser,
): Promise<string> {
  await destroySession(env, request)
  return createSession(env, user, request)
}

async function ensureClientProfile(env: AppEnv['Bindings'], userId: string, fullName: string, email: string) {
  const existing = await env.DB.prepare('SELECT 1 AS ok FROM client_profiles WHERE user_id = ?').bind(userId).first()
  if (existing) return
  const personPartyId = uuid()
  const firstName = fullName.split(/\s+/)[0] || 'Client'
  const lastName = fullName.split(/\s+/).slice(1).join(' ')
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO client_profiles (id, user_id, business_name, onboarding_completed) VALUES (?, ?, NULL, 0)`,
    ).bind(uuid(), userId),
    env.DB.prepare("INSERT INTO relationship_parties(id,party_type,display_name,email,phone) VALUES (?,'person',?,?,NULL)").bind(personPartyId, fullName, email),
    env.DB.prepare('INSERT INTO relationship_people(party_id,first_name,last_name) VALUES (?,?,?)').bind(personPartyId, firstName, lastName || null),
    env.DB.prepare("INSERT INTO account_parties(user_id,party_id,access_role,is_primary) VALUES (?,?,'self',1)").bind(userId, personPartyId),
    env.DB.prepare('UPDATE client_profiles SET primary_party_id=? WHERE user_id=?').bind(personPartyId, userId),
    activityInsert(env, { clientUserId: userId, kind: 'client_signed_up', detail: { email, via: 'auth0' } }),
  ])
}

export const auth0Routes = new Hono<AppEnv>()

/** Public: which provider buttons the login page may show. */
auth0Routes.get('/providers', (c) => {
  const config = getAuth0Config(c.env)
  if (!config) return c.json({ enabled: false, providers: [] })
  return c.json({
    enabled: true,
    providers: config.providers.map((provider) => ({
      id: provider.id,
      connection: provider.connection,
      label: provider.label,
      loginPath: `/api/auth/auth0/login?connection=${encodeURIComponent(provider.connection)}`,
    })),
  })
})

auth0Routes.get('/login', async (c) => {
  const wired = auth0ClientFromEnv(c.env)
  if (!wired) {
    return c.redirect(portalLoginErrorUrl('Sign-in with Google or Microsoft is not available right now.'))
  }

  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  if (await auth0LoginThrottled(c.env, ip)) {
    return c.redirect(portalLoginErrorUrl('Too many sign-in attempts. Please try again later.'))
  }

  const connectionParam = (c.req.query('connection') || c.req.query('provider') || '').trim()
  const provider = connectionParam ? findAuth0Provider(c.env, connectionParam) : wired.config.providers[0]
  if (!provider) {
    return c.redirect(portalLoginErrorUrl('That sign-in method is not available.'))
  }

  const intent = (c.req.query('intent') || 'login').trim() === 'link' ? 'link' : 'login'
  const returnTo = sanitizeReturnTo(c.req.query('returnTo') || c.req.query('return_to') || '/portal')
  const surface = c.req.query('surface') === 'staff' ? 'staff' : 'client'

  let linkUserId: string | undefined
  if (intent === 'link') {
    const user = await getUser(c.env, c.req.raw)
    if (!user) return c.redirect(portalLoginErrorUrl('Sign in to your Pinnacle account before connecting another method.', surface))
    if (user.role !== 'client' && user.role !== 'trusted_contact') {
      return c.redirect(portalLoginErrorUrl('This sign-in method is available for client portal accounts.', surface))
    }
    linkUserId = user.id
  }

  const appState: Auth0AppState = {
    intent,
    returnTo,
    connection: provider.connection,
    providerId: provider.id,
    userId: linkUserId,
    surface,
  }

  const storeOptions = createAuth0StoreOptions(c.req.raw)
  try {
    const authorizationUrl = await wired.client.startInteractiveLogin(
      {
        appState,
        authorizationParams: {
          redirect_uri: wired.config.callbackUrl,
          connection: provider.connection,
          scope: 'openid profile email',
          ...(wired.config.audience ? { audience: wired.config.audience } : {}),
        },
      },
      storeOptions,
    )
    applyAuth0Cookies(c, storeOptions)
    return c.redirect(authorizationUrl.href)
  } catch (err) {
    console.error('[auth0] login initiation failed', err instanceof Error ? err.message : 'unknown')
    return c.redirect(portalLoginErrorUrl(NEUTRAL_LOGIN_ERROR, surface))
  }
})

auth0Routes.get('/callback', async (c) => {
  const wired = auth0ClientFromEnv(c.env)
  if (!wired) {
    return c.redirect(portalLoginErrorUrl('Sign-in with Google or Microsoft is not available right now.'))
  }

  const storeOptions = createAuth0StoreOptions(c.req.raw)
  const requestUrl = new URL(c.req.url)
  // Reconstruct the callback URL Auth0 redirected to using the configured callback origin
  // so token exchange uses the exact registered redirect_uri.
  const callbackUrl = new URL(wired.config.callbackUrl)
  callbackUrl.search = requestUrl.search

  let appState: Auth0AppState = { intent: 'login', returnTo: '/portal', surface: 'client' }
  try {
    const completed = await wired.client.completeInteractiveLogin<Auth0AppState>(callbackUrl, storeOptions)
    if (completed.appState) appState = { ...appState, ...completed.appState }
  } catch (err) {
    console.error('[auth0] callback validation failed', err instanceof Error ? err.name : 'unknown')
    applyAuth0Cookies(c, storeOptions)
    return c.redirect(portalLoginErrorUrl(NEUTRAL_LOGIN_ERROR, appState.surface || 'client'))
  }

  const surface = appState.surface === 'staff' ? 'staff' : 'client'
  const claimed = await readAuth0User(wired.client, storeOptions)
  if (!claimed) {
    applyAuth0Cookies(c, storeOptions)
    return c.redirect(portalLoginErrorUrl(NEUTRAL_LOGIN_ERROR, surface))
  }

  const issuer = claimsIssuer(claimed.user, wired.config.issuer)
  const subject = String(claimed.user.sub || '')
  const providerEmail = typeof claimed.user.email === 'string' ? normEmail(claimed.user.email) : ''
  const emailVerified = claimed.user.email_verified === true
  const providerName = appState.connection || appState.providerId || 'auth0'
  const returnTo = sanitizeReturnTo(appState.returnTo || '/portal')
  const ip = actorIp(c.req.raw)

  // Clear Auth0 SDK session cookies / encrypted state immediately — Pinnacle session is authoritative.
  await clearAuth0SdkSession(wired.client, storeOptions, wired.config.logoutUrl).catch(() => null)
  applyAuth0Cookies(c, storeOptions)

  if (!subject || !issuer) {
    return c.redirect(portalLoginErrorUrl(NEUTRAL_LOGIN_ERROR, surface))
  }

  try {
    if (appState.intent === 'link') {
      const current = await getUser(c.env, c.req.raw)
      const existing = await findIdentityByIssuerSubject(c.env, issuer, subject)
      const linkDecision = resolveAuth0Link({
        sessionUserId: current?.id || null,
        intendedUserId: appState.userId || null,
        emailVerified,
        providerEmail: providerEmail || null,
        existingIdentityUserId: existing?.user_id || null,
      })

      if (linkDecision.action === 'reject') {
        if (linkDecision.reason === 'owned_elsewhere' && current) {
          await logAudit(c.env, {
            actorUserId: current.id,
            actorIp: ip,
            actorUserAgent: actorUserAgent(c.req.raw),
            actorGeo: actorGeo(c.req.raw),
            action: 'auth0_link_denied',
            entityType: 'user',
            entityId: current.id,
            after: { reason: 'identity_owned_by_other_user', provider: providerName },
          })
        }
        const message =
          linkDecision.reason === 'unverified'
            ? 'Connect a verified email from Google or Microsoft, then try again.'
            : NEUTRAL_LINK_ERROR
        return c.redirect(portalLoginErrorUrl(message, surface))
      }
      if (linkDecision.action === 'already_linked' && existing) {
        await touchIdentityLogin(c.env, existing.id)
        return c.redirect(sanitizeReturnTo('/portal/security'))
      }

      // Both sides must be verified: Auth0 email_verified + existing Pinnacle session.
      await insertExternalIdentity(c.env, {
        userId: current!.id,
        provider: providerName,
        issuer,
        subject,
        providerEmail,
        emailVerified: true,
      })
      await logAudit(c.env, {
        actorUserId: current!.id,
        actorIp: ip,
        actorUserAgent: actorUserAgent(c.req.raw),
        actorGeo: actorGeo(c.req.raw),
        action: 'auth0_identity_linked',
        entityType: 'user',
        entityId: current!.id,
        after: { provider: providerName, issuer },
      })
      return c.redirect(sanitizeReturnTo('/portal/security'))
    }

    // ---- Login path ----
    const identity = await findIdentityByIssuerSubject(c.env, issuer, subject)
    let existingEmailUserId: string | null = null
    if (!identity && providerEmail) {
      const existingUser = await c.env.DB.prepare(
        'SELECT id FROM users WHERE lower(email) = lower(?)',
      ).bind(providerEmail).first<{ id: string }>()
      existingEmailUserId = existingUser?.id || null
    }

    let identityUser: any = null
    if (identity) {
      identityUser = await c.env.DB.prepare(
        `SELECT id, email, role, full_name, first_name, last_name, status FROM users WHERE id = ?`,
      ).bind(identity.user_id).first<any>()
    }

    const decision = resolveAuth0Login({
      identityUserId: identity?.user_id || null,
      identityUserStatus: identityUser?.status || null,
      identityUserRole: identityUser?.role || null,
      providerEmail: providerEmail || null,
      emailVerified,
      existingEmailUserId,
    })

    if (decision.action === 'reject') {
      if (decision.reason === 'inactive' && identity) {
        await logAudit(c.env, {
          actorUserId: identity.user_id,
          actorIp: ip,
          actorUserAgent: actorUserAgent(c.req.raw),
          actorGeo: actorGeo(c.req.raw),
          action: 'login_failed',
          entityType: 'user',
          entityId: identity.user_id,
          after: { method: 'auth0', reason: 'inactive_user' },
        })
      }
      if (decision.reason === 'link_required' && existingEmailUserId) {
        await logAudit(c.env, {
          actorUserId: existingEmailUserId,
          actorIp: ip,
          actorUserAgent: actorUserAgent(c.req.raw),
          actorGeo: actorGeo(c.req.raw),
          action: 'auth0_link_required',
          entityType: 'user',
          entityId: existingEmailUserId,
          after: { provider: providerName },
        })
        return c.redirect(
          portalLoginErrorUrl(
            'An account with that email already exists. Sign in with your Pinnacle email and password, then connect Google or Microsoft from Account Security.',
            surface,
          ),
        )
      }
      if (decision.reason === 'wrong_surface') {
        return c.redirect(portalLoginErrorUrl('This account belongs in Pinnacle HQ. Please sign in there instead.', surface))
      }
      if (decision.reason === 'unverified') {
        return c.redirect(
          portalLoginErrorUrl(
            'Use a verified Google or Microsoft email, or create a Pinnacle account with email and password.',
            surface,
          ),
        )
      }
      return c.redirect(portalLoginErrorUrl(NEUTRAL_LOGIN_ERROR, surface))
    }

    if (decision.action === 'session' && identity && identityUser) {
      await touchIdentityLogin(c.env, identity.id)
      await c.env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(identityUser.id).run()
      if (identityUser.role === 'client') {
        await c.env.DB.prepare(
          "UPDATE contact_inquiries SET client_user_id = COALESCE(client_user_id, ?), updated_at = datetime('now') WHERE lower(email) = lower(?) AND converted_at IS NULL AND archived_at IS NULL",
        ).bind(identityUser.id, identityUser.email).run()
        await advanceInquiryLifecycle(c.env, { userId: identityUser.id, email: identityUser.email, target: 'prospect' })
      }

      const su = sessionUserFromRow(identityUser)
      const token = await rotateToPinnacleSession(c.env, c.req.raw, su)
      c.header('Set-Cookie', sessionCookie(token), { append: true })
      await logAudit(c.env, {
        actorUserId: identityUser.id,
        actorIp: ip,
        actorUserAgent: actorUserAgent(c.req.raw),
        actorGeo: actorGeo(c.req.raw),
        action: 'login',
        after: { method: 'auth0', provider: providerName },
      })

      if (identityUser.role === 'trusted_contact') return c.redirect(sanitizeReturnTo('/portal/trusted'))
      return c.redirect(returnTo)
    }

    // Brand-new verified Auth0 user: create a client account with no inherited relationships.
    const { firstName, lastName, fullName } = splitName(claimed.user)
    const userId = uuid()
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, phone, two_factor_enabled, status, tos_accepted_at, last_login_at)
       VALUES (?, ?, NULL, 'client', ?, ?, ?, NULL, 0, 'active', datetime('now'), datetime('now'))`,
    ).bind(userId, providerEmail, fullName, firstName, lastName || null).run()
    await ensureClientProfile(c.env, userId, fullName, providerEmail)
    await insertExternalIdentity(c.env, {
      userId,
      provider: providerName,
      issuer,
      subject,
      providerEmail,
      emailVerified: true,
    })

    const su: SessionUser = {
      id: userId,
      email: providerEmail,
      role: 'client',
      full_name: fullName,
      first_name: firstName,
      last_name: lastName || null,
    }
    const token = await rotateToPinnacleSession(c.env, c.req.raw, su)
    c.header('Set-Cookie', sessionCookie(token), { append: true })
    await logAudit(c.env, {
      actorUserId: userId,
      actorIp: ip,
      actorUserAgent: actorUserAgent(c.req.raw),
      actorGeo: actorGeo(c.req.raw),
      action: 'login',
      after: { method: 'auth0', provider: providerName, new_user: true },
    })
    return c.redirect(returnTo)
  } catch (err) {
    console.error('[auth0] callback processing failed', err instanceof Error ? err.message : 'unknown')
    return c.redirect(portalLoginErrorUrl(NEUTRAL_LOGIN_ERROR, surface))
  }
})

auth0Routes.post('/link', requireUser, async (c) => {
  if (!isAuth0Configured(c.env)) return c.json({ error: 'Sign-in providers are not configured.' }, 503)
  const user = c.get('user')
  if (user.role !== 'client' && user.role !== 'trusted_contact') {
    return c.json({ error: 'Only client portal accounts can connect these sign-in methods.' }, 403)
  }

  const body = await c.req.json<{ connection?: string; provider?: string; returnTo?: string }>().catch(() => ({} as any))
  const provider = findAuth0Provider(c.env, String(body.connection || body.provider || ''))
  if (!provider) return c.json({ error: 'That sign-in method is not available.' }, 400)

  const returnTo = sanitizeReturnTo(body.returnTo || '/portal/security', '/portal/security')
  const url = `/api/auth/auth0/login?intent=link&connection=${encodeURIComponent(provider.connection)}&returnTo=${encodeURIComponent(returnTo)}`
  return c.json({ ok: true, redirect: url })
})

auth0Routes.post('/unlink', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role !== 'client' && user.role !== 'trusted_contact') {
    return c.json({ error: 'Only client portal accounts can manage these sign-in methods.' }, 403)
  }

  const body = await c.req.json<{ identity_id?: string }>().catch(() => ({} as any))
  const identityId = String(body.identity_id || '').trim()
  if (!identityId) return c.json({ error: 'identity_id is required' }, 400)

  const identities = await listIdentitiesForUser(c.env, user.id)
  const target = identities.find((row) => row.id === identityId)
  if (!target) return c.json({ error: 'Sign-in method not found.' }, 404)

  const methods = await countAuthMethods(c.env, user.id)
  if (!canUnlinkAuthMethod(methods.passwords, methods.identities)) {
    return c.json({ error: 'Keep at least one sign-in method on your account.' }, 400)
  }

  const removed = await deleteExternalIdentity(c.env, identityId, user.id)
  if (!removed) return c.json({ error: 'Sign-in method not found.' }, 404)

  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'auth0_identity_unlinked',
    entityType: 'user',
    entityId: user.id,
    after: { provider: target.provider, issuer: target.issuer },
  })

  return c.json({ ok: true })
})

auth0Routes.get('/identities', requireUser, async (c) => {
  const user = c.get('user')
  const identities = await listIdentitiesForUser(c.env, user.id)
  const methods = await countAuthMethods(c.env, user.id)
  const config = getAuth0Config(c.env)
  return c.json({
    ok: true,
    auth0_enabled: Boolean(config),
    has_password: methods.passwords > 0,
    can_unlink: methods.total > 1,
    providers: config?.providers || [],
    identities: identities.map((row) => ({
      id: row.id,
      provider: row.provider,
      provider_email: row.provider_email,
      email_verified: row.email_verified === 1,
      created_at: row.created_at,
      last_login_at: row.last_login_at,
    })),
  })
})

/** Optional federated logout URL (local session must already be cleared by /auth/logout). */
auth0Routes.get('/federated-logout', async (c) => {
  const wired = auth0ClientFromEnv(c.env)
  if (!wired) return c.json({ enabled: false })
  const returnTo = sanitizeReturnTo(c.req.query('returnTo') || wired.config.logoutUrl.replace(/^https?:\/\/[^/]+/, '') || '/portal/login', '/portal/login')
  // Build Auth0 logout URL without requiring an Auth0 SDK session.
  const logout = new URL(`https://${wired.config.domain}/v2/logout`)
  logout.searchParams.set('client_id', wired.config.clientId)
  logout.searchParams.set('returnTo', wired.config.logoutUrl || `${c.req.url.split('/api/')[0]}/portal/login`)
  return c.json({ enabled: true, url: logout.href, returnTo })
})
