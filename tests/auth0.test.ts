import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { hashPassword, verifyPassword } from '../functions/_lib/crypto'
import { canAccessClient } from '../functions/_lib/access'
import { normalizeTrustedPermissions } from '../functions/_lib/trustedAccess'
import { createSession, destroySession, getUser, rotateSession } from '../functions/_lib/session'
import { inspectAuth0Config, isAuth0Ready, resolveProvider, AUTH0_GENERIC_ERROR } from '../functions/_lib/auth0/config'
import { validateReturnTo } from '../functions/_lib/auth0/returnTo'
import { claimsGrantNoAuthorization, extractIdentityClaims } from '../functions/_lib/auth0/claims'
import { canUnlinkIdentity, type ExternalIdentityRow, type LinkedUser } from '../functions/_lib/auth0/identities'
import { confirmAuth0Link, resolveAuth0Login, unlinkIdentityForUser } from '../functions/_lib/auth0/resolve'
import type { Env, SessionUser } from '../functions/_lib/types'
import type { Auth0IdentityClaims } from '../functions/_lib/auth0/claims'
import type { Auth0AppState } from '../functions/_lib/auth0/sdk'
import type { Auth0Provider } from '../functions/_lib/auth0/config'

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
  const invites: FakeRow[] = []
  const trusted: FakeRow[] = []

  function bound(sql: string, params: unknown[]) {
    const text = sql.replace(/\s+/g, ' ')
    return {
      async first<T>() {
        if (/FROM users WHERE email = \?/.test(text) || /FROM users WHERE email=\?/.test(text)) {
          return (users.find((row) => row.email === params[0]) || null) as T
        }
        if (/FROM users WHERE id = \?/.test(text) || /FROM users WHERE id=\?/.test(text)) {
          const row = users.find((item) => item.id === params[0])
          if (!row) return null as T
          if (/SELECT email FROM users/.test(text)) return { email: row.email } as T
          if (/SELECT password_hash/.test(text)) return { password_hash: row.password_hash } as T
          return row as T
        }
        if (/FROM external_identities WHERE issuer = \? AND subject = \?/.test(text)) {
          return (identities.find((row) => row.issuer === params[0] && row.subject === params[1]) || null) as T
        }
        if (/FROM external_identities WHERE id = \?/.test(text)) {
          return (identities.find((row) => row.id === params[0]) || null) as T
        }
        if (/FROM access_invites/.test(text)) {
          return (invites.find((row) => row.email === params[0] && row.status === 'pending') || null) as T
        }
        if (/FROM contact_inquiries/.test(text)) return null as T
        return null as T
      },
      async all<T>() {
        if (/FROM external_identities WHERE user_id = \?/.test(text)) {
          return { results: identities.filter((row) => row.user_id === params[0]) as T[] }
        }
        if (/FROM contact_inquiries/.test(text)) return { results: [] as T[] }
        if (/FROM staff_assignments/.test(text)) {
          return { results: [] as T[] }
        }
        return { results: [] as T[] }
      },
      async run() {
        if (/INSERT INTO users/.test(text)) {
          const roleMatch = text.match(/'([^']+)'/)
          users.push({
            id: params[0],
            email: params[1],
            password_hash: text.includes('NULL') ? null : params[2],
            role: text.includes("'trusted_contact'") ? 'trusted_contact' : 'client',
            full_name: text.includes("'trusted_contact'") ? params[2] : params[2],
            first_name: text.includes("'trusted_contact'") ? params[3] : params[3],
            last_name: text.includes("'trusted_contact'") ? params[4] : params[4],
            status: 'active',
          })
          return { meta: { changes: 1 } }
        }
        if (/INSERT INTO external_identities/.test(text)) {
          if (identities.some((row) => row.issuer === params[3] && row.subject === params[4])) {
            throw new Error('UNIQUE constraint failed: issuer+subject')
          }
          identities.push({
            id: params[0],
            user_id: params[1],
            provider: params[2],
            issuer: params[3],
            subject: params[4],
            email: params[5],
            email_verified: params[6],
            created_at: new Date().toISOString(),
            last_login_at: new Date().toISOString(),
          })
          return { meta: { changes: 1 } }
        }
        if (/DELETE FROM external_identities/.test(text)) {
          const before = identities.length
          for (let i = identities.length - 1; i >= 0; i--) {
            if (identities[i].id === params[0] && identities[i].user_id === params[1]) identities.splice(i, 1)
          }
          return { meta: { changes: before === identities.length ? 0 : 1 } }
        }
        if (/UPDATE users SET last_login_at/.test(text) || /UPDATE external_identities SET last_login_at/.test(text)) {
          return { meta: { changes: 1 } }
        }
        if (/UPDATE access_invites/.test(text)) {
          const invite = invites.find((row) => row.id === params[params.length - 1] || row.id === params[1])
          if (invite) invite.status = 'accepted'
          return { meta: { changes: 1 } }
        }
        if (/UPDATE trusted_contacts/.test(text)) return { meta: { changes: 1 } }
        if (/INSERT INTO auth_sessions/.test(text)) return { meta: { changes: 1 } }
        if (/INSERT INTO audit_log/.test(text)) return { meta: { changes: 1 } }
        if (/INSERT INTO activity_events/.test(text)) return { meta: { changes: 1 } }
        if (/INSERT INTO client_profiles/.test(text)) return { meta: { changes: 1 } }
        if (/INSERT INTO relationship_/.test(text) || /INSERT INTO account_parties/.test(text) || /UPDATE client_profiles/.test(text)) {
          return { meta: { changes: 1 } }
        }
        if (/UPDATE contact_inquiries/.test(text)) return { meta: { changes: 1 } }
        if (/UPDATE users SET full_name/.test(text)) return { meta: { changes: 1 } }
        return { meta: { changes: 1 } }
      },
    }
  }

  return {
    users,
    identities,
    invites,
    trusted,
    prepare(sql: string) {
      const statement = bound(sql, [])
      return { ...statement, bind: (...params: unknown[]) => bound(sql, params) }
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      return Promise.all(statements.map((statement) => statement.run()))
    },
  }
}

function readyEnv(overrides: Partial<Env> = {}): Env {
  const db = createFakeDb()
  const kv = new MemoryKV()
  return {
    DB: db as unknown as D1Database,
    SESSIONS: kv as unknown as KVNamespace,
    SESSION_SECRET: 'local-dev-testing-secret-not-real',
    PAYMENT_ENCRYPTION_KEY: 'local-dev-payment-key-not-real-either',
    AUTH0_DOMAIN: 'pmv-test.us.auth0.com',
    AUTH0_CLIENT_ID: 'client-id',
    AUTH0_CLIENT_SECRET: 'client-secret',
    AUTH0_CALLBACK_URL: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback',
    AUTH0_LOGOUT_URL: 'https://www.pinnaclemanagementventures.com/portal/login',
    ...overrides,
  }
}

function fakeRequest(url = 'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback', cookie?: string) {
  return new Request(url, { headers: cookie ? { Cookie: cookie } : {} })
}

function claims(partial: Partial<Auth0IdentityClaims> = {}): Auth0IdentityClaims {
  return {
    iss: 'https://pmv-test.us.auth0.com/',
    sub: 'google-oauth2|abc',
    email: 'new.client@example.com',
    emailVerified: true,
    givenName: 'Ada',
    familyName: 'Lovelace',
    fullName: 'Ada Lovelace',
    connection: 'google-oauth2',
    ...partial,
  }
}

const google: Auth0Provider = { id: 'google', label: 'Google', connection: 'google-oauth2' }

function appState(partial: Partial<Auth0AppState> = {}): Auth0AppState {
  return { intent: 'login', returnTo: '/portal', connection: 'google-oauth2', provider: 'google', ...partial }
}

function addUser(env: Env, user: Partial<LinkedUser> & { id: string; email: string }) {
  const db = env.DB as unknown as ReturnType<typeof createFakeDb>
  db.users.push({
    id: user.id,
    email: user.email,
    role: user.role || 'client',
    full_name: user.full_name || 'Test User',
    first_name: user.first_name || 'Test',
    last_name: user.last_name || 'User',
    status: user.status || 'active',
    password_hash: user.password_hash === undefined ? 'pbkdf2p$hash' : user.password_hash,
  })
}

function addIdentity(env: Env, row: Partial<ExternalIdentityRow> & { user_id: string; issuer: string; subject: string }) {
  const db = env.DB as unknown as ReturnType<typeof createFakeDb>
  db.identities.push({
    id: row.id || 'id-1',
    user_id: row.user_id,
    provider: row.provider || 'google-oauth2',
    issuer: row.issuer,
    subject: row.subject,
    email: row.email || null,
    email_verified: row.email_verified ?? 1,
    created_at: row.created_at || '2026-01-01',
    last_login_at: row.last_login_at || null,
  })
}

describe('password login remains functional', () => {
  it('still hashes and verifies peppered passwords', async () => {
    const hash = await hashPassword('correct-horse-battery', 'pepper')
    expect(hash.startsWith('pbkdf2p$')).toBe(true)
    expect(await verifyPassword('correct-horse-battery', hash, 'pepper')).toBe(true)
    expect(await verifyPassword('wrong-password', hash, 'pepper')).toBe(false)
  })

  it('keeps the existing email/password login route', () => {
    const source = readFileSync(new URL('../functions/_lib/routes/auth.ts', import.meta.url), 'utf8')
    expect(source).toContain("authRoutes.post('/login'")
    expect(source).toContain('invalid email or password')
    expect(source).toContain("authRoutes.post('/forgot-password'")
    expect(source).toContain("authRoutes.post('/logout'")
  })
})

describe('Auth0 configuration', () => {
  it('disables Auth0 when no variables are set', () => {
    const env = readyEnv({
      AUTH0_DOMAIN: undefined,
      AUTH0_CLIENT_ID: undefined,
      AUTH0_CLIENT_SECRET: undefined,
      AUTH0_CALLBACK_URL: undefined,
      AUTH0_LOGOUT_URL: undefined,
    })
    expect(inspectAuth0Config(env).status).toBe('disabled')
    expect(isAuth0Ready(env)).toBe(false)
  })

  it('fails safely on partial configuration instead of enabling a broken button', () => {
    const env = readyEnv({ AUTH0_CLIENT_SECRET: undefined })
    const inspected = inspectAuth0Config(env)
    expect(inspected.status).toBe('invalid')
    expect(isAuth0Ready(env)).toBe(false)
  })

  it('resolves configured Google and Microsoft connections', () => {
    const env = readyEnv()
    expect(resolveProvider(env, 'google')?.connection).toBe('google-oauth2')
    expect(resolveProvider(env, 'microsoft')?.connection).toBe('windowslive')
    expect(resolveProvider(env, 'unknown')).toBeNull()
  })
})

describe('return URL allowlisting', () => {
  const request = fakeRequest('https://www.pinnaclemanagementventures.com/portal/login')

  it('accepts portal paths and rejects open redirects', () => {
    expect(validateReturnTo('/portal', request)).toBe('/portal')
    expect(validateReturnTo('/portal/services/funding/apply', request)).toBe('/portal/services/funding/apply')
    expect(validateReturnTo('https://evil.example/phish', request)).toBe('/portal')
    expect(validateReturnTo('//evil.example', request)).toBe('/portal')
    expect(validateReturnTo('/\\evil.example', request)).toBe('/portal')
    expect(validateReturnTo('/portal?next=https://evil.example', request)).toBe('/portal')
    expect(validateReturnTo('/admin', request)).toBe('/portal')
    expect(validateReturnTo('javascript:alert(1)', request)).toBe('/portal')
  })
})

describe('Auth0 claims', () => {
  it('extracts identity fields and ignores authorization claims', () => {
    const user = {
      sub: 'google-oauth2|abc',
      iss: 'https://pmv-test.us.auth0.com/',
      email: 'ada@example.com',
      email_verified: true,
      given_name: 'Ada',
      family_name: 'Lovelace',
      role: 'admin',
      roles: ['owner'],
      permissions: ['manage_users'],
      org_id: 'org_hack',
    }
    const extracted = extractIdentityClaims(user, 'https://pmv-test.us.auth0.com/')
    expect(extracted?.sub).toBe('google-oauth2|abc')
    expect(extracted?.email).toBe('ada@example.com')
    expect(extracted?.emailVerified).toBe(true)
    expect(extracted?.iss).toBe('https://pmv-test.us.auth0.com/')
    expect((extracted as unknown as { role?: string }).role).toBeUndefined()
    expect(claimsGrantNoAuthorization(user)).toEqual(['role', 'roles', 'permissions', 'org_id'])
  })

  it('rejects a mismatched or missing issuer', () => {
    const user = { sub: 'google-oauth2|abc', iss: 'https://evil.example/', email: 'ada@example.com', email_verified: true }
    expect(extractIdentityClaims(user, 'https://pmv-test.us.auth0.com/')).toBeNull()
    expect(extractIdentityClaims({ sub: 'google-oauth2|abc', email: 'ada@example.com', email_verified: true }, 'https://pmv-test.us.auth0.com/')).toBeNull()
  })
})

describe('identity linking rules', () => {
  const identity = (id: string): ExternalIdentityRow => ({
    id, user_id: 'u1', provider: 'google-oauth2', issuer: 'https://pmv-test.us.auth0.com/', subject: `sub-${id}`,
    email: 'a@example.com', email_verified: 1, created_at: '2026-01-01', last_login_at: null,
  })

  it('prevents unlinking the final authentication method', () => {
    const user = { password_hash: null }
    expect(canUnlinkIdentity(user, [identity('a')], 'a').ok).toBe(false)
    expect(canUnlinkIdentity({ password_hash: 'hash' }, [identity('a')], 'a').ok).toBe(true)
    expect(canUnlinkIdentity(user, [identity('a'), identity('b')], 'a').ok).toBe(true)
  })
})

describe('Auth0 callback resolution', () => {
  it('logs an existing linked user in without using Auth0 roles', async () => {
    const env = readyEnv()
    addUser(env, { id: 'client-a', email: 'ada@example.com', role: 'client' })
    addIdentity(env, { id: 'eid-1', user_id: 'client-a', issuer: 'https://pmv-test.us.auth0.com/', subject: 'google-oauth2|abc' })
    const result = await resolveAuth0Login({
      env,
      request: fakeRequest(),
      claims: claims({ email: 'ada@example.com' }),
      appState: appState(),
      provider: google,
      confirmLinkBase: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/confirm-link',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.user.id).toBe('client-a')
      expect(result.user.role).toBe('client')
    }
  })

  it('does not auto-link a duplicate email identity', async () => {
    const env = readyEnv()
    addUser(env, { id: 'client-a', email: 'ada@example.com', role: 'client' })
    const result = await resolveAuth0Login({
      env,
      request: fakeRequest(),
      claims: claims({ email: 'ada@example.com', sub: 'google-oauth2|new' }),
      appState: appState(),
      provider: google,
      confirmLinkBase: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/confirm-link',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('link')
    const db = env.DB as unknown as ReturnType<typeof createFakeDb>
    expect(db.identities).toHaveLength(0)
    expect(env.SESSIONS).toBeTruthy()
  })

  it('does not link Auth0 onto a staff account', async () => {
    const env = readyEnv()
    addUser(env, { id: 'staff-a', email: 'staff@example.com', role: 'admin' })
    const result = await resolveAuth0Login({
      env,
      request: fakeRequest(),
      claims: claims({ email: 'staff@example.com', sub: 'google-oauth2|staff' }),
      appState: appState({ intent: 'link', userId: 'staff-a' }),
      provider: google,
      authenticatedUserId: 'staff-a',
      confirmLinkBase: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/confirm-link',
    })
    expect(result.ok).toBe(false)
    const db = env.DB as unknown as ReturnType<typeof createFakeDb>
    expect(db.identities).toHaveLength(0)
  })

  it('rejects an identity already linked to another user during explicit link', async () => {
    const env = readyEnv()
    addUser(env, { id: 'client-a', email: 'ada@example.com' })
    addUser(env, { id: 'client-b', email: 'bob@example.com' })
    addIdentity(env, { id: 'eid-1', user_id: 'client-b', issuer: 'https://pmv-test.us.auth0.com/', subject: 'google-oauth2|abc' })
    const result = await resolveAuth0Login({
      env,
      request: fakeRequest(),
      claims: claims({ email: 'ada@example.com' }),
      appState: appState({ intent: 'link', userId: 'client-a' }),
      provider: google,
      authenticatedUserId: 'client-a',
      confirmLinkBase: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/confirm-link',
    })
    expect(result.ok).toBe(false)
  })

  it('links when an authenticated user explicitly connects a verified identity', async () => {
    const env = readyEnv()
    addUser(env, { id: 'client-a', email: 'ada@example.com' })
    const result = await resolveAuth0Login({
      env,
      request: fakeRequest(),
      claims: claims({ email: 'ada@example.com', sub: 'google-oauth2|new' }),
      appState: appState({ intent: 'link', userId: 'client-a' }),
      provider: google,
      authenticatedUserId: 'client-a',
      confirmLinkBase: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/confirm-link',
    })
    expect(result.ok).toBe(true)
    const db = env.DB as unknown as ReturnType<typeof createFakeDb>
    expect(db.identities).toHaveLength(1)
    expect(db.identities[0].user_id).toBe('client-a')
  })

  it('rejects staff identities from the client portal', async () => {
    const env = readyEnv()
    addUser(env, { id: 'staff-a', email: 'staff@example.com', role: 'admin' })
    addIdentity(env, { id: 'eid-1', user_id: 'staff-a', issuer: 'https://pmv-test.us.auth0.com/', subject: 'google-oauth2|abc' })
    const result = await resolveAuth0Login({
      env,
      request: fakeRequest(),
      claims: claims({ email: 'staff@example.com' }),
      appState: appState(),
      provider: google,
      confirmLinkBase: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/confirm-link',
    })
    expect(result.ok).toBe(false)
  })

  it('does not create an account from an unverified Auth0 email', async () => {
    const env = readyEnv()
    const result = await resolveAuth0Login({
      env,
      request: fakeRequest(),
      claims: claims({ emailVerified: false }),
      appState: appState(),
      provider: google,
      confirmLinkBase: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/confirm-link',
    })
    expect(result.ok).toBe(false)
    const db = env.DB as unknown as ReturnType<typeof createFakeDb>
    expect(db.users).toHaveLength(0)
    expect(db.identities).toHaveLength(0)
  })

  it('rejects a disabled internal user', async () => {
    const env = readyEnv()
    addUser(env, { id: 'client-a', email: 'ada@example.com', status: 'suspended' })
    addIdentity(env, { id: 'eid-1', user_id: 'client-a', issuer: 'https://pmv-test.us.auth0.com/', subject: 'google-oauth2|abc' })
    const result = await resolveAuth0Login({
      env,
      request: fakeRequest(),
      claims: claims({ email: 'ada@example.com' }),
      appState: appState(),
      provider: google,
      confirmLinkBase: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/confirm-link',
    })
    expect(result.ok).toBe(false)
  })

  it('creates a new onboarding client for an unknown verified Auth0 identity', async () => {
    const env = readyEnv()
    const result = await resolveAuth0Login({
      env,
      request: fakeRequest(),
      claims: claims(),
      appState: appState(),
      provider: google,
      confirmLinkBase: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/confirm-link',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.created).toBe(true)
      expect(result.user.role).toBe('client')
      expect(result.user.email).toBe('new.client@example.com')
    }
  })

  it('does not give Client A access to Client B after Auth0 login', async () => {
    const env = readyEnv()
    const userA: SessionUser = { id: 'client-a', email: 'a@example.com', role: 'client', full_name: 'A' }
    expect(await canAccessClient(env, userA, 'client-a')).toBe(true)
    expect(await canAccessClient(env, userA, 'client-b')).toBe(false)
  })

  it('keeps trusted-contact grants limited after identity login', () => {
    const permissions = normalizeTrustedPermissions({ documents: 'edit', billing: 'edit', messages: 'view' })
    expect(permissions.documents).toBe('view')
    expect(permissions.billing).toBe('view')
    expect(permissions.messages).toBe('view')
  })

  it('returns a generic error that does not enumerate accounts', async () => {
    const env = readyEnv()
    addUser(env, { id: 'client-a', email: 'ada@example.com' })
    const result = await resolveAuth0Login({
      env,
      request: fakeRequest(),
      claims: claims({ email: 'ada@example.com', sub: 'google-oauth2|other' }),
      appState: appState(),
      provider: google,
      confirmLinkBase: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/confirm-link',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe(AUTH0_GENERIC_ERROR)
  })
})

describe('email confirmation linking', () => {
  it('consumes a single-use link token and attaches the identity', async () => {
    const env = readyEnv()
    addUser(env, { id: 'client-a', email: 'ada@example.com' })
    await env.SESSIONS.put('auth0-link:tok', JSON.stringify({
      userId: 'client-a',
      issuer: 'https://pmv-test.us.auth0.com/',
      subject: 'google-oauth2|abc',
      provider: 'google-oauth2',
      providerId: 'google',
      email: 'ada@example.com',
      emailVerified: true,
    }))
    const first = await confirmAuth0Link(env, fakeRequest(), 'tok')
    expect(first.ok).toBe(true)
    const replay = await confirmAuth0Link(env, fakeRequest(), 'tok')
    expect(replay.ok).toBe(false)
  })
})

describe('safe unlinking', () => {
  it('unlinks when another authentication method remains', async () => {
    const env = readyEnv()
    addUser(env, { id: 'client-a', email: 'ada@example.com', password_hash: 'hash' })
    addIdentity(env, { id: 'eid-1', user_id: 'client-a', issuer: 'https://pmv-test.us.auth0.com/', subject: 'google-oauth2|abc' })
    const result = await unlinkIdentityForUser(env, fakeRequest(), {
      id: 'client-a', email: 'ada@example.com', role: 'client', full_name: 'Ada',
    }, 'eid-1')
    expect(result.ok).toBe(true)
    const db = env.DB as unknown as ReturnType<typeof createFakeDb>
    expect(db.identities).toHaveLength(0)
  })

  it('refuses to unlink the final authentication method', async () => {
    const env = readyEnv()
    addUser(env, { id: 'client-a', email: 'ada@example.com', password_hash: null })
    addIdentity(env, { id: 'eid-1', user_id: 'client-a', issuer: 'https://pmv-test.us.auth0.com/', subject: 'google-oauth2|abc' })
    const result = await unlinkIdentityForUser(env, fakeRequest(), {
      id: 'client-a', email: 'ada@example.com', role: 'client', full_name: 'Ada',
    }, 'eid-1')
    expect(result.ok).toBe(false)
    const db = env.DB as unknown as ReturnType<typeof createFakeDb>
    expect(db.identities).toHaveLength(1)
  })
})

describe('session rotation', () => {
  it('destroys the previous session id and issues a new one', async () => {
    const env = readyEnv()
    addUser(env, { id: 'client-a', email: 'ada@example.com', status: 'active', role: 'client' })
    const user: SessionUser = { id: 'client-a', email: 'ada@example.com', role: 'client', full_name: 'Ada', first_name: 'Ada', last_name: 'Lovelace' }
    const first = await createSession(env, user)
    const rotated = await rotateSession(env, fakeRequest('https://www.pinnaclemanagementventures.com/', `pmv_session=${first}`), user)
    expect(rotated).not.toBe(first)
    expect(await env.SESSIONS.get(`sess:${first}`)).toBeNull()
    expect(await env.SESSIONS.get(`sess:${rotated}`)).toBeTruthy()
    const live = await getUser(env, fakeRequest('https://www.pinnaclemanagementventures.com/', `pmv_session=${rotated}`))
    expect(live?.id).toBe('client-a')
  })

  it('local logout invalidates the Pinnacle session', async () => {
    const env = readyEnv()
    addUser(env, { id: 'client-a', email: 'ada@example.com', status: 'active', role: 'client' })
    const user: SessionUser = { id: 'client-a', email: 'ada@example.com', role: 'client', full_name: 'Ada' }
    const token = await createSession(env, user)
    const request = fakeRequest('https://www.pinnaclemanagementventures.com/', `pmv_session=${token}`)
    await destroySession(env, request)
    expect(await env.SESSIONS.get(`sess:${token}`)).toBeNull()
    expect(await getUser(env, request)).toBeNull()
  })
})

describe('login page Auth0 UI', () => {
  it('keeps password login and adds accessible provider controls', () => {
    const login = readFileSync(new URL('../src/pages/auth/Login.tsx', import.meta.url), 'utf8')
    expect(login).toContain('Auth0Buttons')
    expect(login).toContain('Forgot password?')
    expect(login).toContain('auth_error')
    expect(login).toContain('min-h-12')
    expect(login).toContain('aria-label')
    expect(login).toContain('Google or Microsoft')
    expect(login).not.toMatch(/\bSSO\b/)
    expect(login).not.toContain('encrypted')
    const buttons = readFileSync(new URL('../src/components/auth/Auth0Buttons.tsx', import.meta.url), 'utf8')
    expect(buttons).toContain('Continue with')
    expect(buttons).toContain('Google')
    expect(buttons).toContain('Microsoft')
    expect(buttons).toContain('focus-visible:ring-4')
    expect(buttons).toContain('disabled={busy}')
  })

  it('adds a Security section for connected methods', () => {
    const security = readFileSync(new URL('../src/pages/portal/Security.tsx', import.meta.url), 'utf8')
    expect(security).toContain('Connected sign-in methods')
    expect(security).toContain('/auth/auth0/link')
    expect(security).toContain('/auth/auth0/unlink')
    expect(security).toContain('Connect')
  })
})

afterEach(() => {
  // no shared SDK override in this file
})
