import type { Context } from 'hono'
import {
  CookieTransactionStore,
  ServerClient,
  type CookieHandler,
  type CookieSerializeOptions,
  type StateData,
  type StateStore,
  type LogoutTokenClaims,
} from '@auth0/auth0-server-js'
import type { AppEnv } from '../types'
import { getAuth0Config, type Auth0RuntimeConfig } from './config'

export interface Auth0StoreOptions {
  c: Context<AppEnv>
  /** Request-scoped Auth0 session payload — never written to cookies or KV. */
  memoryState: Map<string, StateData>
  /** Cookies queued by the Auth0 transaction store for this response. */
  pendingCookies: string[]
}

/**
 * Cookie handler for Auth0 transaction (state/PKCE) cookies only.
 * Auth0 ID/access/refresh tokens are held in RequestMemoryStateStore and
 * discarded at the end of the callback — they never reach the browser.
 */
export class HonoAuth0CookieHandler implements CookieHandler<Auth0StoreOptions> {
  getCookies(storeOptions?: Auth0StoreOptions): Record<string, string> {
    const raw = storeOptions?.c.req.header('Cookie') || ''
    const out: Record<string, string> = {}
    for (const part of raw.split(';')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1)
      try {
        out[key] = decodeURIComponent(value)
      } catch {
        out[key] = value
      }
    }
    return out
  }

  getCookie(name: string, storeOptions?: Auth0StoreOptions): string | undefined {
    return this.getCookies(storeOptions)[name]
  }

  setCookie(name: string, value: string, options?: CookieSerializeOptions, storeOptions?: Auth0StoreOptions): void {
    if (!storeOptions) return
    storeOptions.pendingCookies.push(serializeCookie(name, value, options))
  }

  deleteCookie(name: string, storeOptions?: Auth0StoreOptions, options?: CookieSerializeOptions): void {
    if (!storeOptions) return
    storeOptions.pendingCookies.push(serializeCookie(name, '', { ...options, maxAge: 0 }))
  }
}

/**
 * Holds Auth0 token/session state only for the duration of a single Worker
 * request (callback). Nothing is persisted to cookies, KV, or D1.
 */
export class RequestMemoryStateStore implements StateStore<Auth0StoreOptions> {
  async set(identifier: string, state: StateData, _removeIfExists?: boolean, options?: Auth0StoreOptions): Promise<void> {
    if (!options) throw new Error('Auth0 store options required')
    options.memoryState.set(identifier, state)
  }

  async get(identifier: string, options?: Auth0StoreOptions): Promise<StateData | undefined> {
    return options?.memoryState.get(identifier)
  }

  async delete(identifier: string, options?: Auth0StoreOptions): Promise<void> {
    options?.memoryState.delete(identifier)
  }

  async deleteByLogoutToken(_claims: LogoutTokenClaims, options?: Auth0StoreOptions): Promise<void> {
    options?.memoryState.clear()
  }
}

function serializeCookie(name: string, value: string, options?: CookieSerializeOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  const path = options?.path || '/'
  parts.push(`Path=${path}`)
  if (options?.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  if (options?.expires) parts.push(`Expires=${options.expires.toUTCString()}`)
  if (options?.httpOnly !== false) parts.push('HttpOnly')
  if (options?.secure !== false) parts.push('Secure')
  const sameSite = options?.sameSite
  if (typeof sameSite === 'string') {
    const normalized = sameSite.toLowerCase()
    if (normalized === 'lax' || normalized === 'strict' || normalized === 'none') {
      parts.push(`SameSite=${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`)
    } else {
      parts.push('SameSite=Lax')
    }
  } else {
    parts.push('SameSite=Lax')
  }
  if (options?.domain) parts.push(`Domain=${options.domain}`)
  return parts.join('; ')
}

export function createAuth0StoreOptions(c: Context<AppEnv>): Auth0StoreOptions {
  return { c, memoryState: new Map(), pendingCookies: [] }
}

export function applyAuth0Cookies(c: Context<AppEnv>, store: Auth0StoreOptions, extra?: string[]): void {
  const cookies = [...store.pendingCookies, ...(extra || [])]
  for (const cookie of cookies) c.header('Set-Cookie', cookie, { append: true })
}

export function createAuth0Client(config: Auth0RuntimeConfig): ServerClient<Auth0StoreOptions> {
  const cookieHandler = new HonoAuth0CookieHandler()
  const authorizationParams: Record<string, string> = {
    redirect_uri: config.callbackUrl,
    scope: 'openid profile email',
  }
  if (config.audience) authorizationParams.audience = config.audience

  return new ServerClient<Auth0StoreOptions>({
    domain: config.domain,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authorizationParams,
    transactionStore: new CookieTransactionStore(
      { secret: config.sessionSecret },
      cookieHandler,
    ),
    stateStore: new RequestMemoryStateStore(),
  })
}

export function auth0ClientForEnv(env: AppEnv['Bindings']): { config: Auth0RuntimeConfig; client: ServerClient<Auth0StoreOptions> } | null {
  const config = getAuth0Config(env)
  if (!config.configured) return null
  return { config, client: createAuth0Client(config) }
}
