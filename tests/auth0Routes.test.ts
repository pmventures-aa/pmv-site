import { describe, expect, it, afterEach, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv, Env } from '../functions/_lib/types'
import { auth0Routes } from '../functions/_lib/routes/auth0'
import { setAuth0ClientFactory } from '../functions/_lib/auth0Client'
import {
  buildAuth0Transaction,
  consumeAuth0Transaction,
  newAuth0State,
  saveAuth0Transaction,
} from '../functions/_lib/auth0Transaction'

type KvEntry = { value: string }

function memoryKv() {
  const store = new Map<string, KvEntry>()
  return {
    store,
    async get(key: string) {
      return store.get(key)?.value ?? null
    },
    async put(key: string, value: string) {
      store.set(key, { value })
    },
    async delete(key: string) {
      store.delete(key)
    },
    async list({ prefix }: { prefix?: string } = {}) {
      const keys = [...store.keys()]
        .filter((name) => !prefix || name.startsWith(prefix))
        .map((name) => ({ name }))
      return { keys }
    },
  }
}

function memoryDb() {
  const users = new Map<string, Record<string, unknown>>()
  const identities = new Map<string, Record<string, unknown>>()
  const prepare = (sql: string) => {
    let binds: unknown[] = []
    const stmt = {
      bind(...args: unknown[]) {
        binds = args
        return stmt
      },
      async first() {
        if (/FROM users WHERE id = \?/.test(sql)) return users.get(String(binds[0])) || null
        if (/FROM users WHERE email = \?/.test(sql)) {
          return [...users.values()].find((u) => u.email === binds[0]) || null
        }
        if (/FROM external_identities WHERE issuer = \? AND subject = \?/.test(sql)) {
          return [...identities.values()].find((r) => r.issuer === binds[0] && r.subject === binds[1]) || null
        }
        if (/SELECT password_hash FROM users/.test(sql)) {
          const u = users.get(String(binds[0]))
          return u ? { password_hash: u.password_hash } : null
        }
        return null
      },
      async all() {
        if (/FROM external_identities WHERE user_id = \?/.test(sql)) {
          return { results: [...identities.values()].filter((r) => r.user_id === binds[0]) }
        }
        return { results: [] }
      },
      async run() {
        if (/INSERT INTO users/.test(sql)) {
          const [id, email, , role, full_name, first_name, last_name] = binds
          users.set(String(id), {
            id, email, role, full_name, first_name, last_name, status: 'active', password_hash: null,
          })
        }
        if (/INSERT INTO external_identities/.test(sql)) {
          const [id, user_id, provider, connection_name, issuer, subject, provider_email, email_verified] = binds
          identities.set(String(id), {
            id, user_id, provider, connection_name, issuer, subject, provider_email, email_verified,
            created_at: 'now', last_login_at: 'now',
          })
        }
      },
    }
    return stmt
  }
  return {
    prepare,
    async batch(items: Array<{ run: () => Promise<unknown> }>) {
      for (const item of items) await item.run()
    },
  }
}

function makeApp() {
  const app = new Hono<AppEnv>()
  app.route('/auth', auth0Routes)
  return app
}

function baseEnv() {
  const DB = memoryDb()
  const SESSIONS = memoryKv()
  const env: Env & { _sessions: ReturnType<typeof memoryKv> } = {
    DB: DB as unknown as D1Database,
    SESSIONS: SESSIONS as unknown as KVNamespace,
    SESSION_SECRET: 'test-secret',
    PAYMENT_ENCRYPTION_KEY: 'pay',
    AUTH0_DOMAIN: 'tenant.auth0.com',
    AUTH0_CLIENT_ID: 'client',
    AUTH0_CLIENT_SECRET: 'secret',
    AUTH0_CALLBACK_URL: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback',
    AUTH0_LOGOUT_URL: 'https://www.pinnaclemanagementventures.com/portal/login',
    _sessions: SESSIONS,
  }
  return env
}

describe('Auth0 HTTP routes', () => {
  afterEach(() => setAuth0ClientFactory(null))

  it('returns status without providers when Auth0 is disabled', async () => {
    const env: Env = {
      DB: memoryDb() as unknown as D1Database,
      SESSIONS: memoryKv() as unknown as KVNamespace,
      SESSION_SECRET: 'x',
      PAYMENT_ENCRYPTION_KEY: 'y',
    }
    const res = await makeApp().request('http://localhost/auth/auth0/status', {}, env)
    expect(res.status).toBe(200)
    const body = await res.json() as { enabled: boolean; providers: unknown[] }
    expect(body.enabled).toBe(false)
    expect(body.providers).toEqual([])
  })

  it('initiates Auth0 login through the official SDK boundary', async () => {
    const buildAuthorizationUrl = vi.fn(async () => ({
      authorizationUrl: new URL('https://tenant.auth0.com/authorize?state=s1'),
      codeVerifier: 'verifier-1',
    }))
    setAuth0ClientFactory(() => ({ buildAuthorizationUrl, getTokenByCode: vi.fn() }) as never)
    const env = baseEnv()
    const res = await makeApp().request('http://localhost/auth/auth0/login?connection=google-oauth2&returnTo=/portal', {}, env)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('https://tenant.auth0.com/authorize')
    expect(buildAuthorizationUrl).toHaveBeenCalled()
  })

  it('rejects invalid state on callback', async () => {
    const env = baseEnv()
    const res = await makeApp().request('http://localhost/auth/auth0/callback?code=abc&state=missing', {}, env)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('auth0_error=invalid_state')
  })

  it('rejects nonce mismatch after token exchange', async () => {
    const getTokenByCode = vi.fn(async () => ({
      claims: {
        iss: 'https://tenant.auth0.com/',
        sub: 'google-oauth2|1',
        email: 'a@example.com',
        email_verified: true,
        nonce: 'wrong-nonce',
      },
    }))
    setAuth0ClientFactory(() => ({ buildAuthorizationUrl: vi.fn(), getTokenByCode }) as never)
    const env = baseEnv()
    const state = newAuth0State()
    await saveAuth0Transaction(env, state, buildAuth0Transaction({
      codeVerifier: 'v',
      nonce: 'expected-nonce',
      returnTo: '/portal',
      mode: 'login',
      connection: 'google-oauth2',
    }))
    const res = await makeApp().request(`http://localhost/auth/auth0/callback?code=abc&state=${state}`, {}, env)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('auth0_error=nonce_invalid')
  })

  it('rejects token validation failures', async () => {
    setAuth0ClientFactory(() => ({
      buildAuthorizationUrl: vi.fn(),
      getTokenByCode: vi.fn(async () => { throw new Error('invalid token') }),
    }) as never)
    const env = baseEnv()
    const state = newAuth0State()
    await saveAuth0Transaction(env, state, buildAuth0Transaction({
      codeVerifier: 'v',
      nonce: 'n',
      returnTo: '/portal',
      mode: 'login',
      connection: 'google-oauth2',
    }))
    const res = await makeApp().request(`http://localhost/auth/auth0/callback?code=abc&state=${state}`, {}, env)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('auth0_error=token_invalid')
  })

  it('completes a successful Auth0 callback into a Pinnacle session cookie', async () => {
    const getTokenByCode = vi.fn(async () => ({
      claims: {
        iss: 'https://tenant.auth0.com/',
        sub: 'google-oauth2|42',
        email: 'new.user@example.com',
        email_verified: true,
        nonce: 'good-nonce',
        given_name: 'New',
        family_name: 'User',
      },
      accessToken: 'access-should-not-persist',
      idToken: 'id-should-not-persist',
      refreshToken: 'refresh-should-not-persist',
    }))
    setAuth0ClientFactory(() => ({ buildAuthorizationUrl: vi.fn(), getTokenByCode }) as never)
    const env = baseEnv()
    const state = newAuth0State()
    await saveAuth0Transaction(env, state, buildAuth0Transaction({
      codeVerifier: 'v',
      nonce: 'good-nonce',
      returnTo: '/portal',
      mode: 'login',
      connection: 'google-oauth2',
    }))
    const res = await makeApp().request(`http://localhost/auth/auth0/callback?code=abc&state=${state}`, {}, env)
    expect(res.status).toBe(302)
    const location = res.headers.get('location') || ''
    expect(location).toContain('/portal')
    expect(location).not.toContain('auth0_error')
    const setCookie = res.headers.get('set-cookie') || ''
    expect(setCookie).toContain('pmv_session=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('SameSite=Lax')

    // Auth0 tokens must not be persisted in KV.
    for (const [, entry] of env._sessions.store) {
      expect(entry.value).not.toContain('access-should-not-persist')
      expect(entry.value).not.toContain('id-should-not-persist')
      expect(entry.value).not.toContain('refresh-should-not-persist')
    }

    const replay = await makeApp().request(`http://localhost/auth/auth0/callback?code=abc&state=${state}`, {}, env)
    expect(replay.headers.get('location')).toContain('auth0_error=invalid_state')
  })

  it('sanitizes open-redirect returnTo into an internal path', async () => {
    let capturedState = ''
    const buildAuthorizationUrl = vi.fn(async ({ authorizationParams }: { authorizationParams?: Record<string, string> }) => {
      capturedState = authorizationParams?.state || ''
      return {
        authorizationUrl: new URL(`https://tenant.auth0.com/authorize?state=${capturedState}`),
        codeVerifier: 'verifier',
      }
    })
    setAuth0ClientFactory(() => ({ buildAuthorizationUrl, getTokenByCode: vi.fn() }) as never)
    const env = baseEnv()
    await makeApp().request('http://localhost/auth/auth0/login?connection=google-oauth2&returnTo=https://evil.example/phish', {}, env)
    expect(capturedState).toBeTruthy()
    const tx = await consumeAuth0Transaction(env, capturedState)
    expect(tx?.returnTo).toBe('/portal')
  })
})
