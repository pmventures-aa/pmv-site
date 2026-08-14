import type { CookieHandler, CookieSerializeOptions, StateData, StateStore } from '@auth0/auth0-server-js'

export interface Auth0StoreOptions {
  request: Request
  cookies: string[]
  capturedSession?: StateData
}

function serializeCookie(name: string, value: string, options: CookieSerializeOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  parts.push(`Path=${options.path || '/'}`)
  if (options.httpOnly !== false) parts.push('HttpOnly')
  parts.push('Secure')
  const sameSite = options.sameSite || 'lax'
  parts.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`)
  return parts.join('; ')
}

export function parseCookieHeader(header: string | null, name: string): string | undefined {
  if (!header) return undefined
  const match = header.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

export function parseAllCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 1) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key) out[key] = decodeURIComponent(value)
  }
  return out
}

export class HonoCookieHandler implements CookieHandler<Auth0StoreOptions> {
  setCookie(name: string, value: string, options?: CookieSerializeOptions, storeOptions?: Auth0StoreOptions) {
    if (!storeOptions) return
    storeOptions.cookies.push(serializeCookie(name, value, options))
  }
  getCookie(name: string, storeOptions?: Auth0StoreOptions) {
    return parseCookieHeader(storeOptions?.request.headers.get('Cookie') || null, name)
  }
  getCookies(storeOptions?: Auth0StoreOptions) {
    return parseAllCookies(storeOptions?.request.headers.get('Cookie') || null)
  }
  deleteCookie(name: string, storeOptions?: Auth0StoreOptions) {
    if (!storeOptions) return
    storeOptions.cookies.push(serializeCookie(name, '', { maxAge: 0, path: '/', httpOnly: true, sameSite: 'lax' }))
  }
}

export class DiscardingAuth0StateStore implements StateStore<Auth0StoreOptions> {
  async set(_identifier: string, state: StateData, _removeIfExists?: boolean, options?: Auth0StoreOptions) {
    if (options) options.capturedSession = state
  }
  async get(_identifier: string, options?: Auth0StoreOptions) {
    return options?.capturedSession
  }
  async delete(_identifier: string, options?: Auth0StoreOptions) {
    if (options) options.capturedSession = undefined
  }
  async deleteByLogoutToken() {
    // Local Pinnacle sessions are independent of Auth0 back-channel logout.
  }
}

export function applySetCookies(headers: Headers, cookies: string[]) {
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)
}
