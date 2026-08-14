import type {
  CookieHandler,
  CookieSerializeOptions,
  StateData,
  StateStore,
  TransactionData,
} from '@auth0/auth0-server-js'

export interface Auth0StoreOptions {
  cookieHeader: string
  outgoing: string[]
  capturedState?: StateData
}

function serializeCookie(name: string, value: string, options?: CookieSerializeOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  const path = options?.path || '/'
  parts.push(`Path=${path}`)
  if (options?.maxAge != null) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  if (options?.expires) parts.push(`Expires=${options.expires.toUTCString()}`)
  if (options?.domain) parts.push(`Domain=${options.domain}`)
  if (options?.httpOnly !== false) parts.push('HttpOnly')
  if (options?.secure !== false) parts.push('Secure')
  parts.push(`SameSite=${(options?.sameSite || 'lax').replace(/^./, (ch) => ch.toUpperCase())}`)
  return parts.join('; ')
}

function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 1) continue
    const name = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!name) continue
    try {
      out[name] = decodeURIComponent(value)
    } catch {
      out[name] = value
    }
  }
  return out
}

export class HonoCookieHandler implements CookieHandler<Auth0StoreOptions> {
  setCookie(name: string, value: string, options?: CookieSerializeOptions, storeOptions?: Auth0StoreOptions) {
    if (!storeOptions) return
    storeOptions.outgoing.push(serializeCookie(name, value, options))
  }

  getCookie(name: string, storeOptions?: Auth0StoreOptions) {
    if (!storeOptions) return undefined
    return parseCookieHeader(storeOptions.cookieHeader)[name]
  }

  getCookies(storeOptions?: Auth0StoreOptions) {
    if (!storeOptions) return {}
    return parseCookieHeader(storeOptions.cookieHeader)
  }

  deleteCookie(name: string, storeOptions?: Auth0StoreOptions, options?: CookieSerializeOptions) {
    if (!storeOptions) return
    storeOptions.outgoing.push(serializeCookie(name, '', { ...options, maxAge: 0, expires: new Date(0) }))
  }
}

export class EphemeralStateStore implements StateStore<Auth0StoreOptions> {
  async set(_identifier: string, state: StateData, _removeIfExists?: boolean, options?: Auth0StoreOptions) {
    if (options) options.capturedState = state
  }

  async get(_identifier: string, options?: Auth0StoreOptions) {
    return options?.capturedState
  }

  async delete(_identifier: string, options?: Auth0StoreOptions) {
    if (options) options.capturedState = undefined
  }

  async deleteByLogoutToken() {
    // Auth0 tokens are never persisted, so federated logout has nothing to revoke here.
  }
}

export function newStoreOptions(request: Request): Auth0StoreOptions {
  return { cookieHeader: request.headers.get('Cookie') || '', outgoing: [] }
}

export function applyStoreCookies(headers: Headers, storeOptions: Auth0StoreOptions) {
  for (const cookie of storeOptions.outgoing) headers.append('Set-Cookie', cookie)
}

export type { TransactionData, StateData }
