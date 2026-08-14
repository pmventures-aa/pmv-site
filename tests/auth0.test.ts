import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { readFileSync } from 'node:fs'
import { authRoutes } from '../functions/_lib/routes/auth'
import { createAuth0Routes } from '../functions/_lib/routes/auth0'
import { hashPassword } from '../functions/_lib/crypto'
import { createSession } from '../functions/_lib/session'
import { canAccessClient } from '../functions/_lib/access'
import { scopeFilter } from '../functions/_lib/scope'
import { trustedAccess } from '../functions/_lib/trustedAccess'
import { Auth0FlowError, type Auth0Bridge, type VerifiedAuth0Identity } from '../functions/_lib/auth0Client'
import { isSafeReturnTo, safeReturnTo } from '../functions/_lib/auth0ReturnTo'
import { publicAuth0Status, readAuth0Config } from '../functions/_lib/auth0Config'
import { createTestEnv, MemoryD1 } from './helpers/memoryCloudflare'
import type { AppEnv, SessionUser } from '../functions/_lib/types'

const ISSUER = 'https://tenant.auth0.com/'

function identity(overrides: Partial<VerifiedAuth0Identity> = {}): VerifiedAuth0Identity {
  return {
    issuer: ISSUER,
    subject: 'google-oauth2|abc',
    email: 'pat@example.com',
    emailVerified: true,
    givenName: 'Pat',
    familyName: 'Lee',
    provider: 'google-oauth2',
    claims: { iss: ISSUER, sub: 'google-oauth2|abc', email_verified: true, roles: ['admin'], permissions: ['*'] },
    ...overrides,
  }
}

function mockBridge(options: {
  identity?: VerifiedAuth0Identity
  appState?: Record<string, unknown>
  fail?: Auth0FlowError['code']
} = {}): Auth0Bridge {
  return {
    async startLogin(_env, _request, input) {
      if (options.fail === 'misconfigured') throw new Auth0FlowError('misconfigured')
      return {
        url: `https://tenant.auth0.com/authorize?connection=${input.connection}&redirect_uri=${encodeURIComponent('https://www.pinnaclemanagementventures.com/api/auth/auth0/callback')}&state=abc&nonce=xyz&code_challenge=pkce`,
        cookies: ['pmv_auth0_tx=txn; Path=/; HttpOnly; Secure; SameSite=Lax'],
      }
    },
    async completeLogin() {
      if (options.fail) throw new Auth0FlowError(options.fail)
      return {
        identity: options.identity || identity(),
        appState: {
          intent: 'login',
          returnTo: '/portal',
          connection: 'google-oauth2',
          ...options.appState,
        } as never,
        cookies: ['pmv_auth0_tx=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax'],
      }
    },
    async federatedLogoutUrl() {
      return 'https://tenant.auth0.com/v2/logout?client_id=auth0-client-id&returnTo=https%3A%2F%2Fwww.pinnaclemanagementventures.com%2Fportal%2Flogin'
    },
  }
}

function appFor(env: ReturnType<typeof createTestEnv>, bridge: Auth0Bridge = mockBridge()) {
  const app = new Hono<AppEnv>()
  app.route('/api/auth', authRoutes)
  app.route('/api/auth', createAuth0Routes(bridge))
  return {
    request(path: string, init?: RequestInit) {
      return app.request(`https://www.pinnaclemanagementventures.com${path}`, init, env)
    },
  }
}

function db(env: ReturnType<typeof createTestEnv>) {
  return env.DB as unknown as MemoryD1
}

function cookie(res: Response, name: string) {
  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || '']
  const line = cookies.find((value) => value.startsWith(`${name}=`)) || ''
  return line.split(';')[0].slice(name.length + 1)
}

async function addClient(env: ReturnType<typeof createTestEnv>, input: { id: string; email: string; password?: string; status?: string; role?: string }) {
  const password_hash = input.password ? await hashPassword(input.password, env.SESSION_SECRET) : null
  db(env).insert('users', {
    id: input.id,
    email: input.email,
    password_hash,
    role: input.role || 'client',
    status: input.status || 'active',
    full_name: input.email,
    first_name: 'Pat',
    last_name: 'Lee',
  })
}

describe('Auth0 configuration', () => {
  it('stays disabled when Auth0 env is missing', () => {
    const env = createTestEnv({
      AUTH0_DOMAIN: '',
      AUTH0_CLIENT_ID: '',
      AUTH0_CLIENT_SECRET: '',
      AUTH0_CALLBACK_URL: '',
      AUTH0_LOGOUT_URL: '',
    })
    expect(readAuth0Config(env).enabled).toBe(false)
    expect(publicAuth0Status(env)).toEqual({ enabled: false, connections: [] })
  })

  it('stays disabled when configuration is incomplete', () => {
    const env = createTestEnv({ AUTH0_CLIENT_SECRET: '' })
    expect(readAuth0Config(env).enabled).toBe(false)
    expect(publicAuth0Status(env).enabled).toBe(false)
  })

  it('rejects open redirects', () => {
    const request = new Request('https://www.pinnaclemanagementventures.com/portal/login')
    expect(isSafeReturnTo('https://evil.example', request)).toBe(false)
    expect(isSafeReturnTo('//evil.example', request)).toBe(false)
    expect(isSafeReturnTo('/\\evil.example', request)).toBe(false)
    expect(isSafeReturnTo('/api/auth/logout', request)).toBe(false)
    expect(safeReturnTo('/portal/matters', request)).toBe('/portal/matters')
    expect(safeReturnTo('/portal/login', request)).toBe('/portal')
  })
})

describe('password login remains functional', () => {
  it('creates a Pinnacle session from email and password', async () => {
    const env = createTestEnv()
    await addClient(env, { id: 'user-1', email: 'pat@example.com', password: 'correct-horse-battery' })
    const app = appFor(env)
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'pat@example.com', password: 'correct-horse-battery' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; user: { id: string; role: string } }
    expect(body.user.id).toBe('user-1')
    expect(body.user.role).toBe('client')
    expect(cookie(res, 'pmv_session')).toBeTruthy()
  })
})

describe('Auth0 login initiation', () => {
  it('redirects through the official authorize URL for an enabled connection', async () => {
    const env = createTestEnv()
    const app = appFor(env)
    const res = await app.request('/api/auth/auth0/login?connection=google-oauth2&returnTo=/portal')
    expect(res.status).toBe(302)
    const location = res.headers.get('location') || ''
    expect(location).toContain('https://tenant.auth0.com/authorize')
    expect(location).toContain('connection=google-oauth2')
    expect(location).toContain('redirect_uri=')
    expect(location).toContain('code_challenge=')
    expect(cookie(res, 'pmv_auth0_tx')).toBeTruthy()
  })

  it('does not start login for an unconfigured connection', async () => {
    const env = createTestEnv()
    const app = appFor(env)
    const res = await app.request('/api/auth/auth0/login?connection=github')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/portal/login?auth0=error')
  })
})

describe('Auth0 callback', () => {
  it('creates a rotated Pinnacle session for a linked identity', async () => {
    const env = createTestEnv()
    await addClient(env, { id: 'user-1', email: 'pat@example.com', password: 'old-password-1' })
    db(env).insert('external_identities', {
      id: 'eid-1',
      user_id: 'user-1',
      provider: 'google-oauth2',
      issuer: ISSUER,
      subject: 'google-oauth2|abc',
      provider_email: 'pat@example.com',
      email_verified: 1,
    })
    const previous = await createSession(env, { id: 'user-1', email: 'pat@example.com', role: 'client', full_name: 'Pat Lee' })
    const app = appFor(env, mockBridge())
    const res = await app.request('/api/auth/auth0/callback?code=one-time&state=abc', {
      headers: { Cookie: `pmv_session=${previous}` },
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/portal')
    const next = cookie(res, 'pmv_session')
    expect(next).toBeTruthy()
    expect(next).not.toBe(previous)
    expect(await env.SESSIONS.get(`sess:${previous}`)).toBeNull()
    expect(await env.SESSIONS.get(`sess:${next}`)).toContain('user-1')
  })

  it('rejects invalid state, invalid token, expired, and replayed callbacks', async () => {
    const env = createTestEnv()
    for (const fail of ['invalid_state', 'invalid_token', 'expired'] as const) {
      const app = appFor(env, mockBridge({ fail }))
      const res = await app.request(`/api/auth/auth0/callback?code=${fail}&state=abc`)
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toContain('/portal/login?auth0=error')
    }
    const app = appFor(env, mockBridge())
    const first = await app.request('/api/auth/auth0/callback?code=replay-me&state=abc')
    expect(first.status).toBe(302)
    const second = await app.request('/api/auth/auth0/callback?code=replay-me&state=abc')
    expect(second.headers.get('location')).toContain('/portal/login?auth0=error')
  })

  it('does not log in an unknown Auth0 identity or auto-link a duplicate email', async () => {
    const env = createTestEnv()
    await addClient(env, { id: 'user-1', email: 'pat@example.com', password: 'old-password-1' })
    const app = appFor(env, mockBridge({ identity: identity({ email: 'pat@example.com' }) }))
    const res = await app.request('/api/auth/auth0/callback?code=unknown&state=abc')
    expect(res.headers.get('location')).toContain('auth0=sent')
    expect(cookie(res, 'pmv_session')).toBeFalsy()
    expect(db(env).tables.external_identities).toHaveLength(0)
  })

  it('sends unknown new users into pending onboarding instead of attaching client data', async () => {
    const env = createTestEnv()
    db(env).insert('users', { id: 'other', email: 'other@example.com', role: 'client', status: 'active', password_hash: 'x' })
    db(env).insert('matters', { id: 'matter-other', client_user_id: 'other', title: 'Private matter' })
    const app = appFor(env, mockBridge({ identity: identity({ email: 'new@example.com', subject: 'google-oauth2|new' }) }))
    const res = await app.request('/api/auth/auth0/callback?code=new-user&state=abc')
    expect(res.headers.get('location')).toContain('/portal/signup?auth0=pending')
    expect(cookie(res, 'pmv_session')).toBeFalsy()
    expect(cookie(res, 'pmv_auth0_pending')).toBeTruthy()
  })

  it('refuses a disabled internal user even when the identity is linked', async () => {
    const env = createTestEnv()
    await addClient(env, { id: 'user-1', email: 'pat@example.com', status: 'suspended' })
    db(env).insert('external_identities', {
      id: 'eid-1', user_id: 'user-1', provider: 'google-oauth2', issuer: ISSUER, subject: 'google-oauth2|abc', email_verified: 1,
    })
    const app = appFor(env, mockBridge())
    const res = await app.request('/api/auth/auth0/callback?code=disabled&state=abc')
    expect(res.headers.get('location')).toContain('/portal/login?auth0=error')
    expect(cookie(res, 'pmv_session')).toBeFalsy()
  })
})

describe('Auth0 account linking', () => {
  it('links only from an authenticated matching account', async () => {
    const env = createTestEnv()
    await addClient(env, { id: 'user-1', email: 'pat@example.com', password: 'old-password-1' })
    const token = await createSession(env, { id: 'user-1', email: 'pat@example.com', role: 'client', full_name: 'Pat Lee' })
    const app = appFor(env, mockBridge({
      identity: identity(),
      appState: { intent: 'link', userId: 'user-1', returnTo: '/portal/security' },
    }))
    const res = await app.request('/api/auth/auth0/callback?code=link-ok&state=abc', {
      headers: { Cookie: `pmv_session=${token}` },
    })
    expect(res.headers.get('location')).toBe('/portal/security')
    expect(db(env).tables.external_identities).toHaveLength(1)
    expect(db(env).tables.external_identities[0].user_id).toBe('user-1')
  })

  it('rejects an identity already linked to another user', async () => {
    const env = createTestEnv()
    await addClient(env, { id: 'user-1', email: 'pat@example.com', password: 'old-password-1' })
    await addClient(env, { id: 'user-2', email: 'sam@example.com', password: 'old-password-2' })
    db(env).insert('external_identities', {
      id: 'eid-2', user_id: 'user-2', provider: 'google-oauth2', issuer: ISSUER, subject: 'google-oauth2|abc', email_verified: 1,
    })
    const token = await createSession(env, { id: 'user-1', email: 'pat@example.com', role: 'client', full_name: 'Pat Lee' })
    const app = appFor(env, mockBridge({
      identity: identity(),
      appState: { intent: 'link', userId: 'user-1' },
    }))
    const res = await app.request('/api/auth/auth0/callback?code=taken&state=abc', {
      headers: { Cookie: `pmv_session=${token}` },
    })
    expect(res.headers.get('location')).toContain('/portal/login?auth0=error')
    expect(db(env).tables.external_identities).toHaveLength(1)
  })

  it('prevents unlinking the final authentication method and allows unlink when a password remains', async () => {
    const env = createTestEnv()
    await addClient(env, { id: 'user-1', email: 'pat@example.com' })
    db(env).insert('external_identities', {
      id: 'eid-1', user_id: 'user-1', provider: 'google-oauth2', issuer: ISSUER, subject: 'google-oauth2|abc', email_verified: 1,
    })
    const token = await createSession(env, { id: 'user-1', email: 'pat@example.com', role: 'client', full_name: 'Pat Lee' })
    const app = appFor(env)
    const blocked = await app.request('/api/auth/auth0/unlink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `pmv_session=${token}` },
      body: JSON.stringify({ identity_id: 'eid-1' }),
    })
    expect(blocked.status).toBe(400)
    const body = await blocked.json() as { error: string }
    expect(body.error).toMatch(/at least one sign-in method/i)

    db(env).tables.users[0].password_hash = await hashPassword('new-password-ok', env.SESSION_SECRET)
    const allowed = await app.request('/api/auth/auth0/unlink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `pmv_session=${token}` },
      body: JSON.stringify({ identity_id: 'eid-1' }),
    })
    expect(allowed.status).toBe(200)
    expect(db(env).tables.external_identities).toHaveLength(0)
  })
})

describe('Auth0 authorization isolation', () => {
  it('does not let client A read client B after Auth0 login, even with admin claims', async () => {
    const env = createTestEnv()
    await addClient(env, { id: 'client-a', email: 'a@example.com', password: 'aaaaaaaaaa' })
    await addClient(env, { id: 'client-b', email: 'b@example.com', password: 'bbbbbbbbbb' })
    db(env).insert('matters', { id: 'matter-b', client_user_id: 'client-b', title: 'B only' })
    db(env).insert('external_identities', {
      id: 'eid-a', user_id: 'client-a', provider: 'google-oauth2', issuer: ISSUER, subject: 'google-oauth2|abc', email_verified: 1,
    })
    const app = appFor(env, mockBridge({ identity: identity({ email: 'a@example.com', claims: { iss: ISSUER, sub: 'google-oauth2|abc', email_verified: true, roles: ['admin'] } }) }))
    const res = await app.request('/api/auth/auth0/callback?code=iso&state=abc')
    const token = cookie(res, 'pmv_session')
    const session = JSON.parse(await env.SESSIONS.get(`sess:${token}`) as string) as SessionUser
    expect(session.role).toBe('client')
    expect(session.id).toBe('client-a')
    expect(await canAccessClient(env, session, 'client-b')).toBe(false)
    const scope = await scopeFilter(env, session)
    expect(scope.params).toEqual(['client-a'])
  })

  it('keeps trusted-contact grants limited after Auth0 login', async () => {
    const env = createTestEnv()
    await addClient(env, { id: 'client-a', email: 'a@example.com', password: 'aaaaaaaaaa' })
    db(env).insert('users', {
      id: 'trusted-1', email: 'trust@example.com', role: 'trusted_contact', status: 'active', password_hash: null, full_name: 'Trusty',
    })
    db(env).insert('trusted_contacts', {
      id: 'rel-1',
      client_user_id: 'client-a',
      contact_user_id: 'trusted-1',
      status: 'active',
      permissions_json: JSON.stringify({ documents: 'none', billing: 'none', tasks: 'view' }),
    })
    db(env).insert('external_identities', {
      id: 'eid-t', user_id: 'trusted-1', provider: 'google-oauth2', issuer: ISSUER, subject: 'google-oauth2|abc', email_verified: 1,
    })
    const app = appFor(env, mockBridge({ identity: identity({ email: 'trust@example.com' }) }))
    const res = await app.request('/api/auth/auth0/callback?code=trusted&state=abc')
    const token = cookie(res, 'pmv_session')
    const session = JSON.parse(await env.SESSIONS.get(`sess:${token}`) as string) as SessionUser
    expect(session.role).toBe('trusted_contact')
    expect(await trustedAccess(env, session, 'client-a', 'documents', 'view')).toBeNull()
    expect(await trustedAccess(env, session, 'client-a', 'tasks', 'view')).toBeTruthy()
    expect(await canAccessClient(env, session, 'client-a')).toBe(false)
  })
})

describe('local logout', () => {
  it('invalidates the Pinnacle session without requiring Auth0 logout', async () => {
    const env = createTestEnv()
    await addClient(env, { id: 'user-1', email: 'pat@example.com', password: 'old-password-1' })
    const token = await createSession(env, { id: 'user-1', email: 'pat@example.com', role: 'client', full_name: 'Pat Lee' })
    const app = appFor(env)
    const res = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: `pmv_session=${token}` },
    })
    const body = await res.json() as { ok: boolean; federated_logout_url: string | null }
    expect(body.ok).toBe(true)
    expect(body.federated_logout_url).toBeNull()
    expect(await env.SESSIONS.get(`sess:${token}`)).toBeNull()
  })
})

describe('missing Auth0 configuration fails safely', () => {
  it('hides status and does not issue a working login redirect', async () => {
    const env = createTestEnv({
      AUTH0_DOMAIN: '',
      AUTH0_CLIENT_ID: '',
      AUTH0_CLIENT_SECRET: '',
      AUTH0_CALLBACK_URL: '',
      AUTH0_LOGOUT_URL: '',
    })
    const app = appFor(env)
    const status = await app.request('/api/auth/auth0/status')
    expect(await status.json()).toEqual({ enabled: false, connections: [] })
    const login = await app.request('/api/auth/auth0/login?connection=google-oauth2')
    expect(login.headers.get('location')).toContain('/portal/login?auth0=error')
  })
})

describe('migration 0072', () => {
  it('adds external_identities without cascading deletes onto users', () => {
    const sql = readFileSync(new URL('../migrations/0072_external_identities.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS external_identities/i)
    expect(sql).toMatch(/UNIQUE \(issuer, subject\)/)
    expect(sql).toMatch(/REFERENCES users\(id\) ON DELETE CASCADE/)
    expect(sql).not.toMatch(/REFERENCES users\(id\) ON DELETE CASCADE[\s\S]*REFERENCES external_identities/i)
  })
})
