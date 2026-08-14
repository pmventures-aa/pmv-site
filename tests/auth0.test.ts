import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { hashPassword, verifyPassword } from '../functions/_lib/crypto'
import { visibleClientIds } from '../functions/_lib/access'
import { normalizeTrustedPermissions } from '../functions/_lib/trustedAccess'
import {
  AUTH0_GOOGLE_CONNECTION,
  AUTH0_MICROSOFT_CONNECTION,
  publicAuth0Providers,
  readAuth0Config,
  resolveAuth0CallbackUrl,
  resolveAuth0LogoutUrl,
} from '../functions/_lib/auth0/config'
import { callbackErrorPath, defaultReturnTo, loginPathFor, sanitizeReturnTo } from '../functions/_lib/auth0/returnTo'
import {
  canUnlinkIdentity,
  portalRoleAllowed,
  resolveAuth0Identity,
  splitName,
  stripAuthorizationClaims,
  type Auth0Db,
  type Auth0IdentityClaims,
  type Auth0UserRow,
  type ExternalIdentityRow,
  type PendingInviteRow,
} from '../functions/_lib/auth0/identity'

function claims(overrides: Partial<Auth0IdentityClaims> = {}): Auth0IdentityClaims {
  return {
    issuer: 'https://pmv-test.us.auth0.com/',
    subject: 'google-oauth2|abc',
    email: 'alex@example.com',
    emailVerified: true,
    name: 'Alex Rivera',
    givenName: 'Alex',
    familyName: 'Rivera',
    nonce: 'nonce-1',
    connection: AUTH0_GOOGLE_CONNECTION,
    ...overrides,
  }
}

class MemoryAuth0Db implements Auth0Db {
  users = new Map<string, Auth0UserRow>()
  usersByEmail = new Map<string, string>()
  identities: ExternalIdentityRow[] = []
  invites: PendingInviteRow[] = []
  acceptedInvites: string[] = []
  trustedActivations: Array<{ inviteId: string; userId: string }> = []

  async findIdentity(issuer: string, subject: string) {
    return this.identities.find((row) => row.issuer === issuer && row.subject === subject) || null
  }
  async insertIdentity(row: Omit<ExternalIdentityRow, 'created_at' | 'last_login_at'> & { last_login_at?: string | null }) {
    if (this.identities.some((item) => item.issuer === row.issuer && item.subject === row.subject)) return 'conflict'
    this.identities.push({ ...row, created_at: 'now', last_login_at: row.last_login_at ?? 'now' })
    return 'ok'
  }
  async updateIdentityLogin(id: string) {
    const row = this.identities.find((item) => item.id === id)
    if (row) row.last_login_at = 'login'
  }
  async listIdentities(userId: string) {
    return this.identities.filter((row) => row.user_id === userId)
  }
  async deleteIdentity(id: string, userId: string) {
    const before = this.identities.length
    this.identities = this.identities.filter((row) => !(row.id === id && row.user_id === userId))
    return this.identities.length < before
  }
  async findUserById(id: string) {
    return this.users.get(id) || null
  }
  async findUserByEmail(email: string) {
    const id = this.usersByEmail.get(email)
    return id ? this.users.get(id) || null : null
  }
  async insertUser(row: Auth0UserRow) {
    this.users.set(row.id, { ...row })
    this.usersByEmail.set(row.email, row.id)
  }
  async updateUserLogin(id: string) {
    const user = this.users.get(id)
    if (user) this.users.set(id, user)
  }
  async findPendingInvite(email: string) {
    return this.invites.find((row) => row.email === email && row.status === 'pending') || null
  }
  async acceptInvite(inviteId: string, _userId: string) {
    this.acceptedInvites.push(inviteId)
    const invite = this.invites.find((row) => row.id === inviteId)
    if (invite) invite.status = 'accepted'
  }
  async activateTrustedContact(inviteId: string, _clientUserId: string, userId: string) {
    this.trustedActivations.push({ inviteId, userId })
  }

  addUser(user: Auth0UserRow) {
    this.users.set(user.id, user)
    this.usersByEmail.set(user.email, user.id)
  }
}

function client(overrides: Partial<Auth0UserRow> = {}): Auth0UserRow {
  return {
    id: 'user-a',
    email: 'alex@example.com',
    role: 'client',
    status: 'active',
    full_name: 'Alex Rivera',
    first_name: 'Alex',
    last_name: 'Rivera',
    password_hash: 'hashed',
    ...overrides,
  }
}

describe('password authentication remains available', () => {
  it('still hashes and verifies passwords independently of Auth0', async () => {
    const stored = await hashPassword('correct-horse-battery', 'pepper')
    expect(await verifyPassword('correct-horse-battery', stored, 'pepper')).toBe(true)
    expect(await verifyPassword('wrong-password', stored, 'pepper')).toBe(false)
    const auth = readFileSync(new URL('../functions/_lib/routes/auth.ts', import.meta.url), 'utf8')
    expect(auth).toContain("authRoutes.post('/login'")
    expect(auth).toContain("authRoutes.post('/forgot-password'")
    expect(auth).toContain("authRoutes.post('/logout'")
  })
})

describe('Auth0 configuration', () => {
  it('stays disabled when configuration is missing or incomplete', () => {
    const empty = readAuth0Config({} as any)
    expect(empty.enabled).toBe(false)
    expect(publicAuth0Providers(empty).connections).toEqual([])

    const partial = readAuth0Config({ AUTH0_DOMAIN: 'example.us.auth0.com', AUTH0_CLIENT_ID: 'abc' } as any)
    expect(partial.enabled).toBe(false)
    expect(partial.reason).toBe('partial')
  })

  it('can be intentionally disabled even when credentials exist', () => {
    const config = readAuth0Config({
      AUTH0_DOMAIN: 'example.us.auth0.com',
      AUTH0_CLIENT_ID: 'abc',
      AUTH0_CLIENT_SECRET: 'secret',
      AUTH0_CALLBACK_URL: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback',
      AUTH0_DISABLED: 'true',
    } as any)
    expect(config.enabled).toBe(false)
    expect(publicAuth0Providers(config).enabled).toBe(false)
  })

  it('enables only configured connections when complete', () => {
    const config = readAuth0Config({
      AUTH0_DOMAIN: 'example.us.auth0.com',
      AUTH0_CLIENT_ID: 'abc',
      AUTH0_CLIENT_SECRET: 'secret',
      AUTH0_CALLBACK_URL: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback',
      AUTH0_CONNECTIONS: AUTH0_MICROSOFT_CONNECTION,
    } as any)
    expect(config.enabled).toBe(true)
    expect(publicAuth0Providers(config).connections).toEqual([{ id: AUTH0_MICROSOFT_CONNECTION, label: 'Microsoft' }])
  })

  it('keeps callback and logout URLs on an allowlisted request origin', () => {
    const config = readAuth0Config({
      AUTH0_DOMAIN: 'example.us.auth0.com',
      AUTH0_CLIENT_ID: 'abc',
      AUTH0_CLIENT_SECRET: 'secret',
      AUTH0_CALLBACK_URL: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback',
      AUTH0_LOGOUT_URL: 'https://www.pinnaclemanagementventures.com/portal/login',
    } as any)
    expect(resolveAuth0CallbackUrl(config, 'https://secure.pinnaclemanagementventures.com/api/auth/auth0/login'))
      .toBe('https://secure.pinnaclemanagementventures.com/api/auth/auth0/callback')
    expect(resolveAuth0LogoutUrl(config, 'https://secure.pinnaclemanagementventures.com/api/auth/logout'))
      .toBe('https://secure.pinnaclemanagementventures.com/login')
    expect(resolveAuth0CallbackUrl(config, 'https://evil.example/api/auth/auth0/login'))
      .toBe(config.callbackUrl)
  })
})

describe('return URL allowlist', () => {
  it('rejects open redirects and staff destinations from the client portal', () => {
    expect(sanitizeReturnTo('https://evil.example', 'client')).toBeNull()
    expect(sanitizeReturnTo('//evil.example', 'client')).toBeNull()
    expect(sanitizeReturnTo('/\\evil.example', 'client')).toBeNull()
    expect(sanitizeReturnTo('/admin', 'client')).toBeNull()
    expect(sanitizeReturnTo('/hq', 'client')).toBeNull()
    expect(sanitizeReturnTo('/portal/documents', 'client')).toBe('/portal/documents')
    expect(sanitizeReturnTo('/portal/services/funding/apply?offering=1', 'client')).toBe('/portal/services/funding/apply?offering=1')
    expect(defaultReturnTo('client', false)).toBe('/portal')
    expect(loginPathFor('client', 'www.pinnaclemanagementventures.com')).toBe('/portal/login')
    expect(callbackErrorPath('/portal/login')).toContain('auth_error=signin')
  })
})

describe('Auth0 identity resolution', () => {
  it('creates a new client for an unknown verified Auth0 identity', async () => {
    const db = new MemoryAuth0Db()
    const result = await resolveAuth0Identity(db, claims(), { purpose: 'login', surface: 'client' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.created).toBe(true)
    expect(result.user.role).toBe('client')
    expect(result.user.password_hash).toBeNull()
    expect(db.identities).toHaveLength(1)
  })

  it('does not auto-link an established account just because emails match', async () => {
    const db = new MemoryAuth0Db()
    db.addUser(client())
    const result = await resolveAuth0Identity(db, claims(), { purpose: 'login', surface: 'client' })
    expect(result).toEqual({ ok: false, code: 'unknown_identity' })
    expect(db.identities).toHaveLength(0)
  })

  it('refuses an identity already linked to another user', async () => {
    const db = new MemoryAuth0Db()
    db.addUser(client({ id: 'user-a' }))
    db.addUser(client({ id: 'user-b', email: 'other@example.com' }))
    await db.insertIdentity({
      id: 'id-1', user_id: 'user-a', provider: AUTH0_GOOGLE_CONNECTION,
      issuer: 'https://pmv-test.us.auth0.com/', subject: 'google-oauth2|abc',
      email: 'alex@example.com', email_verified: 1,
    })
    const result = await resolveAuth0Identity(db, claims(), { purpose: 'link', surface: 'client', linkingUserId: 'user-b' })
    expect(result).toEqual({ ok: false, code: 'already_linked' })
  })

  it('links when an authenticated user explicitly connects a new identity', async () => {
    const db = new MemoryAuth0Db()
    db.addUser(client())
    const result = await resolveAuth0Identity(db, claims({ subject: 'google-oauth2|new' }), {
      purpose: 'link',
      surface: 'client',
      linkingUserId: 'user-a',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.linked).toBe(true)
    expect(result.user.id).toBe('user-a')
  })

  it('blocks disabled internal users', async () => {
    const db = new MemoryAuth0Db()
    db.addUser(client({ status: 'suspended' }))
    await db.insertIdentity({
      id: 'id-1', user_id: 'user-a', provider: AUTH0_GOOGLE_CONNECTION,
      issuer: 'https://pmv-test.us.auth0.com/', subject: 'google-oauth2|abc',
      email: 'alex@example.com', email_verified: 1,
    })
    const result = await resolveAuth0Identity(db, claims(), { purpose: 'login', surface: 'client' })
    expect(result).toEqual({ ok: false, code: 'disabled_user' })
  })

  it('completes a reserved passwordless client without attaching a different established account', async () => {
    const db = new MemoryAuth0Db()
    db.addUser(client({ password_hash: null }))
    const result = await resolveAuth0Identity(db, claims(), { purpose: 'login', surface: 'client' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.user.id).toBe('user-a')
    expect(db.identities[0].user_id).toBe('user-a')
  })

  it('completes a verified client invitation', async () => {
    const db = new MemoryAuth0Db()
    db.invites.push({ id: 'inv-1', invite_type: 'client', email: 'alex@example.com', full_name: 'Alex Rivera', client_user_id: null, status: 'pending' })
    const result = await resolveAuth0Identity(db, claims(), { purpose: 'login', surface: 'client' })
    expect(result.ok).toBe(true)
    expect(db.acceptedInvites).toContain('inv-1')
  })

  it('ignores Auth0 roles and keeps Pinnacle authorization', async () => {
    const db = new MemoryAuth0Db()
    const raw = stripAuthorizationClaims({
      iss: 'https://pmv-test.us.auth0.com/',
      sub: 'google-oauth2|abc',
      email: 'alex@example.com',
      email_verified: true,
      role: 'admin',
      roles: ['admin'],
      permissions: ['*'],
      'https://pinnacle/roles': ['admin'],
    })
    const result = await resolveAuth0Identity(db, { ...raw, connection: AUTH0_GOOGLE_CONNECTION }, { purpose: 'login', surface: 'client' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.user.role).toBe('client')
    expect(portalRoleAllowed('client', 'client')).toBe(true)
    expect(portalRoleAllowed('admin', 'client')).toBe(false)
  })

  it('keeps Client A from seeing Client B after Auth0 login', async () => {
    const db = new MemoryAuth0Db()
    db.addUser(client({ id: 'client-a', email: 'a@example.com' }))
    db.addUser(client({ id: 'client-b', email: 'b@example.com' }))
    await db.insertIdentity({
      id: 'id-a', user_id: 'client-a', provider: AUTH0_GOOGLE_CONNECTION,
      issuer: 'https://pmv-test.us.auth0.com/', subject: 'google-oauth2|a',
      email: 'a@example.com', email_verified: 1,
    })
    const result = await resolveAuth0Identity(db, claims({ subject: 'google-oauth2|a', email: 'a@example.com' }), { purpose: 'login', surface: 'client' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ids = await visibleClientIds({} as any, { id: result.user.id, email: result.user.email, role: result.user.role, full_name: result.user.full_name })
    expect(ids).toEqual(['client-a'])
    expect(ids).not.toContain('client-b')
  })

  it('does not let Auth0 claims expand Trusted Contact grants', async () => {
    const permissions = normalizeTrustedPermissions({ documents: 'edit', billing: 'edit', tasks: 'edit' })
    expect(permissions.documents).toBe('view')
    expect(permissions.billing).toBe('view')
    expect(permissions.tasks).toBe('edit')
    expect(splitName(claims({ givenName: null, familyName: null, name: 'Taylor Brooks' }))).toEqual({
      first: 'Taylor',
      last: 'Brooks',
      full: 'Taylor Brooks',
    })
  })
})

describe('safe unlinking', () => {
  it('prevents removing the final usable authentication method', () => {
    const user = client({ password_hash: null })
    const identities: ExternalIdentityRow[] = [{
      id: 'id-1', user_id: 'user-a', provider: AUTH0_GOOGLE_CONNECTION,
      issuer: 'iss', subject: 'sub', email: 'alex@example.com', email_verified: 1,
      created_at: 'now', last_login_at: 'now',
    }]
    expect(canUnlinkIdentity(user, identities, 'id-1')).toBe(false)
    expect(canUnlinkIdentity({ ...user, password_hash: 'x' }, identities, 'id-1')).toBe(true)
    expect(canUnlinkIdentity(user, [...identities, { ...identities[0], id: 'id-2', subject: 'other' }], 'id-1')).toBe(true)
  })
})
