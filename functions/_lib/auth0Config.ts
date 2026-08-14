import type { Env } from './types'
import { PUBLIC_SITE_URL } from '../../shared/letterhead'

export type Auth0ConnectionId = 'google-oauth2' | 'windowslive'

export interface Auth0ProviderMeta {
  id: Auth0ConnectionId
  label: string
  buttonLabel: string
}

export const AUTH0_PROVIDERS: Record<Auth0ConnectionId, Auth0ProviderMeta> = {
  'google-oauth2': {
    id: 'google-oauth2',
    label: 'Google',
    buttonLabel: 'Continue with Google',
  },
  windowslive: {
    id: 'windowslive',
    label: 'Microsoft',
    buttonLabel: 'Continue with Microsoft',
  },
}

export interface Auth0Config {
  enabled: boolean
  domain: string
  clientId: string
  clientSecret: string
  audience: string | null
  callbackUrl: string
  logoutUrl: string
  issuer: string
  connections: Auth0ConnectionId[]
  missing: string[]
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function defaultCallbackUrl(): string {
  return `${PUBLIC_SITE_URL}/api/auth/auth0/callback`
}

function defaultLogoutUrl(): string {
  return `${PUBLIC_SITE_URL}/portal/login`
}

function parseConnections(raw: string | undefined): Auth0ConnectionId[] {
  const fallback: Auth0ConnectionId[] = ['google-oauth2', 'windowslive']
  if (!raw || !raw.trim()) return fallback
  const allowed = new Set(Object.keys(AUTH0_PROVIDERS) as Auth0ConnectionId[])
  const parsed = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is Auth0ConnectionId => allowed.has(part as Auth0ConnectionId))
  return parsed.length ? parsed : fallback
}

/** Resolve Auth0 configuration. Never throws — returns enabled:false when incomplete. */
export function resolveAuth0Config(env: Env): Auth0Config {
  const domain = clean(env.AUTH0_DOMAIN).replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const clientId = clean(env.AUTH0_CLIENT_ID)
  const clientSecret = clean(env.AUTH0_CLIENT_SECRET)
  const audience = clean(env.AUTH0_AUDIENCE) || null
  const callbackUrl = clean(env.AUTH0_CALLBACK_URL) || defaultCallbackUrl()
  const logoutUrl = clean(env.AUTH0_LOGOUT_URL) || defaultLogoutUrl()
  const intentionallyDisabled = clean(env.AUTH0_ENABLED).toLowerCase() === 'false'

  const missing: string[] = []
  if (!domain) missing.push('AUTH0_DOMAIN')
  if (!clientId) missing.push('AUTH0_CLIENT_ID')
  if (!clientSecret) missing.push('AUTH0_CLIENT_SECRET')
  if (!callbackUrl) missing.push('AUTH0_CALLBACK_URL')
  if (!logoutUrl) missing.push('AUTH0_LOGOUT_URL')

  const enabled = !intentionallyDisabled && missing.length === 0
  const issuer = domain ? `https://${domain}/` : ''

  return {
    enabled,
    domain,
    clientId,
    clientSecret,
    audience,
    callbackUrl,
    logoutUrl,
    issuer,
    connections: enabled ? parseConnections(env.AUTH0_CONNECTIONS) : [],
    missing,
  }
}

export function auth0Configured(env: Env): boolean {
  return resolveAuth0Config(env).enabled
}

export function isAllowedAuth0Connection(env: Env, connection: string): connection is Auth0ConnectionId {
  const cfg = resolveAuth0Config(env)
  return cfg.enabled && cfg.connections.includes(connection as Auth0ConnectionId)
}

/** Strict relative internal return paths only — reject open redirects. */
export function sanitizeAuth0ReturnTo(raw: unknown, fallback = '/portal'): string {
  if (typeof raw !== 'string') return fallback
  const value = raw.trim()
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback
  if (value.includes('\\') || value.includes('\n') || value.includes('\r') || value.includes('@')) return fallback
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return fallback
  const pathOnly = value.split(/[?#]/)[0] || value
  const allowed =
    pathOnly === '/' ||
    pathOnly === '/portal' ||
    pathOnly.startsWith('/portal/') ||
    pathOnly === '/trusted' ||
    pathOnly.startsWith('/trusted/') ||
    pathOnly.startsWith('/services/') ||
    pathOnly === '/security' ||
    pathOnly.startsWith('/security')
  if (!allowed) return fallback
  return value.slice(0, 500)
}

export function auth0ErrorRedirect(logoutUrl: string, code: string): string {
  const url = new URL(logoutUrl)
  url.searchParams.set('auth0_error', code)
  return url.toString()
}

export function publicAuth0Status(env: Env) {
  const cfg = resolveAuth0Config(env)
  return {
    enabled: cfg.enabled,
    providers: cfg.connections.map((id) => ({
      id,
      label: AUTH0_PROVIDERS[id].label,
      button_label: AUTH0_PROVIDERS[id].buttonLabel,
    })),
  }
}
