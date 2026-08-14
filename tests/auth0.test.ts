import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Env } from '../functions/_lib/types'

vi.mock('oauth4webapi', () => ({
  generateRandomCodeVerifier: () => 'verifier',
  calculatePKCECodeChallenge: async () => 'challenge',
  discoveryRequest: vi.fn(),
  processDiscoveryResponse: vi.fn(),
  validateAuthResponse: vi.fn(),
  authorizationCodeGrantRequest: vi.fn(),
  processAuthorizationCodeResponse: vi.fn(),
  getValidatedIdTokenClaims: vi.fn(),
  ClientSecretPost: vi.fn(() => vi.fn()),
}))
import {
  isAuth0Configured,
  loadAuth0Config,
  validateAuth0Startup,
  auth0ProviderByKey,
} from '../functions/_lib/auth0Config'
import {
  sanitizeReturnPath,
  loginErrorRedirect,
} from '../functions/_lib/auth0Redirect'
import {
  roleAllowedForSurface,
  loginPathForSurface,
  defaultReturnForSurface,
} from '../functions/_lib/auth0Access'
import {
  userCanUnlinkIdentity,
  userHasPassword,
  findExternalIdentityByIssuerSubject,
  insertExternalIdentity,
  deleteExternalIdentity,
} from '../functions/_lib/auth0Identities'
import {
  consumeTransaction,
  createAuth0LoginRequest,
  completeAuth0Callback,
} from '../functions/_lib/auth0OAuth'
import * as oauth from 'oauth4webapi'

function kvStore(): { data: Map<string, string>; env: Env['SESSIONS'] } {
  const data = new Map<string, string>()
  const env = {
    get: vi.fn(async (key: string) => data.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { data.set(key, value) }),
    delete: vi.fn(async (key: string) => { data.delete(key) }),
    list: vi.fn(async () => ({ keys: [] })),
  } as unknown as Env['SESSIONS']
  return { data, env }
}

function db(bindings: unknown[][] = []) {
  const firstResults = new Map<string, unknown>()
  let lastInsertedId = 'id-1'
  return {
    bindings,
    prepare: vi.fn((sql: string) => ({
      bind: (...values: unknown[]) => {
        bindings.push(values)
        return {
          first: vi.fn(async () => {
            if (/issuer = \? AND subject = \?/.test(sql)) {
              const key = `${values[0]}:${values[1]}`
              return firstResults.get(`identity:${key}`) ?? null
            }
            if (/password_hash FROM users/.test(sql)) {
              return firstResults.get(`password:${values[0]}`) ?? { password_hash: null }
            }
            if (/COUNT\(\*\)/.test(sql)) {
              return firstResults.get(`count:${values[0]}`) ?? { n: 0 }
            }
            if (/SELECT \* FROM external_identities WHERE id = \?/.test(sql)) {
              return firstResults.get(`created:${values[0]}`) ?? firstResults.get(`created:${lastInsertedId}`) ?? null
            }
            return null
          }),
          run: vi.fn(async () => {
            if (/INSERT INTO external_identities/.test(sql)) {
              lastInsertedId = String(values[0])
              firstResults.set(`created:${lastInsertedId}`, {
                id: values[0],
                user_id: values[1],
                provider: values[2],
                connection: values[3],
                issuer: values[4],
                subject: values[5],
                email: values[6],
                email_verified: values[7],
                created_at: 'now',
                last_login_at: 'now',
              })
            }
            return { meta: { changes: 1 } }
          }),
          all: vi.fn(async () => ({ results: [] })),
        }
      },
    })),
    setIdentity(issuer: string, subject: string, row: Record<string, unknown> | null) {
      firstResults.set(`identity:${issuer}:${subject}`, row)
    },
    setPassword(userId: string, hash: string | null) {
      firstResults.set(`password:${userId}`, { password_hash: hash })
    },
    setIdentityCount(userId: string, n: number) {
      firstResults.set(`count:${userId}`, { n })
    },
  }
}

const baseEnv = {
  AUTH0_DOMAIN: 'tenant.us.auth0.com',
  AUTH0_CLIENT_ID: 'client-id',
  AUTH0_CLIENT_SECRET: 'client-secret',
  AUTH0_CONNECTION_GOOGLE: 'google-oauth2',
  AUTH0_CONNECTION_MICROSOFT: 'windowslive',
  AUTH0_CALLBACK_URL: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback',
  AUTH0_LOGOUT_URL: 'https://www.pinnaclemanagementventures.com/portal/login',
} as Env

describe('Auth0 configuration', () => {
  it('detects when Auth0 is fully configured', () => {
    expect(isAuth0Configured(baseEnv)).toBe(true)
    const config = loadAuth0Config(baseEnv)
    expect(config?.providers).toHaveLength(2)
    expect(auth0ProviderByKey(config!, 'google')?.connection).toBe('google-oauth2')
  })

  it('fails safely when configuration is missing', () => {
    expect(isAuth0Configured({ SESSION_SECRET: 'x', PAYMENT_ENCRYPTION_KEY: 'y' } as Env)).toBe(false)
    expect(loadAuth0Config({ SESSION_SECRET: 'x', PAYMENT_ENCRYPTION_KEY: 'y' } as Env)).toBeNull()
  })

  it('warns on partial configuration and missing providers', () => {
    const partialWarnings = validateAuth0Startup({
      ...baseEnv,
      AUTH0_CLIENT_SECRET: '',
    } as Env)
    expect(partialWarnings.some((w) => /partially configured/i.test(w))).toBe(true)

    const providerWarnings = validateAuth0Startup({
      ...baseEnv,
      AUTH0_CONNECTION_GOOGLE: '',
      AUTH0_CONNECTION_MICROSOFT: '',
    } as Env)
    expect(providerWarnings.some((w) => /no provider connections/i.test(w))).toBe(true)
  })
})

describe('Auth0 redirect safety', () => {
  it('allows internal portal paths only for client surface', () => {
    expect(sanitizeReturnPath('/portal/security', '/portal/', 'client')).toBe('/portal/security')
    expect(sanitizeReturnPath('/portal/services/bookkeeping/apply', '/portal/', 'client')).toBe('/portal/services/bookkeeping/apply')
    expect(sanitizeReturnPath('https://evil.example/phish', '/portal/', 'client')).toBe('/portal/')
    expect(sanitizeReturnPath('/admin/users', '/portal/', 'client')).toBe('/portal/')
  })

  it('allows HQ and vendor workspace paths for staff surface', () => {
    expect(sanitizeReturnPath('/admin/security-center', '/admin/', 'staff')).toBe('/admin/security-center')
    expect(sanitizeReturnPath('/hq/field-work/mine', '/admin/', 'staff')).toBe('/hq/field-work/mine')
    expect(sanitizeReturnPath('/portal/login', '/admin/', 'staff')).toBe('/admin/')
  })

  it('routes login errors to the correct surface login page', () => {
    const clientUrl = loginErrorRedirect('account_not_linked', 'client')
    const staffUrl = loginErrorRedirect('account_not_linked', 'staff')
    expect(clientUrl).toContain('/portal/login')
    expect(staffUrl).toContain('/admin/login')
  })

  it('scopes roles to the correct login surface', () => {
    expect(roleAllowedForSurface('client', 'client')).toBe(true)
    expect(roleAllowedForSurface('staff', 'client')).toBe(false)
    expect(roleAllowedForSurface('staff', 'staff')).toBe(true)
    expect(roleAllowedForSurface('admin', 'staff')).toBe(true)
    expect(roleAllowedForSurface('trusted_contact', 'client')).toBe(true)
    expect(defaultReturnForSurface('staff')).toBe('/admin/')
    expect(loginPathForSurface('staff')).toBe('/admin/login')
  })
})

describe('Auth0 identity persistence', () => {
  it('prevents unlinking the final authentication method without a password', async () => {
    const database = db()
    database.setPassword('user-1', null)
    database.setIdentityCount('user-1', 1)
    const env = { DB: database as unknown as Env['DB'] } as Env
    expect(await userCanUnlinkIdentity(env, 'user-1')).toBe(false)
    database.setPassword('user-1', 'hash')
    expect(await userCanUnlinkIdentity(env, 'user-1')).toBe(true)
  })

  it('allows unlinking when another identity remains', async () => {
    const database = db()
    database.setPassword('user-1', null)
    database.setIdentityCount('user-1', 2)
    const env = { DB: database as unknown as Env['DB'] } as Env
    expect(await userCanUnlinkIdentity(env, 'user-1')).toBe(true)
  })

  it('stores identities keyed by issuer and subject', async () => {
    const database = db()
    const env = { DB: database as unknown as Env['DB'] } as Env
    const row = await insertExternalIdentity(env, {
      userId: 'user-1',
      claims: {
        issuer: 'https://tenant.us.auth0.com/',
        subject: 'google-oauth2|abc',
        connection: 'google-oauth2',
        email: 'client@example.com',
        emailVerified: true,
      },
    })
    expect(row.user_id).toBe('user-1')
    expect(await userHasPassword(env, 'user-1')).toBe(false)
    expect(await deleteExternalIdentity(env, row.id, 'user-1')).toBe(true)
  })
})

describe('Auth0 OAuth transaction handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates and consumes a one-time login transaction', async () => {
    const { env } = kvStore()
    const config = loadAuth0Config({ ...baseEnv, SESSIONS: env } as Env)!
    vi.mocked(oauth.discoveryRequest).mockResolvedValue(new Response(JSON.stringify({
      issuer: 'https://tenant.us.auth0.com/',
      authorization_endpoint: 'https://tenant.us.auth0.com/authorize',
      token_endpoint: 'https://tenant.us.auth0.com/oauth/token',
      jwks_uri: 'https://tenant.us.auth0.com/.well-known/jwks.json',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.mocked(oauth.processDiscoveryResponse).mockImplementation(async (_issuer, response) => response.json())

    const { authorizeUrl, state } = await createAuth0LoginRequest({ ...baseEnv, SESSIONS: env } as Env, config, {
      connection: 'google-oauth2',
      returnTo: '/portal/',
      mode: 'login',
      surface: 'client',
    })
    expect(authorizeUrl).toContain('connection=google-oauth2')
    expect(authorizeUrl).toContain(`state=${state}`)
    const tx = await consumeTransaction({ ...baseEnv, SESSIONS: env } as Env, state)
    expect(tx?.mode).toBe('login')
    expect(await consumeTransaction({ ...baseEnv, SESSIONS: env } as Env, state)).toBeNull()
  })

  it('rejects replayed callbacks after the transaction is consumed', async () => {
    const { env } = kvStore()
    const config = loadAuth0Config({ ...baseEnv, SESSIONS: env } as Env)!
    const tx = {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'verifier',
      returnTo: '/portal/',
      connection: 'google-oauth2',
      mode: 'login' as const,
      createdAt: Date.now(),
    }
    await env.put('auth0tx:state-1', JSON.stringify(tx))
    expect(await consumeTransaction({ ...baseEnv, SESSIONS: env } as Env, 'state-1')).toBeTruthy()
    expect(await consumeTransaction({ ...baseEnv, SESSIONS: env } as Env, 'state-1')).toBeNull()
    expect(config.callbackUrl).toContain('/api/auth/auth0/callback')
  })

  it('validates callback tokens through the OAuth SDK boundary', async () => {
    const config = loadAuth0Config(baseEnv)!
    const tx = {
      state: 'state-2',
      nonce: 'nonce-2',
      codeVerifier: 'verifier-2',
      returnTo: '/portal/',
      connection: 'google-oauth2',
      mode: 'login' as const,
      createdAt: Date.now(),
    }
    vi.mocked(oauth.validateAuthResponse).mockReturnValue(new URLSearchParams({ code: 'abc' }))
    vi.mocked(oauth.authorizationCodeGrantRequest).mockResolvedValue(new Response('{}', { status: 200 }))
    vi.mocked(oauth.processAuthorizationCodeResponse).mockResolvedValue({
      access_token: 'at',
      token_type: 'bearer',
      id_token: 'idtoken',
    })
    vi.mocked(oauth.getValidatedIdTokenClaims).mockReturnValue({
      iss: 'https://tenant.us.auth0.com/',
      sub: 'google-oauth2|person',
      aud: 'client-id',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: 'client@example.com',
      email_verified: true,
    })
    vi.mocked(oauth.discoveryRequest).mockResolvedValue(new Response('{}', { status: 200 }))
    vi.mocked(oauth.processDiscoveryResponse).mockResolvedValue({
      issuer: 'https://tenant.us.auth0.com/',
      authorization_endpoint: 'https://tenant.us.auth0.com/authorize',
      token_endpoint: 'https://tenant.us.auth0.com/oauth/token',
      jwks_uri: 'https://tenant.us.auth0.com/.well-known/jwks.json',
    } as oauth.AuthorizationServer)

    const result = await completeAuth0Callback(
      { ...baseEnv, SESSIONS: kvStore().env } as Env,
      config,
      new URL('https://www.pinnaclemanagementventures.com/api/auth/auth0/callback?code=abc&state=state-2'),
      tx,
    )
    expect(result.claims.subject).toBe('google-oauth2|person')
    expect(result.claims.emailVerified).toBe(true)
  })

  it('rejects invalid nonce or token validation failures', async () => {
    const config = loadAuth0Config(baseEnv)!
    const tx = {
      state: 'state-3',
      nonce: 'nonce-3',
      codeVerifier: 'verifier-3',
      returnTo: '/portal/',
      connection: 'google-oauth2',
      mode: 'login' as const,
      createdAt: Date.now() - 11 * 60 * 1000,
    }
    vi.mocked(oauth.validateAuthResponse).mockReturnValue(new URLSearchParams({ code: 'abc' }))
    vi.mocked(oauth.authorizationCodeGrantRequest).mockResolvedValue(new Response('{}', { status: 200 }))
    vi.mocked(oauth.processAuthorizationCodeResponse).mockResolvedValue({ access_token: 'at', token_type: 'bearer' })
    vi.mocked(oauth.getValidatedIdTokenClaims).mockReturnValue(undefined)
    vi.mocked(oauth.discoveryRequest).mockResolvedValue(new Response('{}', { status: 200 }))
    vi.mocked(oauth.processDiscoveryResponse).mockResolvedValue({
      issuer: 'https://tenant.us.auth0.com/',
      authorization_endpoint: 'https://tenant.us.auth0.com/authorize',
      token_endpoint: 'https://tenant.us.auth0.com/oauth/token',
      jwks_uri: 'https://tenant.us.auth0.com/.well-known/jwks.json',
    } as oauth.AuthorizationServer)

    await expect(completeAuth0Callback(
      { ...baseEnv, SESSIONS: kvStore().env } as Env,
      config,
      new URL('https://www.pinnaclemanagementventures.com/api/auth/auth0/callback?code=abc&state=state-3'),
      tx,
    )).rejects.toThrow(/id token validation failed|transaction expired/)
  })
})

describe('Auth0 identity lookup', () => {
  it('does not auto-link by email alone', async () => {
    const database = db()
    database.setIdentity('https://tenant.us.auth0.com/', 'google-oauth2|new-user', null as unknown as Record<string, unknown>)
    const env = { DB: database as unknown as Env['DB'] } as Env
    const found = await findExternalIdentityByIssuerSubject(env, 'https://tenant.us.auth0.com/', 'google-oauth2|new-user')
    expect(found).toBeNull()
  })
})

describe('client portal login UI', () => {
  it('renders compact provider controls on client and staff login surfaces', async () => {
    const { readFileSync } = await import('node:fs')
    const login = readFileSync(new URL('../src/pages/auth/Login.tsx', import.meta.url), 'utf8')
    expect(login).toContain('Auth0Providers')
    expect(login).toContain('compact')
    expect(login).toContain('surface={surface}')
    expect(login).not.toContain("surface === 'client' && <Auth0Providers")
  })
})
