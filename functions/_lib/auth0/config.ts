import type { Env } from '../types'

export const AUTH0_GOOGLE_CONNECTION = 'google-oauth2'
export const AUTH0_MICROSOFT_CONNECTION = 'windowslive'

export const AUTH0_CONNECTION_LABELS: Record<string, string> = {
  [AUTH0_GOOGLE_CONNECTION]: 'Google',
  [AUTH0_MICROSOFT_CONNECTION]: 'Microsoft',
}

const KNOWN_CONNECTIONS = new Set([AUTH0_GOOGLE_CONNECTION, AUTH0_MICROSOFT_CONNECTION])

export const AUTH0_ALLOWED_ORIGINS = [
  'https://www.pinnaclemanagementventures.com',
  'https://secure.pinnaclemanagementventures.com',
  'https://client.pinnaclemanagementventures.com',
  'http://localhost:8788',
  'http://127.0.0.1:8788',
] as const

export type Auth0ConnectionId = typeof AUTH0_GOOGLE_CONNECTION | typeof AUTH0_MICROSOFT_CONNECTION

export interface Auth0Config {
  enabled: boolean
  reason: 'disabled' | 'missing' | 'partial' | 'ready'
  domain: string
  clientId: string
  clientSecret: string
  callbackUrl: string
  logoutUrl: string
  audience: string | null
  connections: Auth0ConnectionId[]
}

function truthy(value: string | undefined): boolean {
  if (!value) return false
  const v = value.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

function falsy(value: string | undefined): boolean {
  if (!value) return false
  const v = value.trim().toLowerCase()
  return v === '0' || v === 'false' || v === 'no' || v === 'off'
}

function parseConnections(raw: string | undefined): Auth0ConnectionId[] {
  const items = (raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is Auth0ConnectionId => KNOWN_CONNECTIONS.has(item))
  if (items.length) return [...new Set(items)]
  return [AUTH0_GOOGLE_CONNECTION, AUTH0_MICROSOFT_CONNECTION]
}

export function readAuth0Config(env: Env): Auth0Config {
  const domain = (env.AUTH0_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const clientId = (env.AUTH0_CLIENT_ID || '').trim()
  const clientSecret = (env.AUTH0_CLIENT_SECRET || '').trim()
  const callbackUrl = (env.AUTH0_CALLBACK_URL || '').trim()
  const logoutUrl = (env.AUTH0_LOGOUT_URL || '').trim()
  const audience = (env.AUTH0_AUDIENCE || '').trim() || null
  const connections = parseConnections(env.AUTH0_CONNECTIONS)
  const present = [domain, clientId, clientSecret, callbackUrl].filter(Boolean).length

  const base: Auth0Config = {
    enabled: false,
    reason: 'missing',
    domain,
    clientId,
    clientSecret,
    callbackUrl,
    logoutUrl,
    audience,
    connections,
  }

  if (truthy(env.AUTH0_DISABLED) || falsy(env.AUTH0_ENABLED)) {
    return { ...base, reason: 'disabled' }
  }
  if (present === 0) return base
  if (present < 4) {
    console.error('[auth0] configuration is incomplete; provider sign-in stays disabled')
    return { ...base, reason: 'partial' }
  }
  return { ...base, enabled: true, reason: 'ready', logoutUrl: logoutUrl || defaultLogoutUrl(callbackUrl) }
}

function defaultLogoutUrl(callbackUrl: string): string {
  try {
    const url = new URL(callbackUrl)
    return `${url.origin}/portal/login`
  } catch {
    return 'https://www.pinnaclemanagementventures.com/portal/login'
  }
}

export function auth0Issuer(config: Auth0Config): string {
  return `https://${config.domain}/`
}

export function isKnownConnection(value: string | null | undefined): value is Auth0ConnectionId {
  return !!value && KNOWN_CONNECTIONS.has(value)
}

export function publicAuth0Providers(config: Auth0Config): { enabled: boolean; connections: Array<{ id: string; label: string }> } {
  if (!config.enabled) return { enabled: false, connections: [] }
  return {
    enabled: true,
    connections: config.connections.map((id) => ({ id, label: AUTH0_CONNECTION_LABELS[id] || id })),
  }
}

export function isAllowedAuth0Origin(origin: string): boolean {
  return (AUTH0_ALLOWED_ORIGINS as readonly string[]).includes(origin)
}

const AUTH0_CSRF_ORIGINS = new Set<string>([
  ...AUTH0_ALLOWED_ORIGINS,
  'https://hq.pinnaclemanagementventures.com',
  'http://localhost:5173',
])

export function isAllowedAuth0CsrfOrigin(origin: string, requestUrl?: string): boolean {
  if (AUTH0_CSRF_ORIGINS.has(origin)) return true
  try { return !!requestUrl && new URL(requestUrl).origin === origin } catch { return false }
}

export function resolveAuth0CallbackUrl(config: Auth0Config, requestUrl: string): string {
  try {
    const origin = new URL(requestUrl).origin
    const configured = new URL(config.callbackUrl).origin
    if (origin === configured) return config.callbackUrl
    if (isAllowedAuth0Origin(origin)) return `${origin}/api/auth/auth0/callback`
  } catch { /* use configured callback */ }
  return config.callbackUrl
}

export function resolveAuth0LogoutUrl(config: Auth0Config, requestUrl: string): string {
  try {
    const url = new URL(requestUrl)
    const origin = url.origin
    const configured = config.logoutUrl || defaultLogoutUrl(config.callbackUrl)
    if (origin === new URL(configured).origin) return configured
    if (isAllowedAuth0Origin(origin)) {
      const host = url.hostname.toLowerCase()
      if (host.startsWith('secure.') || host.startsWith('client.')) return `${origin}/login`
      return `${origin}/portal/login`
    }
  } catch { /* use configured logout */ }
  return config.logoutUrl || defaultLogoutUrl(config.callbackUrl)
}

// Auth0 Organizations are deferred. Pinnacle already has an internal
// relationship/business model (relationship_parties, relationship_businesses,
// account_parties). Mapping every client onto an Auth0 Organization would
// distort that model. Future work can attach Organizations only to genuine
// multi-user business clients, keep Pinnacle records authoritative, disable
// automatic membership and public org signup, and never map Auth0 org roles
// onto granular Pinnacle resource permissions.
export const AUTH0_ORGANIZATIONS_DEFERRED = true
