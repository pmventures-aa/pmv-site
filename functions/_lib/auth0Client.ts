import type { Context } from 'hono'
import {
  CookieTransactionStore,
  ServerClient,
  StatelessStateStore,
  type CookieHandler,
  type CookieSerializeOptions,
  type SessionData,
  type UserClaims,
} from '@auth0/auth0-server-js'
import type { AppEnv } from './types'
import { getAuth0Config, type Auth0Config } from './auth0Config'

export type Auth0StoreOptions = {
  request: Request
  cookieJar: string[]
}

export type Auth0AppState = {
  intent: 'login' | 'link'
  returnTo?: string
  connection?: string
  providerId?: string
  userId?: string
  surface?: 'client' | 'staff'
}

function serializeCookie(name: string, value: string, options: CookieSerializeOptions = {}): string {
  const parts = [`${name}=${value}`]
  if (options.maxAge != null) parts.push(`Max-Age=${Math.floor(options.maxAge)}`)
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`)
  if (options.path) parts.push(`Path=${options.path}`)
  if (options.domain) parts.push(`Domain=${options.domain}`)
  if (options.secure) parts.push('Secure')
  if (options.httpOnly) parts.push('HttpOnly')
  if (options.sameSite) {
    const sameSite = options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1)
    parts.push(`SameSite=${sameSite}`)
  }
  return parts.join('; ')
}

export class HonoCookieHandler implements CookieHandler<Auth0StoreOptions> {
  setCookie(name: string, value: string, options?: CookieSerializeOptions, storeOptions?: Auth0StoreOptions): void {
    if (!storeOptions) return
    storeOptions.cookieJar.push(serializeCookie(name, value, options))
  }

  getCookie(name: string, storeOptions?: Auth0StoreOptions): string | undefined {
    if (!storeOptions) return undefined
    const cookie = storeOptions.request.headers.get('Cookie') || ''
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
    return match?.[1]
  }

  getCookies(storeOptions?: Auth0StoreOptions): Record<string, string> {
    if (!storeOptions) return {}
    const header = storeOptions.request.headers.get('Cookie') || ''
    const out: Record<string, string> = {}
    for (const part of header.split(';')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
    }
    return out
  }

  deleteCookie(name: string, storeOptions?: Auth0StoreOptions, options?: CookieSerializeOptions): void {
    if (!storeOptions) return
    storeOptions.cookieJar.push(
      serializeCookie(name, '', {
        ...options,
        maxAge: 0,
        path: options?.path || '/',
      }),
    )
  }
}

/**
 * State store that keeps Auth0 tokens only for the duration of the callback
 * handling. Tokens are never written to localStorage/sessionStorage and are
 * cleared immediately after we map the identity to a Pinnacle session.
 */
class EphemeralMemoryStateStore extends StatelessStateStore<Auth0StoreOptions> {
  constructor(secret: string, cookieHandler: CookieHandler<Auth0StoreOptions>) {
    super({ secret }, cookieHandler)
  }
}

export function createAuth0StoreOptions(request: Request): Auth0StoreOptions {
  return { request, cookieJar: [] }
}

export function applyAuth0Cookies(c: Context<AppEnv>, storeOptions: Auth0StoreOptions) {
  for (const cookie of storeOptions.cookieJar) {
    c.header('Set-Cookie', cookie, { append: true })
  }
}

export function createAuth0Client(config: Auth0Config, sessionSecret: string): ServerClient<Auth0StoreOptions> {
  const cookieHandler = new HonoCookieHandler()
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
    transactionStore: new CookieTransactionStore({ secret: sessionSecret }, cookieHandler),
    stateStore: new EphemeralMemoryStateStore(sessionSecret, cookieHandler),
  })
}

export function auth0ClientFromEnv(env: AppEnv['Bindings']): { config: Auth0Config; client: ServerClient<Auth0StoreOptions> } | null {
  const config = getAuth0Config(env)
  if (!config) return null
  if (!env.SESSION_SECRET) return null
  return { config, client: createAuth0Client(config, env.SESSION_SECRET) }
}

export async function readAuth0User(
  client: ServerClient<Auth0StoreOptions>,
  storeOptions: Auth0StoreOptions,
): Promise<{ user: UserClaims; session: SessionData } | null> {
  const session = await client.getSession(storeOptions)
  if (!session?.user?.sub) return null
  return { user: session.user, session }
}

export async function clearAuth0SdkSession(
  client: ServerClient<Auth0StoreOptions>,
  storeOptions: Auth0StoreOptions,
  returnTo: string,
): Promise<URL | null> {
  try {
    return await client.logout({ returnTo }, storeOptions)
  } catch {
    return null
  }
}

export function claimsIssuer(user: UserClaims, fallbackIssuer: string): string {
  const iss = typeof user.iss === 'string' ? user.iss : ''
  if (iss) return iss.endsWith('/') ? iss : `${iss}/`
  return fallbackIssuer.endsWith('/') ? fallbackIssuer : `${fallbackIssuer}/`
}
