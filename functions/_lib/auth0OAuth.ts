import * as oauth from 'oauth4webapi'
import type { Env } from './types'
import type { Auth0Config } from './auth0Config'
import { auth0Issuer } from './auth0Config'
import type { Auth0IdentityClaims } from './auth0Identities'

const TX_TTL_SECONDS = 10 * 60
const TX_PREFIX = 'auth0tx:'

export type Auth0FlowMode = 'login' | 'link'

export interface Auth0Transaction {
  state: string
  nonce: string
  codeVerifier: string
  returnTo: string
  connection: string
  mode: Auth0FlowMode
  linkUserId?: string | null
  createdAt: number
}

function txKey(state: string): string {
  return `${TX_PREFIX}${state}`
}

function randomString(bytes = 32): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes))
  let out = ''
  for (const byte of arr) out += String.fromCharCode(byte)
  return btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function saveTransaction(env: Env, tx: Auth0Transaction): Promise<void> {
  await env.SESSIONS.put(txKey(tx.state), JSON.stringify(tx), { expirationTtl: TX_TTL_SECONDS })
}

export async function consumeTransaction(env: Env, state: string): Promise<Auth0Transaction | null> {
  const key = txKey(state)
  const raw = await env.SESSIONS.get(key)
  if (!raw) return null
  await env.SESSIONS.delete(key)
  try {
    return JSON.parse(raw) as Auth0Transaction
  } catch {
    return null
  }
}

let asCache: { domain: string; as: oauth.AuthorizationServer; expiresAt: number } | null = null

function oauthClient(config: Auth0Config): oauth.Client {
  return { client_id: config.clientId }
}

async function authorizationServer(config: Auth0Config): Promise<oauth.AuthorizationServer> {
  const now = Date.now()
  if (asCache && asCache.domain === config.domain && asCache.expiresAt > now) {
    return asCache.as
  }
  const issuer = new URL(auth0Issuer(config))
  const response = await oauth.discoveryRequest(issuer, { algorithm: 'oidc' })
  const as = await oauth.processDiscoveryResponse(issuer, response)
  asCache = { domain: config.domain, as, expiresAt: now + 60 * 60 * 1000 }
  return as
}

export async function createAuth0LoginRequest(
  env: Env,
  config: Auth0Config,
  input: {
    connection: string
    returnTo: string
    mode: Auth0FlowMode
    linkUserId?: string | null
  },
): Promise<{ authorizeUrl: string; state: string }> {
  const as = await authorizationServer(config)
  const codeVerifier = oauth.generateRandomCodeVerifier()
  const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier)
  const state = randomString(24)
  const nonce = randomString(24)
  const tx: Auth0Transaction = {
    state,
    nonce,
    codeVerifier,
    returnTo: input.returnTo,
    connection: input.connection,
    mode: input.mode,
    linkUserId: input.linkUserId ?? null,
    createdAt: Date.now(),
  }
  await saveTransaction(env, tx)

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    connection: input.connection,
  })
  if (config.audience) params.set('audience', config.audience)
  const authorizeUrl = `${as.authorization_endpoint}?${params.toString()}`
  return { authorizeUrl, state }
}

function connectionFromClaims(claims: oauth.IDToken): string {
  const sub = String(claims.sub || '')
  const prefix = sub.split('|')[0]
  return prefix || 'auth0'
}

function emailFromClaims(claims: oauth.IDToken): string | null {
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : ''
  return email || null
}

function claimsFromIdToken(idToken: oauth.IDToken, issuer: string): Auth0IdentityClaims {
  return {
    issuer,
    subject: String(idToken.sub),
    connection: connectionFromClaims(idToken),
    email: emailFromClaims(idToken),
    emailVerified: idToken.email_verified === true,
  }
}

export async function completeAuth0Callback(
  env: Env,
  config: Auth0Config,
  requestUrl: URL,
  tx: Auth0Transaction,
): Promise<{ claims: Auth0IdentityClaims; idToken: oauth.IDToken }> {
  const as = await authorizationServer(config)
  const issuer = auth0Issuer(config)
  const client = oauthClient(config)
  const clientAuth = oauth.ClientSecretPost(config.clientSecret)
  const callbackParameters = oauth.validateAuthResponse(as, client, requestUrl.searchParams, tx.state)
  const response = await oauth.authorizationCodeGrantRequest(
    as,
    client,
    clientAuth,
    callbackParameters,
    config.callbackUrl,
    tx.codeVerifier,
  )
  const result = await oauth.processAuthorizationCodeResponse(as, client, response, {
    expectedNonce: tx.nonce,
    requireIdToken: true,
  })
  const idTokenClaims = oauth.getValidatedIdTokenClaims(result)
  if (!idTokenClaims) throw new Error('id token validation failed')
  if (String(idTokenClaims.iss) !== issuer) throw new Error('issuer mismatch')
  if (Date.now() - tx.createdAt > TX_TTL_SECONDS * 1000) throw new Error('transaction expired')

  return {
    claims: claimsFromIdToken(idTokenClaims, issuer),
    idToken: idTokenClaims,
  }
}

export function auth0LogoutUrl(config: Auth0Config, returnTo?: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    returnTo: returnTo || config.logoutReturnUrl,
  })
  return `https://${config.domain}/v2/logout?${params.toString()}`
}
