import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  AUTH0_PROVIDERS,
  publicAuth0Status,
  resolveAuth0Config,
  sanitizeAuth0ReturnTo,
} from '../functions/_lib/auth0Config'
import {
  buildAuth0Transaction,
  consumeAuth0Transaction,
  newAuth0Nonce,
  newAuth0State,
  saveAuth0Transaction,
} from '../functions/_lib/auth0Transaction'
import {
  claimsToAuth0Identity,
  countAuthMethods,
  linkExternalIdentity,
  resolveAuth0LoginUser,
  unlinkExternalIdentity,
} from '../functions/_lib/externalIdentities'
import { setAuth0ClientFactory } from '../functions/_lib/auth0Client'
import { canAccessClient } from '../functions/_lib/access'
import { normalizeTrustedPermissions } from '../functions/_lib/trustedAccess'
import type { Env, SessionUser } from '../functions/_lib/types'

type KvEntry = { value: string; expiresAt?: number }

function createMemoryKv() {
  const store = new Map<string, KvEntry>()
  return {
    async get(key: string) {
      const entry = store.get(key)
      if (!entry) return null
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        store.delete(key)
        return null
      }
      return entry.value
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, {
        value,
        expiresAt: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : undefined,
      })
    },
    async delete(key: string) {
      store.delete(key)
    },
    async list() {
      return { keys: [...store.keys()].map((name) => ({ name })) }
    },
    _store: store,
  }
}

type Row = Record<string, unknown>

function createMemoryDb() {
  const users = new Map<string, Row>()
  const identities = new Map<string, Row>()
  const byEmail = new Map<string, string>()

  function runSelect(sql: string, binds: unknown[]): Row | null {
    if (/FROM users WHERE id = \?/.test(sql)) return users.get(String(binds[0])) || null
    if (/FROM users WHERE email = \?/.test(sql)) {
      const id = byEmail.get(String(binds[0]).toLowerCase())
      return id ? users.get(id) || null : null
    }
    if (/FROM external_identities WHERE issuer = \? AND subject = \?/.test(sql)) {
      for (const row of identities.values()) {
        if (row.issuer === binds[0] && row.subject === binds[1]) return row
      }
      return null
    }
    if (/FROM external_identities WHERE id = \?/.test(sql)) return identities.get(String(binds[0])) || null
    if (/SELECT password_hash FROM users WHERE id = \?/.test(sql)) {
      const u = users.get(String(binds[0]))
      return u ? { password_hash: u.password_hash } : null
    }
    return null
  }

  function runAll(sql: string, binds: unknown[]): Row[] {
    if (/FROM external_identities WHERE user_id = \?/.test(sql)) {
      return [...identities.values()].filter((row) => row.user_id === binds[0])
    }
    return []
  }

  function runWrite(sql: string, binds: unknown[]) {
    if (/INSERT INTO users/.test(sql)) {
      const [id, email, , role, full_name, first_name, last_name] = binds
      const row = {
        id, email, password_hash: null, role, full_name, first_name, last_name, status: 'active',
      }
      users.set(String(id), row)
      byEmail.set(String(email).toLowerCase(), String(id))
      return
    }
    if (/INSERT INTO external_identities/.test(sql)) {
      const [id, user_id, provider, connection_name, issuer, subject, provider_email, email_verified] = binds
      for (const existing of identities.values()) {
        if (existing.issuer === issuer && existing.subject === subject) {
          throw new Error('UNIQUE constraint failed: external_identities.issuer, external_identities.subject')
        }
      }
      identities.set(String(id), {
        id, user_id, provider, connection_name, issuer, subject, provider_email,
        email_verified, created_at: new Date().toISOString(), last_login_at: new Date().toISOString(),
      })
      return
    }
    if (/DELETE FROM external_identities WHERE id = \? AND user_id = \?/.test(sql)) {
      const row = identities.get(String(binds[0]))
      if (row && row.user_id === binds[1]) identities.delete(String(binds[0]))
      return
    }
    if (/UPDATE external_identities SET last_login_at/.test(sql)) return
    if (/UPDATE users SET last_login_at/.test(sql)) return
    if (/INSERT INTO client_profiles/.test(sql)) return
    if (/INSERT INTO relationship_/.test(sql)) return
    if (/INSERT INTO account_parties/.test(sql)) return
    if (/UPDATE client_profiles/.test(sql)) return
  }

  const prepare = (sql: string) => {
    let binds: unknown[] = []
    const stmt = {
      bind(...args: unknown[]) {
        binds = args
        return stmt
      },
      async first<T = Row>() {
        return runSelect(sql, binds) as T | null
      },
      async all<T = Row>() {
        return { results: runAll(sql, binds) as T[] }
      },
      async run() {
        runWrite(sql, binds)
        return { success: true }
      },
    }
    return stmt
  }

  return {
    prepare,
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      for (const s of statements) await s.run()
    },
    _users: users,
    _identities: identities,
    _seedUser(user: Row) {
      users.set(String(user.id), user)
      byEmail.set(String(user.email).toLowerCase(), String(user.id))
    },
  }
}

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: createMemoryDb() as unknown as D1Database,
    SESSIONS: createMemoryKv() as unknown as KVNamespace,
    SESSION_SECRET: 'test-session-secret',
    PAYMENT_ENCRYPTION_KEY: 'test-payment-key',
    ...overrides,
  }
}

describe('Auth0 configuration', () => {
  it('disables safely when credentials are missing', () => {
    const cfg = resolveAuth0Config(testEnv())
    expect(cfg.enabled).toBe(false)
    expect(cfg.connections).toEqual([])
    expect(cfg.missing).toContain('AUTH0_DOMAIN')
    expect(publicAuth0Status(testEnv()).enabled).toBe(false)
    expect(publicAuth0Status(testEnv()).providers).toEqual([])
  })

  it('respects AUTH0_ENABLED=false even with credentials', () => {
    const cfg = resolveAuth0Config(testEnv({
      AUTH0_DOMAIN: 'tenant.auth0.com',
      AUTH0_CLIENT_ID: 'client',
      AUTH0_CLIENT_SECRET: 'secret',
      AUTH0_ENABLED: 'false',
    }))
    expect(cfg.enabled).toBe(false)
  })

  it('enables with required credentials and defaults production URLs', () => {
    const cfg = resolveAuth0Config(testEnv({
      AUTH0_DOMAIN: 'https://tenant.auth0.com/',
      AUTH0_CLIENT_ID: 'client',
      AUTH0_CLIENT_SECRET: 'secret',
    }))
    expect(cfg.enabled).toBe(true)
    expect(cfg.domain).toBe('tenant.auth0.com')
    expect(cfg.issuer).toBe('https://tenant.auth0.com/')
    expect(cfg.callbackUrl).toBe('https://www.pinnaclemanagementventures.com/api/auth/auth0/callback')
    expect(cfg.logoutUrl).toBe('https://www.pinnaclemanagementventures.com/portal/login')
    expect(cfg.connections).toEqual(['google-oauth2', 'windowslive'])
    expect(publicAuth0Status(testEnv({
      AUTH0_DOMAIN: 'tenant.auth0.com',
      AUTH0_CLIENT_ID: 'client',
      AUTH0_CLIENT_SECRET: 'secret',
    })).providers.map((p) => p.id)).toEqual(['google-oauth2', 'windowslive'])
  })
})

describe('Auth0 returnTo allowlist', () => {
  it('accepts portal-relative paths and rejects open redirects', () => {
    expect(sanitizeAuth0ReturnTo('/portal')).toBe('/portal')
    expect(sanitizeAuth0ReturnTo('/portal/security')).toBe('/portal/security')
    expect(sanitizeAuth0ReturnTo('/portal/services/tax/apply?offering=1')).toBe('/portal/services/tax/apply?offering=1')
    expect(sanitizeAuth0ReturnTo('https://evil.example/phish')).toBe('/portal')
    expect(sanitizeAuth0ReturnTo('//evil.example')).toBe('/portal')
    expect(sanitizeAuth0ReturnTo('/\\evil')).toBe('/portal')
    expect(sanitizeAuth0ReturnTo('javascript:alert(1)')).toBe('/portal')
    expect(sanitizeAuth0ReturnTo('/admin')).toBe('/portal')
  })
})

describe('Auth0 transaction store', () => {
  it('is single-use and rejects replays', async () => {
    const env = testEnv()
    const state = newAuth0State()
    const nonce = newAuth0Nonce()
    await saveAuth0Transaction(env, state, buildAuth0Transaction({
      codeVerifier: 'verifier',
      nonce,
      returnTo: '/portal',
      mode: 'login',
      connection: 'google-oauth2',
    }))
    const first = await consumeAuth0Transaction(env, state)
    expect(first?.nonce).toBe(nonce)
    const replay = await consumeAuth0Transaction(env, state)
    expect(replay).toBeNull()
  })

  it('rejects expired transactions', async () => {
    const env = testEnv()
    const state = newAuth0State()
    await saveAuth0Transaction(env, state, buildAuth0Transaction({
      codeVerifier: 'verifier',
      nonce: 'nonce',
      returnTo: '/portal',
      mode: 'login',
      connection: 'windowslive',
      createdAt: Date.now() - 11 * 60 * 1000,
    }))
    expect(await consumeAuth0Transaction(env, state)).toBeNull()
  })
})

describe('Auth0 claims mapping', () => {
  it('requires issuer and subject and normalizes email verification', () => {
    const ok = claimsToAuth0Identity({
      iss: 'https://tenant.auth0.com/',
      sub: 'google-oauth2|123',
      email: 'Client@Example.com',
      email_verified: true,
      given_name: 'Ada',
      family_name: 'Lovelace',
    }, 'google-oauth2', 'https://tenant.auth0.com/')
    expect('error' in ok).toBe(false)
    if ('error' in ok) return
    expect(ok.email).toBe('client@example.com')
    expect(ok.emailVerified).toBe(true)
    expect(ok.subject).toBe('google-oauth2|123')

    expect(claimsToAuth0Identity({ sub: 'x' }, 'google-oauth2', 'https://tenant.auth0.com/')).toEqual({ error: 'missing identity claims' })
    expect(claimsToAuth0Identity({
      iss: 'https://evil.auth0.com/',
      sub: 'x',
    }, 'google-oauth2', 'https://tenant.auth0.com/')).toEqual({ error: 'issuer mismatch' })
  })
})

describe('Auth0 identity linking and login resolution', () => {
  it('does not auto-link when email already belongs to another Pinnacle user', async () => {
    const db = createMemoryDb()
    db._seedUser({
      id: 'user-a', email: 'a@example.com', password_hash: 'hash', role: 'client',
      full_name: 'User A', first_name: 'User', last_name: 'A', status: 'active',
    })
    const env = testEnv({ DB: db as unknown as D1Database })
    const result = await resolveAuth0LoginUser(env, {
      issuer: 'https://tenant.auth0.com/',
      subject: 'google-oauth2|new',
      email: 'a@example.com',
      emailVerified: true,
      connection: 'google-oauth2',
    })
    expect(result.kind).toBe('needs_link')
  })

  it('logs in an existing linked identity and refuses disabled users', async () => {
    const db = createMemoryDb()
    db._seedUser({
      id: 'user-a', email: 'a@example.com', password_hash: 'hash', role: 'client',
      full_name: 'User A', first_name: 'User', last_name: 'A', status: 'active',
    })
    db._identities.set('id-1', {
      id: 'id-1', user_id: 'user-a', provider: 'google-oauth2', connection_name: 'google-oauth2',
      issuer: 'https://tenant.auth0.com/', subject: 'google-oauth2|1',
      provider_email: 'a@example.com', email_verified: 1, created_at: 'now', last_login_at: null,
    })
    const env = testEnv({ DB: db as unknown as D1Database })
    const ok = await resolveAuth0LoginUser(env, {
      issuer: 'https://tenant.auth0.com/',
      subject: 'google-oauth2|1',
      email: 'a@example.com',
      emailVerified: true,
      connection: 'google-oauth2',
    })
    expect(ok.kind).toBe('ok')
    if (ok.kind === 'ok') expect(ok.user.id).toBe('user-a')

    db._users.get('user-a')!.status = 'suspended'
    const disabled = await resolveAuth0LoginUser(env, {
      issuer: 'https://tenant.auth0.com/',
      subject: 'google-oauth2|1',
      email: 'a@example.com',
      emailVerified: true,
      connection: 'google-oauth2',
    })
    expect(disabled.kind).toBe('disabled')
  })

  it('creates a new client for unknown Auth0 identity without attaching to others', async () => {
    const db = createMemoryDb()
    db._seedUser({
      id: 'client-b', email: 'b@example.com', password_hash: 'hash', role: 'client',
      full_name: 'Client B', first_name: 'Client', last_name: 'B', status: 'active',
    })
    const env = testEnv({ DB: db as unknown as D1Database })
    const created = await resolveAuth0LoginUser(env, {
      issuer: 'https://tenant.auth0.com/',
      subject: 'google-oauth2|brand-new',
      email: 'new@example.com',
      emailVerified: true,
      connection: 'google-oauth2',
      givenName: 'New',
      familyName: 'Client',
    })
    expect(created.kind).toBe('ok')
    if (created.kind !== 'ok') return
    expect(created.created).toBe(true)
    expect(created.user.email).toBe('new@example.com')
    expect(created.user.id).not.toBe('client-b')

    const userA: SessionUser = { id: created.user.id, email: created.user.email, role: 'client', full_name: created.user.full_name }
    expect(await canAccessClient(env, userA, 'client-b')).toBe(false)
    expect(await canAccessClient(env, userA, created.user.id)).toBe(true)
  })

  it('links only for the authenticated user and blocks cross-account identity reuse', async () => {
    const db = createMemoryDb()
    db._seedUser({
      id: 'user-a', email: 'a@example.com', password_hash: 'hash', role: 'client',
      full_name: 'User A', first_name: 'User', last_name: 'A', status: 'active',
    })
    db._seedUser({
      id: 'user-b', email: 'b@example.com', password_hash: 'hash', role: 'client',
      full_name: 'User B', first_name: 'User', last_name: 'B', status: 'active',
    })
    const env = testEnv({ DB: db as unknown as D1Database })
    const linked = await linkExternalIdentity(env, 'user-a', {
      issuer: 'https://tenant.auth0.com/',
      subject: 'google-oauth2|a',
      email: 'a@example.com',
      emailVerified: true,
      connection: 'google-oauth2',
    })
    expect(linked.ok).toBe(true)

    const conflict = await linkExternalIdentity(env, 'user-b', {
      issuer: 'https://tenant.auth0.com/',
      subject: 'google-oauth2|a',
      email: 'b@example.com',
      emailVerified: true,
      connection: 'google-oauth2',
    })
    expect(conflict.ok).toBe(false)
    if (!conflict.ok) expect(conflict.status).toBe(409)
  })

  it('rejects unverified provider email on link and login', async () => {
    const db = createMemoryDb()
    db._seedUser({
      id: 'user-a', email: 'a@example.com', password_hash: 'hash', role: 'client',
      full_name: 'User A', first_name: 'User', last_name: 'A', status: 'active',
    })
    const env = testEnv({ DB: db as unknown as D1Database })
    const link = await linkExternalIdentity(env, 'user-a', {
      issuer: 'https://tenant.auth0.com/',
      subject: 'google-oauth2|a',
      email: 'a@example.com',
      emailVerified: false,
      connection: 'google-oauth2',
    })
    expect(link.ok).toBe(false)

    const login = await resolveAuth0LoginUser(env, {
      issuer: 'https://tenant.auth0.com/',
      subject: 'google-oauth2|new',
      email: 'fresh@example.com',
      emailVerified: false,
      connection: 'google-oauth2',
    })
    expect(login.kind).toBe('unverified_email')
  })

  it('prevents unlinking the final authentication method', async () => {
    const db = createMemoryDb()
    db._seedUser({
      id: 'user-a', email: 'a@example.com', password_hash: null, role: 'client',
      full_name: 'User A', first_name: 'User', last_name: 'A', status: 'active',
    })
    db._identities.set('id-1', {
      id: 'id-1', user_id: 'user-a', provider: 'google-oauth2', connection_name: 'google-oauth2',
      issuer: 'https://tenant.auth0.com/', subject: 'google-oauth2|1',
      provider_email: 'a@example.com', email_verified: 1, created_at: 'now', last_login_at: null,
    })
    const env = testEnv({ DB: db as unknown as D1Database })
    const methods = await countAuthMethods(env, 'user-a')
    expect(methods.total).toBe(1)
    const blocked = await unlinkExternalIdentity(env, 'user-a', 'id-1')
    expect(blocked.ok).toBe(false)

    db._users.get('user-a')!.password_hash = 'hash'
    const allowed = await unlinkExternalIdentity(env, 'user-a', 'id-1')
    expect(allowed.ok).toBe(true)
  })
})

describe('Auth0 authorization boundaries remain internal', () => {
  it('ignores Auth0 roles/claims for resource access (client A cannot see client B)', async () => {
    const env = testEnv()
    const clientA: SessionUser = { id: 'a', email: 'a@example.com', role: 'client', full_name: 'A' }
    const trusted = normalizeTrustedPermissions({ documents: 'edit', billing: 'edit', messages: 'edit' })
    expect(trusted.documents).toBe('view')
    expect(trusted.billing).toBe('view')
    expect(await canAccessClient(env, clientA, 'b')).toBe(false)
    // Fabricated Auth0 admin claim must not exist on SessionUser / access helpers.
    const forged = { ...clientA, auth0_roles: ['admin'] } as SessionUser & { auth0_roles: string[] }
    expect(await canAccessClient(env, forged, 'b')).toBe(false)
  })

  it('exposes provider button labels without overclaiming security marketing', () => {
    expect(AUTH0_PROVIDERS['google-oauth2'].buttonLabel).toBe('Continue with Google')
    expect(AUTH0_PROVIDERS.windowslive.buttonLabel).toBe('Continue with Microsoft')
    expect(AUTH0_PROVIDERS['google-oauth2'].buttonLabel.toLowerCase()).not.toContain('sso')
    expect(AUTH0_PROVIDERS['google-oauth2'].buttonLabel.toLowerCase()).not.toContain('encrypted')
  })
})

describe('Auth0 client factory test seam', () => {
  afterEach(() => {
    setAuth0ClientFactory(null)
  })

  it('allows mocking Auth0 AuthClient at the SDK boundary', async () => {
    const buildAuthorizationUrl = vi.fn(async () => ({
      authorizationUrl: new URL('https://tenant.auth0.com/authorize?state=abc'),
      codeVerifier: 'pkce-verifier',
    }))
    const getTokenByCode = vi.fn(async () => ({
      claims: {
        iss: 'https://tenant.auth0.com/',
        sub: 'google-oauth2|99',
        email: 'mock@example.com',
        email_verified: true,
        nonce: 'n',
      },
      accessToken: 'should-not-be-stored',
      idToken: 'should-not-be-stored',
    }))
    setAuth0ClientFactory(() => ({ buildAuthorizationUrl, getTokenByCode }) as never)

    const { createAuth0Client } = await import('../functions/_lib/auth0Client')
    const bundled = createAuth0Client(testEnv({
      AUTH0_DOMAIN: 'tenant.auth0.com',
      AUTH0_CLIENT_ID: 'client',
      AUTH0_CLIENT_SECRET: 'secret',
    }))
    expect(bundled).not.toBeNull()
    const started = await bundled!.client.buildAuthorizationUrl({
      authorizationParams: { connection: 'google-oauth2', state: 'abc', nonce: 'n' },
    })
    expect(started.authorizationUrl.toString()).toContain('authorize')
    const tokens = await bundled!.client.getTokenByCode(new URL('https://www.pinnaclemanagementventures.com/api/auth/auth0/callback?code=x&state=abc'), {
      codeVerifier: 'pkce-verifier',
    })
    expect(tokens.claims?.sub).toBe('google-oauth2|99')
    expect(buildAuthorizationUrl).toHaveBeenCalled()
    expect(getTokenByCode).toHaveBeenCalled()
  })
})

describe('Login page Auth0 UX contracts', () => {
  it('keeps provider controls behind status endpoint data (no silent dead buttons)', async () => {
    const disabled = publicAuth0Status(testEnv())
    expect(disabled.enabled).toBe(false)
    expect(disabled.providers).toHaveLength(0)

    const enabled = publicAuth0Status(testEnv({
      AUTH0_DOMAIN: 'tenant.auth0.com',
      AUTH0_CLIENT_ID: 'id',
      AUTH0_CLIENT_SECRET: 'secret',
      AUTH0_CONNECTIONS: 'google-oauth2',
    }))
    expect(enabled.enabled).toBe(true)
    expect(enabled.providers).toHaveLength(1)
    expect(enabled.providers[0].button_label).toBe('Continue with Google')
  })
})
