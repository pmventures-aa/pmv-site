import type { Env } from '../types'
import { PUBLIC_SITE_URL } from '../../../shared/letterhead'

export type Auth0ProviderId = 'google' | 'microsoft'

export interface Auth0ProviderConfig {
  id: Auth0ProviderId
  label: string
  connection: string
}

export interface Auth0RuntimeConfig {
  configured: boolean
  domain: string
  clientId: string
  clientSecret: string
  audience: string | null
  callbackUrl: string
  logoutUrl: string
  sessionSecret: string
  issuer: string
  providers: Auth0ProviderConfig[]
}

const PROVIDER_META: Record<Auth0ProviderId, { label: string; defaultConnection: string }> = {
  google: { label: 'Continue with Google', defaultConnection: 'google-oauth2' },
  microsoft: { label: 'Continue with Microsoft', defaultConnection: 'windowslive' },
}

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveCallbackUrl(env: Env): string {
  const explicit = trim(env.AUTH0_CALLBACK_URL)
  if (explicit) return explicit
  return `${PUBLIC_SITE_URL}/api/auth/auth0/callback`
}

function resolveLogoutUrl(env: Env): string {
  const explicit = trim(env.AUTH0_LOGOUT_URL)
  if (explicit) return explicit
  return `${PUBLIC_SITE_URL}/portal/login`
}

function resolveProviders(env: Env): Auth0ProviderConfig[] {
  const out: Auth0ProviderConfig[] = []
  const google = trim(env.AUTH0_CONNECTION_GOOGLE)
  if (google) {
    out.push({
      id: 'google',
      label: PROVIDER_META.google.label,
      connection: google === '1' || google.toLowerCase() === 'true'
        ? PROVIDER_META.google.defaultConnection
        : google,
    })
  }
  const microsoft = trim(env.AUTH0_CONNECTION_MICROSOFT)
  if (microsoft) {
    out.push({
      id: 'microsoft',
      label: PROVIDER_META.microsoft.label,
      connection: microsoft === '1' || microsoft.toLowerCase() === 'true'
        ? PROVIDER_META.microsoft.defaultConnection
        : microsoft,
    })
  }
  return out
}

/**
 * Auth0 is intentionally optional. Partial configuration never enables login
 * buttons or initiation routes — only a complete, valid config does.
 */
export function getAuth0Config(env: Env): Auth0RuntimeConfig {
  const domain = trim(env.AUTH0_DOMAIN).replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  const clientId = trim(env.AUTH0_CLIENT_ID)
  const clientSecret = trim(env.AUTH0_CLIENT_SECRET)
  const audience = trim(env.AUTH0_AUDIENCE) || null
  const callbackUrl = resolveCallbackUrl(env)
  const logoutUrl = resolveLogoutUrl(env)
  const sessionSecret = trim(env.AUTH0_SESSION_SECRET) || trim(env.SESSION_SECRET)
  const providers = resolveProviders(env)

  const configured = Boolean(domain && clientId && clientSecret && sessionSecret && callbackUrl)
  return {
    configured,
    domain,
    clientId,
    clientSecret,
    audience,
    callbackUrl,
    logoutUrl,
    sessionSecret,
    issuer: domain ? `https://${domain}/` : '',
    providers: configured ? providers : [],
  }
}

export function auth0ConfigIssues(env: Env): string[] {
  const domain = trim(env.AUTH0_DOMAIN)
  const clientId = trim(env.AUTH0_CLIENT_ID)
  const clientSecret = trim(env.AUTH0_CLIENT_SECRET)
  const any = Boolean(domain || clientId || clientSecret || trim(env.AUTH0_CALLBACK_URL) || trim(env.AUTH0_CONNECTION_GOOGLE) || trim(env.AUTH0_CONNECTION_MICROSOFT))
  if (!any) return []
  const issues: string[] = []
  if (!domain) issues.push('AUTH0_DOMAIN is required when Auth0 variables are set')
  if (!clientId) issues.push('AUTH0_CLIENT_ID is required when Auth0 variables are set')
  if (!clientSecret) issues.push('AUTH0_CLIENT_SECRET is required when Auth0 variables are set')
  if (!trim(env.AUTH0_SESSION_SECRET) && !trim(env.SESSION_SECRET)) {
    issues.push('AUTH0_SESSION_SECRET or SESSION_SECRET is required to encrypt Auth0 transaction cookies')
  }
  return issues
}

export function providerById(config: Auth0RuntimeConfig, id: string): Auth0ProviderConfig | null {
  return config.providers.find((p) => p.id === id) || null
}

export function providerByConnection(config: Auth0RuntimeConfig, connection: string): Auth0ProviderConfig | null {
  const key = connection.trim().toLowerCase()
  return config.providers.find((p) => p.connection.toLowerCase() === key) || null
}
