import type { Env } from './types'
import { PORTAL_WWW_LOGIN, PUBLIC_SITE_URL } from './appUrls'

export type Auth0ProviderKey = 'google' | 'microsoft'

export interface Auth0ProviderConfig {
  key: Auth0ProviderKey
  label: string
  connection: string
}

export interface Auth0Config {
  domain: string
  clientId: string
  clientSecret: string
  audience?: string
  callbackUrl: string
  logoutReturnUrl: string
  providers: Auth0ProviderConfig[]
}

const DEFAULT_CALLBACK = `${PUBLIC_SITE_URL}/api/auth/auth0/callback`
const DEFAULT_LOGOUT_RETURN = PORTAL_WWW_LOGIN

function clean(value: string | undefined): string {
  return (value || '').trim()
}

function parseProviders(env: Env): Auth0ProviderConfig[] {
  const providers: Auth0ProviderConfig[] = []
  const google = clean(env.AUTH0_CONNECTION_GOOGLE)
  const microsoft = clean(env.AUTH0_CONNECTION_MICROSOFT)
  if (google) providers.push({ key: 'google', label: 'Google', connection: google })
  if (microsoft) providers.push({ key: 'microsoft', label: 'Microsoft', connection: microsoft })
  return providers
}

export function isAuth0Configured(env: Env): boolean {
  return Boolean(clean(env.AUTH0_DOMAIN) && clean(env.AUTH0_CLIENT_ID) && clean(env.AUTH0_CLIENT_SECRET))
}

export function loadAuth0Config(env: Env): Auth0Config | null {
  if (!isAuth0Configured(env)) return null
  const domain = clean(env.AUTH0_DOMAIN).replace(/^https?:\/\//, '').replace(/\/$/, '')
  const clientId = clean(env.AUTH0_CLIENT_ID)
  const clientSecret = clean(env.AUTH0_CLIENT_SECRET)
  const audience = clean(env.AUTH0_AUDIENCE) || undefined
  const callbackUrl = clean(env.AUTH0_CALLBACK_URL) || DEFAULT_CALLBACK
  const logoutReturnUrl = clean(env.AUTH0_LOGOUT_URL) || DEFAULT_LOGOUT_RETURN
  const providers = parseProviders(env)
  return { domain, clientId, clientSecret, audience, callbackUrl, logoutReturnUrl, providers }
}

export function assertAuth0Config(env: Env): Auth0Config {
  const config = loadAuth0Config(env)
  if (!config) {
    throw new Error('Auth0 is not configured')
  }
  return config
}

export function auth0Issuer(config: Auth0Config): string {
  return `https://${config.domain}/`
}

export function auth0ProviderByConnection(config: Auth0Config, connection: string): Auth0ProviderConfig | null {
  const normalized = connection.trim().toLowerCase()
  return config.providers.find((provider) => provider.connection.toLowerCase() === normalized) || null
}

export function auth0ProviderByKey(config: Auth0Config, key: string): Auth0ProviderConfig | null {
  const normalized = key.trim().toLowerCase()
  return config.providers.find((provider) => provider.key === normalized) || null
}

export function validateAuth0Startup(env: Env): string[] {
  const warnings: string[] = []
  const partial = [env.AUTH0_DOMAIN, env.AUTH0_CLIENT_ID, env.AUTH0_CLIENT_SECRET].map(clean)
  const anySet = partial.some(Boolean)
  const allSet = partial.every(Boolean)
  if (anySet && !allSet) {
    warnings.push('Auth0 is partially configured; social sign-in stays disabled until AUTH0_DOMAIN, AUTH0_CLIENT_ID, and AUTH0_CLIENT_SECRET are all set.')
  }
  if (allSet && parseProviders(env).length === 0) {
    warnings.push('Auth0 is configured but no provider connections are enabled. Set AUTH0_CONNECTION_GOOGLE and/or AUTH0_CONNECTION_MICROSOFT.')
  }
  return warnings
}
