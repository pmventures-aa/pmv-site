import type { Env } from './types'
import { PUBLIC_SITE_URL } from '../../shared/letterhead'

export type Auth0ProviderId = 'google' | 'microsoft'

export interface Auth0ProviderConfig {
  id: Auth0ProviderId
  connection: string
  label: string
}

export interface Auth0Config {
  domain: string
  clientId: string
  clientSecret: string
  callbackUrl: string
  logoutUrl: string
  audience?: string
  providers: Auth0ProviderConfig[]
  issuer: string
}

const DEFAULT_PROVIDERS: Auth0ProviderConfig[] = [
  { id: 'google', connection: 'google-oauth2', label: 'Continue with Google' },
  { id: 'microsoft', connection: 'windowslive', label: 'Continue with Microsoft' },
]

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseEnabledConnections(raw: string | undefined): Set<string> | null {
  const value = trim(raw)
  if (!value) return null
  return new Set(
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  )
}

export function auth0IssuerFromDomain(domain: string): string {
  const host = domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  return `https://${host}/`
}

/**
 * Auth0 is enabled only when every required secret is present.
 * Partial configuration is treated as disabled so login buttons never appear
 * for a nonfunctional integration.
 */
export function getAuth0Config(env: Env): Auth0Config | null {
  if (trim(env.AUTH0_ENABLED).toLowerCase() === 'false') return null

  const domain = trim(env.AUTH0_DOMAIN)
  const clientId = trim(env.AUTH0_CLIENT_ID)
  const clientSecret = trim(env.AUTH0_CLIENT_SECRET)
  const callbackUrl = trim(env.AUTH0_CALLBACK_URL)
  if (!domain || !clientId || !clientSecret || !callbackUrl) return null

  try {
    const parsed = new URL(callbackUrl)
    if (!/^https?:$/i.test(parsed.protocol)) return null
  } catch {
    return null
  }

  const logoutUrl = trim(env.AUTH0_LOGOUT_URL) || `${PUBLIC_SITE_URL}/portal/login`
  const audience = trim(env.AUTH0_AUDIENCE) || undefined
  const enabled = parseEnabledConnections(env.AUTH0_CONNECTIONS)

  const googleConnection = trim(env.AUTH0_CONNECTION_GOOGLE) || 'google-oauth2'
  const microsoftConnection = trim(env.AUTH0_CONNECTION_MICROSOFT) || 'windowslive'

  const catalog: Auth0ProviderConfig[] = [
    { id: 'google', connection: googleConnection, label: 'Continue with Google' },
    { id: 'microsoft', connection: microsoftConnection, label: 'Continue with Microsoft' },
  ]

  const providers = catalog.filter((provider) => {
    if (!enabled) return DEFAULT_PROVIDERS.some((entry) => entry.id === provider.id)
    return enabled.has(provider.connection) || enabled.has(provider.id)
  })

  if (!providers.length) return null

  return {
    domain: domain.replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
    clientId,
    clientSecret,
    callbackUrl,
    logoutUrl,
    audience,
    providers,
    issuer: auth0IssuerFromDomain(domain),
  }
}

export function isAuth0Configured(env: Env): boolean {
  return getAuth0Config(env) !== null
}

export function findAuth0Provider(env: Env, connectionOrId: string): Auth0ProviderConfig | null {
  const config = getAuth0Config(env)
  if (!config) return null
  const key = connectionOrId.trim().toLowerCase()
  return (
    config.providers.find(
      (provider) => provider.connection.toLowerCase() === key || provider.id === key,
    ) || null
  )
}

/** Local + production callback / logout / origin values for Auth0 dashboard setup. */
export function auth0DashboardUrls(localOrigin = 'http://localhost:8788') {
  return {
    production: {
      baseUrl: PUBLIC_SITE_URL,
      callbackUrl: `${PUBLIC_SITE_URL}/api/auth/auth0/callback`,
      logoutUrl: `${PUBLIC_SITE_URL}/portal/login`,
      webOrigin: PUBLIC_SITE_URL,
    },
    local: {
      baseUrl: localOrigin,
      callbackUrl: `${localOrigin}/api/auth/auth0/callback`,
      logoutUrl: `${localOrigin}/portal/login`,
      webOrigin: localOrigin,
      viteProxyNote:
        'When using Vite on :5173 with the API proxy, also allow http://localhost:5173/api/auth/auth0/callback and http://localhost:5173/portal/login if Auth0 redirects through the frontend origin.',
    },
  }
}
