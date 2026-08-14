/**
 * Auth0 is an identity provider only. Pinnacle's users, relationships, and
 * grants remain the authorization source. Auth0 Organizations are intentionally
 * not created per client; add them later only for genuine multi-user business
 * clients, with automatic membership and public org signup left off.
 */
import type { Env } from '../types'

export type Auth0ProviderId = 'google' | 'microsoft'

export interface Auth0Provider {
  id: Auth0ProviderId
  label: string
  connection: string
}

export interface Auth0Config {
  domain: string
  clientId: string
  clientSecret: string
  audience?: string
  callbackUrl: string
  logoutUrl: string
  issuer: string
  providers: Auth0Provider[]
}

export const AUTH0_GENERIC_ERROR =
  'We could not complete sign-in. If you already have a Pinnacle account, sign in with your email and password, then connect this method from Account Security.'

export const AUTH0_UNAVAILABLE_ERROR = 'This sign-in method is unavailable right now. Please use your email and password.'

export const DEFAULT_GOOGLE_CONNECTION = 'google-oauth2'
export const DEFAULT_MICROSOFT_CONNECTION = 'windowslive'

export const PRODUCTION_ORIGINS = [
  'https://www.pinnaclemanagementventures.com',
  'https://secure.pinnaclemanagementventures.com',
  'https://client.pinnaclemanagementventures.com',
] as const

export const LOCAL_ORIGINS = [
  'http://localhost:8788',
  'http://127.0.0.1:8788',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
] as const

export const ALLOWED_AUTH0_ORIGINS = [...PRODUCTION_ORIGINS, ...LOCAL_ORIGINS]

const PROVIDER_ALIASES: Record<string, Auth0ProviderId> = {
  google: 'google',
  'google-oauth2': 'google',
  microsoft: 'microsoft',
  windowslive: 'microsoft',
  'microsoft-account': 'microsoft',
}

export function auth0Issuer(domain: string): string {
  const host = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return `https://${host}/`
}

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseEnabledProviderIds(raw: string | undefined): Auth0ProviderId[] {
  const value = trim(raw).toLowerCase()
  if (!value) return ['google', 'microsoft']
  const ids: Auth0ProviderId[] = []
  for (const part of value.split(/[,\s]+/)) {
    const id = PROVIDER_ALIASES[part]
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

export function providerConnectionMap(env: Pick<Env, 'AUTH0_GOOGLE_CONNECTION' | 'AUTH0_MICROSOFT_CONNECTION'>): Record<Auth0ProviderId, string> {
  return {
    google: trim(env.AUTH0_GOOGLE_CONNECTION) || DEFAULT_GOOGLE_CONNECTION,
    microsoft: trim(env.AUTH0_MICROSOFT_CONNECTION) || DEFAULT_MICROSOFT_CONNECTION,
  }
}

export function configuredProviders(env: Env): Auth0Provider[] {
  const connections = providerConnectionMap(env)
  const labels: Record<Auth0ProviderId, string> = { google: 'Google', microsoft: 'Microsoft' }
  return parseEnabledProviderIds(env.AUTH0_CONNECTIONS).map((id) => ({
    id,
    label: labels[id],
    connection: connections[id],
  }))
}

export function resolveProvider(env: Env, connection: string | null | undefined): Auth0Provider | null {
  const raw = trim(connection).toLowerCase()
  if (!raw) return null
  const providers = configuredProviders(env)
  const alias = PROVIDER_ALIASES[raw]
  return providers.find((provider) => provider.connection.toLowerCase() === raw || provider.id === alias) || null
}

export type Auth0ConfigStatus =
  | { status: 'disabled' }
  | { status: 'invalid'; reason: string }
  | { status: 'ready'; config: Auth0Config }

/**
 * Auth0 is optional. Completely unset configuration disables the feature.
 * Partial configuration is treated as invalid so a non-functional button is never shown.
 */
export function inspectAuth0Config(env: Env): Auth0ConfigStatus {
  const domain = trim(env.AUTH0_DOMAIN)
  const clientId = trim(env.AUTH0_CLIENT_ID)
  const clientSecret = trim(env.AUTH0_CLIENT_SECRET)
  const callbackUrl = trim(env.AUTH0_CALLBACK_URL)
  const logoutUrl = trim(env.AUTH0_LOGOUT_URL)
  const audience = trim(env.AUTH0_AUDIENCE) || undefined
  const present = [domain, clientId, clientSecret, callbackUrl, logoutUrl].filter(Boolean)
  if (present.length === 0 && !audience) return { status: 'disabled' }

  const missing: string[] = []
  if (!domain) missing.push('AUTH0_DOMAIN')
  if (!clientId) missing.push('AUTH0_CLIENT_ID')
  if (!clientSecret) missing.push('AUTH0_CLIENT_SECRET')
  if (!callbackUrl) missing.push('AUTH0_CALLBACK_URL')
  if (!logoutUrl) missing.push('AUTH0_LOGOUT_URL')
  if (missing.length) {
    return { status: 'invalid', reason: `Auth0 is partially configured. Missing ${missing.join(', ')}.` }
  }
  if (!isAllowedCallbackUrl(callbackUrl)) {
    return { status: 'invalid', reason: 'AUTH0_CALLBACK_URL is not an allowlisted Pinnacle callback URL.' }
  }
  if (!isAllowedLogoutUrl(logoutUrl)) {
    return { status: 'invalid', reason: 'AUTH0_LOGOUT_URL is not an allowlisted Pinnacle logout URL.' }
  }
  const providers = configuredProviders(env)
  if (providers.length === 0) {
    return { status: 'invalid', reason: 'AUTH0_CONNECTIONS does not enable Google or Microsoft.' }
  }
  return {
    status: 'ready',
    config: {
      domain: domain.replace(/^https?:\/\//, '').replace(/\/+$/, ''),
      clientId,
      clientSecret,
      audience,
      callbackUrl,
      logoutUrl,
      issuer: auth0Issuer(domain),
      providers,
    },
  }
}

export function isAuth0Ready(env: Env): boolean {
  return inspectAuth0Config(env).status === 'ready'
}

export function allowedCallbackUrls(): string[] {
  return ALLOWED_AUTH0_ORIGINS.map((origin) => `${origin}/api/auth/auth0/callback`)
}

export function allowedLogoutUrls(): string[] {
  const urls: string[] = []
  for (const origin of ALLOWED_AUTH0_ORIGINS) {
    if (origin.includes('secure.') || origin.includes('client.')) {
      urls.push(`${origin}/login`)
      urls.push(`${origin}/`)
    } else {
      urls.push(`${origin}/portal/login`)
    }
  }
  return urls
}

export function isAllowedCallbackUrl(url: string): boolean {
  return allowedCallbackUrls().includes(url.trim())
}

export function isAllowedLogoutUrl(url: string): boolean {
  return allowedLogoutUrls().includes(url.trim())
}

function isAllowedOrigin(origin: string): origin is typeof ALLOWED_AUTH0_ORIGINS[number] {
  return (ALLOWED_AUTH0_ORIGINS as readonly string[]).includes(origin)
}

export function originFromRequest(request: Request): string {
  const candidates: string[] = []
  const headerOrigin = trim(request.headers.get('Origin'))
  if (headerOrigin) candidates.push(headerOrigin)
  const referer = trim(request.headers.get('Referer'))
  if (referer) {
    try { candidates.push(new URL(referer).origin) } catch { /* ignore */ }
  }
  try { candidates.push(new URL(request.url).origin) } catch { /* ignore */ }
  for (const origin of candidates) {
    if (isAllowedOrigin(origin)) return origin
  }
  return candidates[0] || ''
}

/**
 * Mutating Auth0 endpoints require an allowlisted Origin (or Referer when
 * Origin is absent). Same-origin tests that omit both still pass when the
 * request URL itself is allowlisted.
 */
export function requestOriginIsAllowed(request: Request): boolean {
  const headerOrigin = trim(request.headers.get('Origin'))
  if (headerOrigin) return isAllowedOrigin(headerOrigin)
  const referer = trim(request.headers.get('Referer'))
  if (referer) {
    try { return isAllowedOrigin(new URL(referer).origin) } catch { return false }
  }
  try { return isAllowedOrigin(new URL(request.url).origin) } catch { return false }
}

export function resolveCallbackUrl(env: Env, request: Request): string | null {
  const inspected = inspectAuth0Config(env)
  const origin = originFromRequest(request)
  if (ALLOWED_AUTH0_ORIGINS.includes(origin as typeof ALLOWED_AUTH0_ORIGINS[number])) {
    return `${origin}/api/auth/auth0/callback`
  }
  return inspected.status === 'ready' ? inspected.config.callbackUrl : trim(env.AUTH0_CALLBACK_URL) || null
}

export function resolveLogoutReturnUrl(env: Env, request: Request): string {
  const origin = originFromRequest(request)
  if (origin.startsWith('https://secure.') || origin.startsWith('https://client.') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
    if (origin.startsWith('https://secure.') || origin.startsWith('https://client.')) return `${origin}/login`
    if (ALLOWED_AUTH0_ORIGINS.includes(origin as typeof ALLOWED_AUTH0_ORIGINS[number])) return `${origin}/portal/login`
  }
  const inspected = inspectAuth0Config(env)
  if (inspected.status === 'ready') return inspected.config.logoutUrl
  return 'https://www.pinnaclemanagementventures.com/portal/login'
}

export function loginRedirectPath(request: Request): string {
  const origin = originFromRequest(request)
  if (origin.startsWith('https://secure.') || origin.startsWith('https://client.')) return '/login'
  return '/portal/login'
}

export function defaultPortalReturnTo(request: Request): string {
  const origin = originFromRequest(request)
  if (origin.startsWith('https://secure.') || origin.startsWith('https://client.')) return '/'
  return '/portal'
}

export function securityReturnTo(request: Request): string {
  const origin = originFromRequest(request)
  if (origin.startsWith('https://secure.') || origin.startsWith('https://client.')) return '/security'
  return '/portal/security'
}

export function trustedReturnTo(request: Request): string {
  const origin = originFromRequest(request)
  if (origin.startsWith('https://secure.') || origin.startsWith('https://client.')) return '/trusted'
  return '/portal/trusted'
}
