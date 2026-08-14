import type { Context } from 'hono'
import type { CookieHandler, CookieSerializeOptions, StateData, StateStore, LogoutTokenClaims } from '@auth0/auth0-server-js'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { AppEnv } from '../types'

export interface Auth0StoreOptions {
  context: Context<AppEnv>
  ephemeral: Map<string, StateData>
}

function cookieOpts(options?: CookieSerializeOptions): Parameters<typeof setCookie>[3] {
  return {
    path: options?.path || '/',
    domain: options?.domain,
    httpOnly: options?.httpOnly !== false,
    secure: options?.secure !== false,
    sameSite: options?.sameSite || 'Lax',
    maxAge: options?.maxAge,
    expires: options?.expires,
  }
}

export class HonoCookieHandler implements CookieHandler<Auth0StoreOptions> {
  setCookie(name: string, value: string, options?: CookieSerializeOptions, storeOptions?: Auth0StoreOptions): void {
    if (!storeOptions?.context) return
    setCookie(storeOptions.context, name, value, cookieOpts(options))
  }

  getCookie(name: string, storeOptions?: Auth0StoreOptions): string | undefined {
    if (!storeOptions?.context) return undefined
    return getCookie(storeOptions.context, name)
  }

  getCookies(storeOptions?: Auth0StoreOptions): Record<string, string> {
    if (!storeOptions?.context) return {}
    return getCookie(storeOptions.context) || {}
  }

  deleteCookie(name: string, storeOptions?: Auth0StoreOptions, options?: CookieSerializeOptions): void {
    if (!storeOptions?.context) return
    deleteCookie(storeOptions.context, name, cookieOpts(options))
  }
}

/**
 * Holds Auth0 token-set data only for the current Worker isolate / request.
 * Tokens are never written to cookies, KV, localStorage, or sessionStorage.
 */
export class EphemeralStateStore implements StateStore<Auth0StoreOptions> {
  async set(identifier: string, state: StateData, _removeIfExists?: boolean, options?: Auth0StoreOptions): Promise<void> {
    options?.ephemeral.set(identifier, state)
  }

  async get(identifier: string, options?: Auth0StoreOptions): Promise<StateData | undefined> {
    return options?.ephemeral.get(identifier)
  }

  async delete(identifier: string, options?: Auth0StoreOptions): Promise<void> {
    options?.ephemeral.delete(identifier)
  }

  async deleteByLogoutToken(_claims: LogoutTokenClaims, options?: Auth0StoreOptions): Promise<void> {
    options?.ephemeral.clear()
  }
}

export function newStoreOptions(context: Context<AppEnv>): Auth0StoreOptions {
  return { context, ephemeral: new Map() }
}
