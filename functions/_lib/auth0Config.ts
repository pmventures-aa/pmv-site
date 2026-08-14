import type { Env } from './types'

export const AUTH0_PROVIDERS = {
  'google-oauth2': { id: 'google-oauth2', label: 'Google' },
  windowslive: { id: 'windowslive', label: 'Microsoft' },
  waad: { id: 'waad', label: 'Microsoft' },
} as const

export type Auth0ProviderId = keyof typeof AUTH0_PROVIDERS

export const DEFAULT_AUTH0_CONNECTIONS: Auth0ProviderId[] = ['google-oauth2', 'windowslive']

const DEFAULT_ORIGINS = [
  'https://www.pinnaclemanagementventures.com',
  'https://secure.pinnaclemanagementventures.com',
  'https://client.pinnaclemanagementventures.com',
  'http://localhost:5173',
  'http://localhost:8788',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8788',
]

export interface Auth0Config {
  enabled: true
  domain: string
  issuer: string
  clientId: string
  clientSecret: string
  audience: string | null
  callbackUrl: string
  logoutUrl: string
  extraCallbacks: string[]
  extraLogoutUrls: string[]
  allowedOrigins: string[]
  connections: Auth0ProviderId[]
}

export interface Auth0Disabled {
  enabled: false
  reason: string
}

export type Auth0Status = Auth0Config | Auth0Disabled

const warned = new Set<string>()

function warnOnce(key: string, message: string) {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(message)
}

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function splitList(value: string): string[] {
  return value.split(',').map((part) => part.trim()).filter(Boolean)
}

function normalizeDomain(raw: string): string {
  return raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase()
}

function exactHttpUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    return `${url.protocol}//${url.host}${url.pathname}${url.search}`
  } catch {
    return null
  }
}

export function isAuth0Provider(value: string): value is Auth0ProviderId {
  return value in AUTH0_PROVIDERS
}

export function parseEnabledConnections(raw: string | undefined): Auth0ProviderId[] {
  if (!raw || !raw.trim()) return [...DEFAULT_AUTH0_CONNECTIONS]
  const parsed = splitList(raw).filter(isAuth0Provider)
  return parsed.length ? parsed : []
}

export function readAuth0Config(env: Env): Auth0Status {
  const domainRaw = trim(env.AUTH0_DOMAIN)
  const clientId = trim(env.AUTH0_CLIENT_ID)
  const clientSecret = trim(env.AUTH0_CLIENT_SECRET)
  const callbackUrl = exactHttpUrl(trim(env.AUTH0_CALLBACK_URL))
  const logoutUrl = exactHttpUrl(trim(env.AUTH0_LOGOUT_URL))
  const present = [domainRaw, clientId, clientSecret, trim(env.AUTH0_CALLBACK_URL), trim(env.AUTH0_LOGOUT_URL)].filter(Boolean)

  if (present.length === 0) {
    return { enabled: false, reason: 'Auth0 is not configured' }
  }
  if (present.length < 5 || !domainRaw || !clientId || !clientSecret || !callbackUrl || !logoutUrl) {
    warnOnce(
      'incomplete',
      '[auth0] incomplete configuration; client portal social sign-in is disabled until AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_CALLBACK_URL, and AUTH0_LOGOUT_URL are all set',
    )
    return { enabled: false, reason: 'Auth0 configuration is incomplete' }
  }

  const connections = parseEnabledConnections(env.AUTH0_ENABLED_CONNECTIONS)
  if (!connections.length) {
    warnOnce('connections', '[auth0] AUTH0_ENABLED_CONNECTIONS did not include a supported connection; social sign-in is disabled')
    return { enabled: false, reason: 'No Auth0 connections are enabled' }
  }

  const domain = normalizeDomain(domainRaw)
  if (!domain || domain.includes('/') || domain.includes(' ')) {
    warnOnce('domain', '[auth0] AUTH0_DOMAIN is invalid; social sign-in is disabled')
    return { enabled: false, reason: 'Auth0 domain is invalid' }
  }

  const extraCallbacks = splitList(env.AUTH0_ALLOWED_CALLBACKS || '').map(exactHttpUrl).filter((value): value is string => !!value)
  const extraLogoutUrls = splitList(env.AUTH0_ALLOWED_LOGOUT_URLS || '').map(exactHttpUrl).filter((value): value is string => !!value)
  const extraOrigins = splitList(env.AUTH0_ALLOWED_ORIGINS || '').map((value) => {
    try {
      const url = new URL(value)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
      return `${url.protocol}//${url.host}`
    } catch {
      return null
    }
  }).filter((value): value is string => !!value)

  return {
    enabled: true,
    domain,
    issuer: `https://${domain}/`,
    clientId,
    clientSecret,
    audience: trim(env.AUTH0_AUDIENCE) || null,
    callbackUrl,
    logoutUrl,
    extraCallbacks,
    extraLogoutUrls,
    allowedOrigins: [...new Set([...DEFAULT_ORIGINS, ...extraOrigins])],
    connections,
  }
}

export function requestOrigin(request: Request): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

export function allowedCallbacks(config: Auth0Config): Set<string> {
  return new Set([config.callbackUrl, ...config.extraCallbacks])
}

export function allowedLogoutUrls(config: Auth0Config): Set<string> {
  return new Set([config.logoutUrl, ...config.extraLogoutUrls])
}

export function callbackUrlForRequest(config: Auth0Config, request: Request): string | null {
  const origin = requestOrigin(request)
  if (!config.allowedOrigins.includes(origin)) return allowedCallbacks(config).has(config.callbackUrl) ? config.callbackUrl : null
  const candidate = `${origin}/api/auth/auth0/callback`
  if (allowedCallbacks(config).has(candidate)) return candidate
  return allowedCallbacks(config).has(config.callbackUrl) ? config.callbackUrl : null
}

export function logoutUrlForRequest(config: Auth0Config, request: Request): string {
  const origin = requestOrigin(request)
  const host = new URL(origin).hostname
  const path = host.startsWith('secure.') || host.startsWith('client.') ? '/login' : '/portal/login'
  const candidate = `${origin}${path}`
  if (allowedLogoutUrls(config).has(candidate)) return candidate
  return config.logoutUrl
}

export function publicAuth0Status(env: Env): { enabled: boolean; connections: Array<{ id: Auth0ProviderId; label: string }> } {
  const config = readAuth0Config(env)
  if (!config.enabled) return { enabled: false, connections: [] }
  return {
    enabled: true,
    connections: config.connections.map((id) => ({ id, label: AUTH0_PROVIDERS[id].label })),
  }
}

/**
 * Auth0 Organizations are deferred. Pinnacle already has an internal business /
 * relationship model (relationship_parties, account_parties, trusted_contacts).
 * If Organizations are added later, they should apply only to genuine multi-user
 * business clients, never auto-create per individual, never auto-join on login,
 * and never map Auth0 organization roles onto Pinnacle resource permissions.
 */
export const AUTH0_ORGANIZATIONS_DEFERRED = true
