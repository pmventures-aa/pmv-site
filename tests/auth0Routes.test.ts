import { afterEach, describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { authRoutes } from '../functions/_lib/routes/auth'
import { setAuth0FlowForTests, type Auth0Flow } from '../functions/_lib/auth0/flow'
import { AUTH0_GOOGLE_CONNECTION } from '../functions/_lib/auth0/config'
import type { AppEnv } from '../functions/_lib/types'

function memoryKv() {
  const store = new Map<string, string>()
  return {
    store,
    async get(key: string) { return store.has(key) ? store.get(key)! : null },
    async put(key: string, value: string) { store.set(key, value) },
    async delete(key: string) { store.delete(key) },
    async list({ prefix }: { prefix: string }) {
      return { keys: [...store.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })) }
    },
  }
}

function memoryD1() {
  const users: any[] = []
  const identities: any[] = []
  const invites: any[] = []
  function stmt(sql: string, params: unknown[]) {
    const run = async () => {
      if (/INSERT INTO users/i.test(sql)) {
        users.push({
          id: params[0], email: params[1], password_hash: null, role: params[2], full_name: params[3],
          first_name: params[4], last_name: params[5], status: params[6],
        })
      }
      if (/INSERT INTO external_identities/i.test(sql)) {
        if (identities.some((row) => row.issuer === params[3] && row.subject === params[4])) {
          throw new Error('UNIQUE constraint failed: issuer')
        }
        identities.push({
          id: params[0], user_id: params[1], provider: params[2], issuer: params[3], subject: params[4],
          email: params[5], email_verified: params[6], created_at: 'now', last_login_at: 'now',
        })
      }
      if (/INSERT INTO client_profiles/i.test(sql)) { /* ignore */ }
      if (/INSERT INTO relationship_parties/i.test(sql)) { /* ignore */ }
      if (/INSERT INTO relationship_people/i.test(sql)) { /* ignore */ }
      if (/INSERT INTO account_parties/i.test(sql)) { /* ignore */ }
      if (/UPDATE client_profiles SET primary_party_id/i.test(sql)) { /* ignore */ }
      if (/INSERT INTO auth_sessions/i.test(sql)) { /* ignore */ }
      if (/INSERT INTO audit_log/i.test(sql)) { /* ignore */ }
      if (/UPDATE users SET last_login_at/i.test(sql)) { /* ignore */ }
      if (/UPDATE contact_inquiries/i.test(sql)) { /* ignore */ }
      if (/UPDATE auth_sessions SET revoked_at/i.test(sql)) { /* ignore */ }
      if (/DELETE FROM external_identities/i.test(sql)) {
        const before = identities.length
        for (let i = identities.length - 1; i >= 0; i--) {
          if (identities[i].id === params[0] && identities[i].user_id === params[1]) identities.splice(i, 1)
        }
        return { meta: { changes: before === identities.length ? 0 : 1 } }
      }
      return { meta: { changes: 1 } }
    }
    const first = async () => {
      if (/FROM external_identities WHERE issuer/i.test(sql)) {
        return identities.find((row) => row.issuer === params[0] && row.subject === params[1]) || null
      }
      if (/FROM users WHERE id/i.test(sql)) return users.find((row) => row.id === params[0]) || null
      if (/FROM users WHERE.*email/i.test(sql)) {
        const wanted = String(params[0] || '').toLowerCase()
        return users.find((row) => String(row.email).toLowerCase() === wanted) || null
      }
      if (/FROM access_invites/i.test(sql)) return invites.find((row) => row.email === params[0] && row.status === 'pending') || null
      if (/FROM auth_sessions WHERE id/i.test(sql)) return null
      return null
    }
    const all = async () => {
      if (/FROM external_identities WHERE user_id/i.test(sql)) {
        return { results: identities.filter((row) => row.user_id === params[0]) }
      }
      return { results: [] }
    }
    return { bind: (...next: unknown[]) => stmt(sql, next), first, run, all }
  }
  return {
    users,
    identities,
    prepare: (sql: string) => stmt(sql, []),
    batch: async (items: Array<{ run: () => Promise<unknown> }>) => {
      for (const item of items) await item.run()
    },
  }
}

const readyEnv = {
  AUTH0_DOMAIN: 'example.us.auth0.com',
  AUTH0_CLIENT_ID: 'client',
  AUTH0_CLIENT_SECRET: 'secret',
  AUTH0_CALLBACK_URL: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback',
  AUTH0_LOGOUT_URL: 'https://www.pinnaclemanagementventures.com/portal/login',
  SESSION_SECRET: 'local-dev-testing-secret-not-real',
}

function appEnv(overrides: Record<string, unknown> = {}) {
  const kv = memoryKv()
  const db = memoryD1()
  return {
    kv,
    db,
    env: {
      ...readyEnv,
      DB: db,
      SESSIONS: kv,
      PAYMENT_ENCRYPTION_KEY: 'pay',
      ...overrides,
    },
  }
}

function app() {
  return new Hono<AppEnv>().basePath('/api').route('/auth', authRoutes)
}

afterEach(() => setAuth0FlowForTests(null))

describe('Auth0 HTTP routes', () => {
  it('hides providers when Auth0 is not configured', async () => {
    const { env } = appEnv({ AUTH0_DOMAIN: '', AUTH0_CLIENT_ID: '', AUTH0_CLIENT_SECRET: '', AUTH0_CALLBACK_URL: '' })
    const res = await app().request('https://www.pinnaclemanagementventures.com/api/auth/auth0/providers', {}, env as any)
    expect(await res.json()).toEqual({ enabled: false, connections: [] })
  })

  it('starts Auth0 login through the official SDK and stores a transaction cookie', async () => {
    const flow: Auth0Flow = {
      async startLogin() {
        return { url: new URL('https://example.us.auth0.com/authorize?client_id=client&state=abc'), cookies: ['pmv_auth0_tx=tx; HttpOnly; Secure; SameSite=Lax; Path=/'] }
      },
      async completeLogin() { throw new Error('unused') },
      buildLogoutUrl: (returnTo) => `https://example.us.auth0.com/v2/logout?returnTo=${encodeURIComponent(returnTo)}`,
    }
    setAuth0FlowForTests(flow)
    const { env } = appEnv()
    const res = await app().request(
      `https://www.pinnaclemanagementventures.com/api/auth/auth0/login?connection=${AUTH0_GOOGLE_CONNECTION}&returnTo=/portal`,
      {},
      env as any,
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('example.us.auth0.com/authorize')
    expect(res.headers.get('Set-Cookie')).toContain('pmv_auth0_tx=')
  })

  it('completes a successful callback into a rotated Pinnacle session', async () => {
    const { env, kv } = appEnv()
    kv.store.set('sess:old-session', JSON.stringify({ id: 'someone', email: 'x@y.z', role: 'client' }))
    const flow: Auth0Flow = {
      async startLogin() { throw new Error('unused') },
      async completeLogin() {
        return {
          claims: {
            issuer: 'https://example.us.auth0.com/',
            subject: 'google-oauth2|new',
            email: 'new.user@example.com',
            emailVerified: true,
            name: 'New User',
            givenName: 'New',
            familyName: 'User',
            nonce: null,
            connection: AUTH0_GOOGLE_CONNECTION,
          },
          appState: {
            purpose: 'login',
            surface: 'client',
            returnTo: '/portal',
            loginPath: '/portal/login',
            connection: AUTH0_GOOGLE_CONNECTION,
            state: 'state-1',
          },
          cookies: ['pmv_auth0_tx=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax'],
        }
      },
      buildLogoutUrl: () => 'https://example.us.auth0.com/v2/logout',
    }
    setAuth0FlowForTests(flow)
    const res = await app().request(
      'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback?code=one-time&state=state-1',
      { headers: { Cookie: 'pmv_session=old-session' } },
      env as any,
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/portal')
    const cookies = res.headers.getSetCookie?.() || [res.headers.get('Set-Cookie') || '']
    expect(cookies.join('\n')).toContain('pmv_session=')
    expect(kv.store.has('sess:old-session')).toBe(false)
    const sessionKeys = [...kv.store.keys()].filter((key) => key.startsWith('sess:') && !key.startsWith('sessmeta:'))
    expect(sessionKeys.length).toBe(1)
    expect(sessionKeys[0]).not.toBe('sess:old-session')
  })

  it('rejects invalid state, token failures, expired transactions, and replayed callbacks', async () => {
    const { env } = appEnv()
    const cases: Array<{ message: string }> = [
      { message: 'invalid_state' },
      { message: 'invalid_token' },
      { message: 'missing_transaction' },
    ]
    for (const item of cases) {
      setAuth0FlowForTests({
        async startLogin() { throw new Error('unused') },
        async completeLogin() { throw new Error(item.message) },
        buildLogoutUrl: () => '',
      })
      const res = await app().request(
        'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback?code=x&state=y',
        {},
        env as any,
      )
      expect(res.status).toBe(302)
      expect(res.headers.get('Location')).toBe('/portal/login?auth_error=signin')
    }
  })

  it('rejects an open redirect after a successful callback', async () => {
    const { env } = appEnv()
    setAuth0FlowForTests({
      async startLogin() { throw new Error('unused') },
      async completeLogin() {
        return {
          claims: {
            issuer: 'https://example.us.auth0.com/',
            subject: 'google-oauth2|redirect',
            email: 'redirect@example.com',
            emailVerified: true,
            name: 'Redirect',
            givenName: 'Redirect',
            familyName: 'User',
            nonce: null,
            connection: AUTH0_GOOGLE_CONNECTION,
          },
          appState: {
            purpose: 'login',
            surface: 'client',
            returnTo: 'https://evil.example/phish',
            loginPath: '/portal/login',
            connection: AUTH0_GOOGLE_CONNECTION,
            state: 'state-2',
          },
          cookies: [],
        }
      },
      buildLogoutUrl: () => '',
    })
    const res = await app().request(
      'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback?code=x&state=state-2',
      {},
      env as any,
    )
    expect(res.headers.get('Location')).toBe('/portal')
    expect(res.headers.get('Location')).not.toContain('evil.example')
  })

  it('rate-limits login initiation', async () => {
    setAuth0FlowForTests({
      async startLogin() { return { url: new URL('https://example.us.auth0.com/authorize'), cookies: [] } },
      async completeLogin() { throw new Error('unused') },
      buildLogoutUrl: () => '',
    })
    const { env, kv } = appEnv()
    kv.store.set('auth0login:1.1.1.1', '10')
    const res = await app().request(
      `https://www.pinnaclemanagementventures.com/api/auth/auth0/login?connection=${AUTH0_GOOGLE_CONNECTION}`,
      { headers: { 'CF-Connecting-IP': '1.1.1.1' } },
      env as any,
    )
    expect(res.status).toBe(429)
  })

  it('does not create a session for an unknown Auth0 identity that only matches an existing email', async () => {
    const { env, db, kv } = appEnv()
    db.users.push({
      id: 'user-a', email: 'alex@example.com', password_hash: 'hashed', role: 'client',
      full_name: 'Alex Rivera', first_name: 'Alex', last_name: 'Rivera', status: 'active',
    })
    setAuth0FlowForTests({
      async startLogin() { throw new Error('unused') },
      async completeLogin() {
        return {
          claims: {
            issuer: 'https://example.us.auth0.com/',
            subject: 'google-oauth2|unlinked',
            email: 'alex@example.com',
            emailVerified: true,
            name: 'Alex Rivera',
            givenName: 'Alex',
            familyName: 'Rivera',
            nonce: null,
            connection: AUTH0_GOOGLE_CONNECTION,
          },
          appState: {
            purpose: 'login',
            surface: 'client',
            returnTo: '/portal',
            loginPath: '/portal/login',
            connection: AUTH0_GOOGLE_CONNECTION,
            state: 'state-3',
          },
          cookies: [],
        }
      },
      buildLogoutUrl: () => '',
    })
    const res = await app().request(
      'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback?code=x&state=state-3',
      {},
      env as any,
    )
    expect(res.headers.get('Location')).toBe('/portal/login?auth_error=signin')
    expect(db.identities).toHaveLength(0)
    expect([...kv.store.keys()].some((key) => key.startsWith('sess:'))).toBe(false)
  })

  it('rejects a replayed callback after the transaction cookie is cleared', async () => {
    const { env } = appEnv()
    let used = false
    setAuth0FlowForTests({
      async startLogin() { throw new Error('unused') },
      async completeLogin() {
        if (used) throw new Error('missing_transaction')
        used = true
        return {
          claims: {
            issuer: 'https://example.us.auth0.com/',
            subject: 'google-oauth2|replay',
            email: 'replay@example.com',
            emailVerified: true,
            name: 'Replay User',
            givenName: 'Replay',
            familyName: 'User',
            nonce: null,
            connection: AUTH0_GOOGLE_CONNECTION,
          },
          appState: {
            purpose: 'login',
            surface: 'client',
            returnTo: '/portal',
            loginPath: '/portal/login',
            connection: AUTH0_GOOGLE_CONNECTION,
            state: 'state-4',
          },
          cookies: ['pmv_auth0_tx=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax'],
        }
      },
      buildLogoutUrl: () => '',
    })
    const first = await app().request(
      'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback?code=once&state=state-4',
      {},
      env as any,
    )
    expect(first.status).toBe(302)
    expect(first.headers.get('Location')).toBe('/portal')
    const second = await app().request(
      'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback?code=once&state=state-4',
      {},
      env as any,
    )
    expect(second.headers.get('Location')).toBe('/portal/login?auth_error=signin')
  })

  it('invalidates the local Pinnacle session on logout without requiring Auth0 logout', async () => {
    setAuth0FlowForTests({
      async startLogin() { throw new Error('unused') },
      async completeLogin() { throw new Error('unused') },
      buildLogoutUrl: (returnTo) => `https://example.us.auth0.com/v2/logout?returnTo=${encodeURIComponent(returnTo)}`,
    })
    const { env, kv, db } = appEnv()
    db.users.push({
      id: 'user-a', email: 'alex@example.com', password_hash: 'hashed', role: 'client',
      full_name: 'Alex', first_name: 'Alex', last_name: 'A', status: 'active',
    })
    kv.store.set('sess:live-token', JSON.stringify({ id: 'user-a', email: 'alex@example.com', role: 'client', full_name: 'Alex' }))
    kv.store.set('usess:user-a:live-token', '1')
    kv.store.set('sessmeta:live-token', 'sid-1')
    kv.store.set('sid:sid-1', 'live-token')
    const res = await app().request(
      'https://www.pinnaclemanagementventures.com/api/auth/logout',
      { method: 'POST', headers: { Cookie: 'pmv_session=live-token' } },
      env as any,
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; auth0_logout_url: string | null }
    expect(body.ok).toBe(true)
    expect(kv.store.has('sess:live-token')).toBe(false)
    expect(res.headers.get('Set-Cookie')).toContain('pmv_session=')
    expect(res.headers.get('Set-Cookie')).toMatch(/Max-Age=0/)
  })

  it('lists identities and refuses to unlink the final authentication method', async () => {
    const { env, kv, db } = appEnv()
    db.users.push({
      id: 'user-a', email: 'alex@example.com', password_hash: null, role: 'client',
      full_name: 'Alex', first_name: 'Alex', last_name: 'A', status: 'active',
    })
    db.identities.push({
      id: 'id-1', user_id: 'user-a', provider: AUTH0_GOOGLE_CONNECTION,
      issuer: 'https://example.us.auth0.com/', subject: 'google-oauth2|abc',
      email: 'alex@example.com', email_verified: 1, created_at: 'now', last_login_at: 'now',
    })
    kv.store.set('sess:live-token', JSON.stringify({ id: 'user-a', email: 'alex@example.com', role: 'client', full_name: 'Alex' }))
    const listed = await app().request(
      'https://www.pinnaclemanagementventures.com/api/auth/identities',
      { headers: { Cookie: 'pmv_session=live-token' } },
      env as any,
    )
    expect(listed.status).toBe(200)
    const payload = await listed.json() as { password: { enabled: boolean }; identities: Array<{ can_unlink: boolean }> }
    expect(payload.password.enabled).toBe(false)
    expect(payload.identities[0].can_unlink).toBe(false)
    const unlink = await app().request(
      'https://www.pinnaclemanagementventures.com/api/auth/auth0/unlink',
      {
        method: 'POST',
        headers: { Cookie: 'pmv_session=live-token', Origin: 'https://www.pinnaclemanagementventures.com', 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity_id: 'id-1' }),
      },
      env as any,
    )
    expect(unlink.status).toBe(400)
    expect(db.identities).toHaveLength(1)
  })
})
