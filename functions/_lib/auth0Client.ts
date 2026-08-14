import {
  CookieTransactionStore,
  MissingTransactionError,
  ServerClient,
  type UserClaims,
} from '@auth0/auth0-server-js'
import type { Env } from './types'
import {
  type Auth0Config,
  type Auth0ProviderId,
  callbackUrlForRequest,
  logoutUrlForRequest,
  readAuth0Config,
} from './auth0Config'
import { applyStoreCookies, EphemeralStateStore, HonoCookieHandler, newStoreOptions, type Auth0StoreOptions } from './auth0Stores'

export const GENERIC_AUTH0_ERROR = 'We could not complete sign-in. Please try again or use your email and password.'
export const GENERIC_AUTH0_CONNECT = 'If this sign-in can be connected to a Pinnacle account, we sent instructions to the email on file.'

export type Auth0Intent = 'login' | 'link' | 'signup'

export interface Auth0AppState {
  intent: Auth0Intent
  returnTo: string
  connection: Auth0ProviderId
  userId?: string
  inviteToken?: string
}

export interface VerifiedAuth0Identity {
  issuer: string
  subject: string
  email: string
  emailVerified: boolean
  givenName: string
  familyName: string
  provider: Auth0ProviderId
  claims: Record<string, unknown>
}

export class Auth0FlowError extends Error {
  readonly code: 'invalid_state' | 'invalid_token' | 'expired' | 'replay' | 'misconfigured' | 'denied'
  constructor(code: Auth0FlowError['code'], message = GENERIC_AUTH0_ERROR) {
    super(message)
    this.code = code
  }
}

export interface Auth0Bridge {
  startLogin(env: Env, request: Request, input: {
    connection: Auth0ProviderId
    appState: Auth0AppState
    prompt?: 'login'
  }): Promise<{ url: string; cookies: string[] }>
  completeLogin(env: Env, request: Request): Promise<{
    identity: VerifiedAuth0Identity
    appState: Auth0AppState
    cookies: string[]
  }>
  federatedLogoutUrl(env: Env, request: Request): Promise<string | null>
}

const cookieHandler = new HonoCookieHandler()

function createClient(env: Env, config: Auth0Config, redirectUri: string) {
  return new ServerClient<Auth0StoreOptions>({
    domain: config.domain,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authorizationParams: {
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      ...(config.audience ? { audience: config.audience } : {}),
    },
    transactionIdentifier: 'pmv_auth0_tx',
    transactionStore: new CookieTransactionStore({ secret: env.SESSION_SECRET }, cookieHandler),
    stateStore: new EphemeralStateStore(),
  })
}

function asAppState(value: unknown, fallback: Auth0AppState): Auth0AppState {
  if (!value || typeof value !== 'object') return fallback
  const raw = value as Record<string, unknown>
  const intent = raw.intent === 'link' || raw.intent === 'signup' ? raw.intent : 'login'
  const connection = typeof raw.connection === 'string' ? raw.connection : fallback.connection
  return {
    intent,
    returnTo: typeof raw.returnTo === 'string' ? raw.returnTo : fallback.returnTo,
    connection: connection as Auth0ProviderId,
    userId: typeof raw.userId === 'string' ? raw.userId : undefined,
    inviteToken: typeof raw.inviteToken === 'string' ? raw.inviteToken : undefined,
  }
}

function claimString(claims: UserClaims, key: string): string {
  const value = claims[key]
  return typeof value === 'string' ? value.trim() : ''
}

function expectedIssuer(config: Auth0Config): string {
  return config.issuer
}

function identityFromClaims(config: Auth0Config, claims: UserClaims, connection: Auth0ProviderId): VerifiedAuth0Identity {
  const issuer = typeof claims.iss === 'string' ? claims.iss : expectedIssuer(config)
  const subject = claims.sub
  const email = (claims.email || '').trim().toLowerCase()
  if (!issuer || issuer !== expectedIssuer(config)) throw new Auth0FlowError('invalid_token')
  if (!subject) throw new Auth0FlowError('invalid_token')
  if (!email || !email.includes('@')) throw new Auth0FlowError('invalid_token')
  const given = claimString(claims, 'given_name') || (claims.name || '').trim().split(/\s+/)[0] || ''
  const family = claimString(claims, 'family_name') || (claims.name || '').trim().split(/\s+/).slice(1).join(' ')
  const { iss: _iss, sub: _sub, email: _email, email_verified: _verified, given_name: _g, family_name: _f, name: _n, nickname: _nick, picture: _pic, org_id: _org, org_name: _orgName, ...rest } = claims
  void rest
  return {
    issuer,
    subject,
    email,
    emailVerified: claims.email_verified === true,
    givenName: given,
    familyName: family,
    provider: connection,
    claims: {
      iss: issuer,
      sub: subject,
      email_verified: claims.email_verified === true,
    },
  }
}

async function markReplay(env: Env, code: string | null) {
  if (!code) return
  const key = `auth0used:${code}`
  const existing = await env.SESSIONS.get(key)
  if (existing) throw new Auth0FlowError('replay')
  await env.SESSIONS.put(key, '1', { expirationTtl: 15 * 60 })
}

export const defaultAuth0Bridge: Auth0Bridge = {
  async startLogin(env, request, input) {
    const config = readAuth0Config(env)
    if (!config.enabled) throw new Auth0FlowError('misconfigured')
    const redirectUri = callbackUrlForRequest(config, request)
    if (!redirectUri) throw new Auth0FlowError('misconfigured')
    const storeOptions = newStoreOptions(request)
    const client = createClient(env, config, redirectUri)
    const url = await client.startInteractiveLogin({
      appState: input.appState,
      authorizationParams: {
        redirect_uri: redirectUri,
        connection: input.connection,
        scope: 'openid profile email',
        ...(config.audience ? { audience: config.audience } : {}),
        ...(input.prompt ? { prompt: input.prompt } : {}),
      },
    }, storeOptions)
    return { url: url.href, cookies: storeOptions.outgoing }
  },

  async completeLogin(env, request) {
    const config = readAuth0Config(env)
    if (!config.enabled) throw new Auth0FlowError('misconfigured')
    const redirectUri = callbackUrlForRequest(config, request)
    if (!redirectUri) throw new Auth0FlowError('misconfigured')
    const url = new URL(request.url)
    const oauthError = url.searchParams.get('error')
    if (oauthError) throw new Auth0FlowError(oauthError === 'access_denied' ? 'denied' : 'invalid_token')
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state) throw new Auth0FlowError('invalid_state')
    await markReplay(env, code)

    const storeOptions = newStoreOptions(request)
    const client = createClient(env, config, redirectUri)
    let appState: Auth0AppState = { intent: 'login', returnTo: '/', connection: 'google-oauth2' }
    try {
      const completed = await client.completeInteractiveLogin<Auth0AppState>(url, storeOptions)
      appState = asAppState(completed.appState, appState)
      const user = await client.getUser(storeOptions)
      storeOptions.capturedState = undefined
      if (!user) throw new Auth0FlowError('invalid_token')
      const identity = identityFromClaims(config, user, appState.connection)
      return { identity, appState, cookies: storeOptions.outgoing }
    } catch (error) {
      storeOptions.capturedState = undefined
      if (error instanceof Auth0FlowError) throw error
      const name = error instanceof Error ? error.name : ''
      const message = error instanceof Error ? error.message : ''
      if (error instanceof MissingTransactionError || /state/i.test(message)) throw new Auth0FlowError('invalid_state')
      if (/nonce/i.test(message) || name === 'JWTClaimValidationFailed') throw new Auth0FlowError('invalid_token')
      if (/expir/i.test(message) || name === 'JWTExpired' || name === 'SessionExpiredError') throw new Auth0FlowError('expired')
      throw new Auth0FlowError('invalid_token')
    }
  },

  async federatedLogoutUrl(env, request) {
    const config = readAuth0Config(env)
    if (!config.enabled) return null
    const returnTo = logoutUrlForRequest(config, request)
    const client = createClient(env, config, config.callbackUrl)
    const url = await client.logout({ returnTo }, newStoreOptions(request))
    return url.href
  },
}

export function applyAuth0Cookies(headers: Headers, cookies: string[]) {
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)
}

export { applyStoreCookies }
