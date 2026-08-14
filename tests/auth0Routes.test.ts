import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv, Env } from '../functions/_lib/types'
import { __setAuth0SdkForTests, MissingTransactionError, type Auth0Sdk } from '../functions/_lib/auth0/sdk'
import { hashPassword } from '../functions/_lib/crypto'
import { createSession } from '../functions/_lib/session'
import { authRoutes } from '../functions/_lib/routes/auth'

class MemoryKV {
  store = new Map<string, string>()
  async get(key: string) { return this.store.has(key) ? this.store.get(key)! : null }
  async put(key: string, value: string) { this.store.set(key, value) }
  async delete(key: string) { this.store.delete(key) }
  async list({ prefix }: { prefix: string }) {
    return { keys: [...this.store.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name })) }
  }
}

interface FakeRow { [key: string]: unknown }

function createFakeDb() {
  const users: FakeRow[] = []
  const identities: FakeRow[] = []
  function bound(sql: string, params: unknown[]) {
    const text = sql.replace(/\s+/g, ' ')
    return {
      async first<T>() {
        if (/FROM users WHERE email/.test(text)) return (users.find((row) => row.email === params[0]) || null) as T
        if (/FROM users WHERE id/.test(text)) return (users.find((row) => row.id === params[0]) || null) as T
        if (/FROM external_identities WHERE issuer/.test(text)) {
          return (identities.find((row) => row.issuer === params[0] && row.subject === params[1]) || null) as T
        }
        if (/FROM external_identities WHERE id/.test(text)) return (identities.find((row) => row.id === params[0]) || null) as T
        if (/FROM contact_inquiries/.test(text)) return null as T
        return null as T
      },
      async all<T>() {
        if (/FROM external_identities WHERE user_id/.test(text)) {
          return { results: identities.filter((row) => row.user_id === params[0]) as T[] }
        }
        if (/FROM contact_inquiries/.test(text) || /FROM staff_assignments/.test(text)) return { results: [] as T[] }
        return { results: [] as T[] }
      },
      async run() {
        if (/INSERT INTO users/.test(text)) {
          users.push({
            id: params[0], email: params[1], password_hash: params[2], role: 'client',
            full_name: params[3] || params[2], first_name: params[4] || params[3], last_name: params[5] || params[4],
            status: 'active',
          })
        }
        if (/INSERT INTO external_identities/.test(text)) {
          identities.push({
            id: params[0], user_id: params[1], provider: params[2], issuer: params[3], subject: params[4],
            email: params[5], email_verified: params[6], created_at: 'now', last_login_at: 'now',
          })
        }
        if (/DELETE FROM external_identities/.test(text)) {
          const before = identities.length
          for (let i = identities.length - 1; i >= 0; i--) {
            if (identities[i].id === params[0] && identities[i].user_id === params[1]) identities.splice(i, 1)
          }
          return { meta: { changes: before === identities.length ? 0 : 1 } }
        }
        return { meta: { changes: 1 } }
      },
    }
  }
  return {
    users,
    identities,
    prepare(sql: string) {
      const statement = bound(sql, [])
      return { ...statement, bind: (...params: unknown[]) => bound(sql, params) }
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) { return Promise.all(statements.map((statement) => statement.run())) },
  }
}

function envWithAuth0(configured = true): Env & { db: ReturnType<typeof createFakeDb>; kv: MemoryKV } {
  const db = createFakeDb()
  const kv = new MemoryKV()
  const env = {
    DB: db as unknown as D1Database,
    SESSIONS: kv as unknown as KVNamespace,
    SESSION_SECRET: 'local-dev-testing-secret-not-real',
    PAYMENT_ENCRYPTION_KEY: 'local-dev-payment-key-not-real-either',
    db,
    kv,
  } as Env & { db: ReturnType<typeof createFakeDb>; kv: MemoryKV }
  if (configured) {
    env.AUTH0_DOMAIN = 'pmv-test.us.auth0.com'
    env.AUTH0_CLIENT_ID = 'client-id'
    env.AUTH0_CLIENT_SECRET = 'client-secret'
    env.AUTH0_CALLBACK_URL = 'http://localhost:8788/api/auth/auth0/callback'
    env.AUTH0_LOGOUT_URL = 'http://localhost:8788/portal/login'
  }
  return env
}

function app() {
  const hono = new Hono<AppEnv>()
  hono.route('/api/auth', authRoutes)
  return hono
}

afterEach(() => {
  __setAuth0SdkForTests(null)
})

describe('Auth0 HTTP routes', () => {
  it('hides providers when Auth0 is not configured', async () => {
    const res = await app().request('http://localhost:8788/api/auth/auth0/status', {}, envWithAuth0(false))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enabled: false, providers: [] })
  })

  it('does not silently enable a login button when configuration is missing', async () => {
    const res = await app().request('http://localhost:8788/api/auth/auth0/login?connection=google', {}, envWithAuth0(false))
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('auth_error=unavailable')
  })

  it('starts Auth0 login through the official SDK', async () => {
    const startInteractiveLogin = vi.fn<Auth0Sdk['startInteractiveLogin']>(async () => new URL('https://pmv-test.us.auth0.com/authorize?state=abc'))
    __setAuth0SdkForTests({
      startInteractiveLogin,
      completeInteractiveLogin: vi.fn(),
      getUser: vi.fn(),
    })
    const res = await app().request('http://localhost:8788/api/auth/auth0/login?connection=google&returnTo=/portal', {}, envWithAuth0())
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://pmv-test.us.auth0.com/authorize?state=abc')
    expect(startInteractiveLogin).toHaveBeenCalled()
    const [options] = startInteractiveLogin.mock.calls[0]
    expect(options.authorizationParams?.connection).toBe('google-oauth2')
    expect(options.authorizationParams?.redirect_uri).toBe('http://localhost:8788/api/auth/auth0/callback')
    expect(options.appState?.returnTo).toBe('/portal')
  })

  it('rejects open redirects at login initiation', async () => {
    const startInteractiveLogin = vi.fn<Auth0Sdk['startInteractiveLogin']>(async () => new URL('https://pmv-test.us.auth0.com/authorize'))
    __setAuth0SdkForTests({ startInteractiveLogin, completeInteractiveLogin: vi.fn(), getUser: vi.fn() })
    await app().request('http://localhost:8788/api/auth/auth0/login?connection=google&returnTo=https://evil.example', {}, envWithAuth0())
    expect(startInteractiveLogin.mock.calls[0][0].appState?.returnTo).toBe('/portal')
  })

  it('completes a successful Auth0 callback into a Pinnacle session', async () => {
    const env = envWithAuth0()
    env.db.users.push({
      id: 'client-a', email: 'ada@example.com', role: 'client', full_name: 'Ada', first_name: 'Ada', last_name: 'Lovelace',
      status: 'active', password_hash: 'hash',
    })
    env.db.identities.push({
      id: 'eid-1', user_id: 'client-a', provider: 'google-oauth2', issuer: 'https://pmv-test.us.auth0.com/',
      subject: 'google-oauth2|abc', email: 'ada@example.com', email_verified: 1,
    })
    __setAuth0SdkForTests({
      startInteractiveLogin: vi.fn(),
      completeInteractiveLogin: vi.fn(async () => ({
        appState: { intent: 'login' as const, returnTo: '/portal', connection: 'google-oauth2', provider: 'google' },
      })),
      getUser: vi.fn(async () => ({
        sub: 'google-oauth2|abc',
        iss: 'https://pmv-test.us.auth0.com/',
        email: 'ada@example.com',
        email_verified: true,
        role: 'admin',
      })),
    })
    const res = await app().request('http://localhost:8788/api/auth/auth0/callback?code=one-time&state=abc', {}, env)
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/portal')
    expect(res.headers.get('Set-Cookie')).toMatch(/pmv_session=/)
    expect(res.headers.get('Set-Cookie')).toMatch(/HttpOnly/)
  })

  it('rejects an invalid or missing transaction state', async () => {
    __setAuth0SdkForTests({
      startInteractiveLogin: vi.fn(),
      completeInteractiveLogin: vi.fn(async () => { throw new MissingTransactionError('missing') }),
      getUser: vi.fn(),
    })
    const res = await app().request('http://localhost:8788/api/auth/auth0/callback?code=bad&state=nope', {}, envWithAuth0())
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('auth_error=signin')
  })

  it('rejects token validation failure', async () => {
    __setAuth0SdkForTests({
      startInteractiveLogin: vi.fn(),
      completeInteractiveLogin: vi.fn(async () => { throw new Error('JWT expired / nonce mismatch') }),
      getUser: vi.fn(),
    })
    const res = await app().request('http://localhost:8788/api/auth/auth0/callback?code=expired&state=abc', {}, envWithAuth0())
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('auth_error=signin')
  })

  it('rejects a replayed authorization code', async () => {
    const env = envWithAuth0()
    await env.kv.put('auth0-code:replay', '1')
    const completeInteractiveLogin = vi.fn()
    __setAuth0SdkForTests({ startInteractiveLogin: vi.fn(), completeInteractiveLogin, getUser: vi.fn() })
    const res = await app().request('http://localhost:8788/api/auth/auth0/callback?code=replay&state=abc', {}, env)
    expect(res.status).toBe(302)
    expect(completeInteractiveLogin).not.toHaveBeenCalled()
  })

  it('uses the Vite origin for the Auth0 callback when the API is proxied', async () => {
    const startInteractiveLogin = vi.fn<Auth0Sdk['startInteractiveLogin']>(async () => new URL('https://pmv-test.us.auth0.com/authorize'))
    __setAuth0SdkForTests({ startInteractiveLogin, completeInteractiveLogin: vi.fn(), getUser: vi.fn() })
    await app().request('http://127.0.0.1:8788/api/auth/auth0/login?connection=google', {
      headers: { Referer: 'http://localhost:5173/portal/login' },
    }, envWithAuth0())
    expect(startInteractiveLogin.mock.calls[0][0].authorizationParams?.redirect_uri).toBe('http://localhost:5173/api/auth/auth0/callback')
  })

  it('rejects a callback whose issuer does not match the configured tenant', async () => {
    __setAuth0SdkForTests({
      startInteractiveLogin: vi.fn(),
      completeInteractiveLogin: vi.fn(async () => ({
        appState: { intent: 'login' as const, returnTo: '/portal', connection: 'google-oauth2', provider: 'google' },
      })),
      getUser: vi.fn(async () => ({
        sub: 'google-oauth2|abc',
        iss: 'https://evil.example/',
        email: 'ada@example.com',
        email_verified: true,
      })),
    })
    const res = await app().request('http://localhost:8788/api/auth/auth0/callback?code=forged&state=abc', {}, envWithAuth0())
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('auth_error=signin')
    expect(res.headers.get('Set-Cookie') || '').not.toMatch(/pmv_session=/)
  })

  it('logs out locally without requiring Auth0 federated logout', async () => {
    const env = envWithAuth0()
    env.db.users.push({
      id: 'client-a', email: 'ada@example.com', role: 'client', full_name: 'Ada', first_name: 'Ada', last_name: 'Lovelace',
      status: 'active', password_hash: 'hash',
    })
    const token = await createSession(env, { id: 'client-a', email: 'ada@example.com', role: 'client', full_name: 'Ada' })
    const res = await app().request('http://localhost:8788/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: `pmv_session=${token}` },
    }, env)
    expect(res.status).toBe(200)
    expect(await env.kv.get(`sess:${token}`)).toBeNull()
    expect(res.headers.get('Set-Cookie') || '').toMatch(/Max-Age=0/)
  })

  it('unlinks a connected method when a password remains', async () => {
    const env = envWithAuth0()
    env.db.users.push({
      id: 'client-a', email: 'ada@example.com', role: 'client', full_name: 'Ada', first_name: 'Ada', last_name: 'Lovelace',
      status: 'active', password_hash: 'hash',
    })
    env.db.identities.push({
      id: 'eid-1', user_id: 'client-a', provider: 'google-oauth2', issuer: 'https://pmv-test.us.auth0.com/',
      subject: 'google-oauth2|abc', email: 'ada@example.com', email_verified: 1,
    })
    const token = await createSession(env, { id: 'client-a', email: 'ada@example.com', role: 'client', full_name: 'Ada' })
    const res = await app().request('http://localhost:8788/api/auth/auth0/unlink', {
      method: 'POST',
      headers: { Cookie: `pmv_session=${token}`, Origin: 'http://localhost:8788', 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity_id: 'eid-1' }),
    }, env)
    expect(res.status).toBe(200)
    expect(env.db.identities).toHaveLength(0)
  })

  it('prevents unlinking the final authentication method over HTTP', async () => {
    const env = envWithAuth0()
    env.db.users.push({
      id: 'client-a', email: 'ada@example.com', role: 'client', full_name: 'Ada', first_name: 'Ada', last_name: 'Lovelace',
      status: 'active', password_hash: null,
    })
    env.db.identities.push({
      id: 'eid-1', user_id: 'client-a', provider: 'google-oauth2', issuer: 'https://pmv-test.us.auth0.com/',
      subject: 'google-oauth2|abc', email: 'ada@example.com', email_verified: 1,
    })
    const token = await createSession(env, { id: 'client-a', email: 'ada@example.com', role: 'client', full_name: 'Ada' })
    const res = await app().request('http://localhost:8788/api/auth/auth0/unlink', {
      method: 'POST',
      headers: { Cookie: `pmv_session=${token}`, Origin: 'http://localhost:8788', 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity_id: 'eid-1' }),
    }, env)
    expect(res.status).toBe(400)
    expect(env.db.identities).toHaveLength(1)
  })

  it('rejects cross-site unlink attempts', async () => {
    const env = envWithAuth0()
    env.db.users.push({
      id: 'client-a', email: 'ada@example.com', role: 'client', full_name: 'Ada', first_name: 'Ada', last_name: 'Lovelace',
      status: 'active', password_hash: 'hash',
    })
    const token = await createSession(env, { id: 'client-a', email: 'ada@example.com', role: 'client', full_name: 'Ada' })
    const res = await app().request('http://localhost:8788/api/auth/auth0/unlink', {
      method: 'POST',
      headers: { Cookie: `pmv_session=${token}`, Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity_id: 'eid-1' }),
    }, env)
    expect(res.status).toBe(403)
  })

  it('keeps password login working on the same auth router', async () => {
    const env = envWithAuth0(false)
    const hash = await hashPassword('a-strong-password', env.SESSION_SECRET)
    env.db.users.push({
      id: 'client-a', email: 'ada@example.com', role: 'client', full_name: 'Ada', first_name: 'Ada', last_name: 'Lovelace',
      status: 'active', password_hash: hash,
    })
    const res = await app().request('http://localhost:8788/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ada@example.com', password: 'a-strong-password' }),
    }, env)
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; user: { id: string } }
    expect(body.ok).toBe(true)
    expect(body.user.id).toBe('client-a')
    expect(res.headers.get('Set-Cookie')).toMatch(/pmv_session=/)
  })
})
