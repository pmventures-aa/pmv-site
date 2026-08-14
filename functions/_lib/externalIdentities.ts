import type { Env, SessionUser } from './types'
import { uuid } from './crypto'
import type { Auth0ConnectionId } from './auth0Config'

export interface ExternalIdentityRow {
  id: string
  user_id: string
  provider: string
  connection_name: string | null
  issuer: string
  subject: string
  provider_email: string | null
  email_verified: number
  created_at: string
  last_login_at: string | null
}

export interface Auth0VerifiedIdentity {
  issuer: string
  subject: string
  email: string | null
  emailVerified: boolean
  connection: Auth0ConnectionId
  givenName?: string | null
  familyName?: string | null
  fullName?: string | null
}

export async function findIdentityByIssuerSubject(
  env: Env,
  issuer: string,
  subject: string,
): Promise<ExternalIdentityRow | null> {
  return env.DB.prepare(
    `SELECT id,user_id,provider,connection_name,issuer,subject,provider_email,email_verified,created_at,last_login_at
     FROM external_identities WHERE issuer = ? AND subject = ?`,
  ).bind(issuer, subject).first<ExternalIdentityRow>()
}

export async function listIdentitiesForUser(env: Env, userId: string): Promise<ExternalIdentityRow[]> {
  const rows = await env.DB.prepare(
    `SELECT id,user_id,provider,connection_name,issuer,subject,provider_email,email_verified,created_at,last_login_at
     FROM external_identities WHERE user_id = ? ORDER BY created_at ASC`,
  ).bind(userId).all<ExternalIdentityRow>()
  return rows.results ?? []
}

export async function userHasPassword(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first<{ password_hash: string | null }>()
  return Boolean(row?.password_hash)
}

export async function countAuthMethods(env: Env, userId: string): Promise<{ password: boolean; identities: number; total: number }> {
  const [password, identities] = await Promise.all([
    userHasPassword(env, userId),
    listIdentitiesForUser(env, userId),
  ])
  return { password, identities: identities.length, total: (password ? 1 : 0) + identities.length }
}

export async function touchIdentityLogin(env: Env, identityId: string): Promise<void> {
  await env.DB.prepare("UPDATE external_identities SET last_login_at = datetime('now') WHERE id = ?").bind(identityId).run()
}

export async function linkExternalIdentity(
  env: Env,
  userId: string,
  identity: Auth0VerifiedIdentity,
): Promise<{ ok: true; identityId: string } | { ok: false; error: string; status: 400 | 409 }> {
  if (!identity.emailVerified) {
    return { ok: false, error: 'verify your email with the identity provider before connecting it', status: 400 }
  }

  const user = await env.DB.prepare(
    "SELECT id,email,role,status FROM users WHERE id = ?",
  ).bind(userId).first<{ id: string; email: string; role: string; status: string }>()
  if (!user || user.status !== 'active') {
    return { ok: false, error: 'account not available', status: 400 }
  }
  if (user.role !== 'client' && user.role !== 'trusted_contact') {
    return { ok: false, error: 'external sign-in is available for client portal accounts', status: 400 }
  }

  const existing = await findIdentityByIssuerSubject(env, identity.issuer, identity.subject)
  if (existing) {
    if (existing.user_id === userId) return { ok: true, identityId: existing.id }
    return { ok: false, error: 'that sign-in method is already connected to another account', status: 409 }
  }

  // Never auto-claim an identity onto a different email account.
  if (identity.email) {
    const emailOwner = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(identity.email.toLowerCase()).first<{ id: string }>()
    if (emailOwner && emailOwner.id !== userId) {
      return { ok: false, error: 'that sign-in method belongs to a different email address', status: 409 }
    }
  }

  const id = uuid()
  try {
    await env.DB.prepare(
      `INSERT INTO external_identities
       (id, user_id, provider, connection_name, issuer, subject, provider_email, email_verified, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(
      id,
      userId,
      identity.connection,
      identity.connection,
      identity.issuer,
      identity.subject,
      identity.email,
      identity.emailVerified ? 1 : 0,
    ).run()
  } catch (err) {
    // Unique (issuer, subject) race
    const raced = await findIdentityByIssuerSubject(env, identity.issuer, identity.subject)
    if (raced?.user_id === userId) return { ok: true, identityId: raced.id }
    return { ok: false, error: 'that sign-in method is already connected to another account', status: 409 }
  }
  return { ok: true, identityId: id }
}

export async function unlinkExternalIdentity(
  env: Env,
  userId: string,
  identityId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: 400 | 404 }> {
  const row = await env.DB.prepare(
    'SELECT id,user_id FROM external_identities WHERE id = ?',
  ).bind(identityId).first<{ id: string; user_id: string }>()
  if (!row || row.user_id !== userId) return { ok: false, error: 'sign-in method not found', status: 404 }

  const methods = await countAuthMethods(env, userId)
  if (methods.total <= 1) {
    return { ok: false, error: 'keep at least one sign-in method on your account', status: 400 }
  }

  await env.DB.prepare('DELETE FROM external_identities WHERE id = ? AND user_id = ?').bind(identityId, userId).run()
  return { ok: true }
}

export async function loadPortalUser(env: Env, userId: string): Promise<SessionUser | null> {
  const user = await env.DB.prepare(
    `SELECT id,email,role,full_name,first_name,last_name,status FROM users WHERE id = ?`,
  ).bind(userId).first<any>()
  if (!user || user.status !== 'active') return null
  if (user.role !== 'client' && user.role !== 'trusted_contact') return null
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name ?? null,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
  }
}

/**
 * Resolve an Auth0 login into an internal user without auto-linking by email.
 * - Existing issuer+sub → that user
 * - Unknown identity whose email already belongs to a Pinnacle user → refuse (must link deliberately)
 * - Completely new identity → create a new client account bound to this identity only
 */
export async function resolveAuth0LoginUser(
  env: Env,
  identity: Auth0VerifiedIdentity,
): Promise<
  | { kind: 'ok'; user: SessionUser; identityId: string; created: boolean }
  | { kind: 'disabled' }
  | { kind: 'needs_link' }
  | { kind: 'unverified_email' }
  | { kind: 'error'; message: string }
> {
  if (!identity.emailVerified || !identity.email) return { kind: 'unverified_email' }

  const existingIdentity = await findIdentityByIssuerSubject(env, identity.issuer, identity.subject)
  if (existingIdentity) {
    const user = await loadPortalUser(env, existingIdentity.user_id)
    if (!user) return { kind: 'disabled' }
    await touchIdentityLogin(env, existingIdentity.id)
    return { kind: 'ok', user, identityId: existingIdentity.id, created: false }
  }

  const email = identity.email.toLowerCase()
  const emailOwner = await env.DB.prepare(
    'SELECT id, role, status FROM users WHERE email = ?',
  ).bind(email).first<{ id: string; role: string; status: string }>()
  if (emailOwner) {
    // Do not auto-link. Caller shows a neutral recovery message.
    return { kind: 'needs_link' }
  }

  // Brand-new Auth0 user: create a client account (same posture as self-signup),
  // bound only to this issuer+sub — never to another client's relationships.
  const id = uuid()
  const firstName = (identity.givenName || '').trim().slice(0, 120) || (identity.fullName || '').trim().split(/\s+/)[0] || 'Client'
  const lastName = (identity.familyName || '').trim().slice(0, 120) || (identity.fullName || '').trim().split(/\s+/).slice(1).join(' ') || 'Account'
  const fullName = `${firstName} ${lastName}`.trim()
  const personPartyId = uuid()
  const identityId = uuid()

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, two_factor_enabled, status, tos_accepted_at, last_login_at)
         VALUES (?, ?, NULL, 'client', ?, ?, ?, 0, 'active', datetime('now'), datetime('now'))`,
      ).bind(id, email, fullName, firstName, lastName),
      env.DB.prepare(
        `INSERT INTO client_profiles (id, user_id, business_name, onboarding_completed) VALUES (?, ?, NULL, 0)`,
      ).bind(uuid(), id),
      env.DB.prepare("INSERT INTO relationship_parties(id,party_type,display_name,email,phone) VALUES (?,'person',?,?,NULL)").bind(personPartyId, fullName, email),
      env.DB.prepare('INSERT INTO relationship_people(party_id,first_name,last_name) VALUES (?,?,?)').bind(personPartyId, firstName, lastName),
      env.DB.prepare("INSERT INTO account_parties(user_id,party_id,access_role,is_primary) VALUES (?,?,'self',1)").bind(id, personPartyId),
      env.DB.prepare('UPDATE client_profiles SET primary_party_id=? WHERE user_id=?').bind(personPartyId, id),
      env.DB.prepare(
        `INSERT INTO external_identities
         (id, user_id, provider, connection_name, issuer, subject, provider_email, email_verified, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
      ).bind(identityId, id, identity.connection, identity.connection, identity.issuer, identity.subject, email),
    ])
  } catch (err) {
    // Race: another request created the email or issuer+sub first.
    const racedIdentity = await findIdentityByIssuerSubject(env, identity.issuer, identity.subject)
    if (racedIdentity) {
      const user = await loadPortalUser(env, racedIdentity.user_id)
      if (!user) return { kind: 'disabled' }
      return { kind: 'ok', user, identityId: racedIdentity.id, created: false }
    }
    const racedEmail = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
    if (racedEmail) return { kind: 'needs_link' }
    console.error('[auth0] create user failed', err instanceof Error ? err.message : 'error')
    return { kind: 'error', message: 'could not complete sign-in' }
  }

  const user: SessionUser = {
    id,
    email,
    role: 'client',
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
  }
  return { kind: 'ok', user, identityId, created: true }
}

export function claimsToAuth0Identity(
  claims: Record<string, unknown>,
  connection: Auth0ConnectionId,
  expectedIssuer: string,
): Auth0VerifiedIdentity | { error: string } {
  const iss = typeof claims.iss === 'string' ? claims.iss : ''
  const sub = typeof claims.sub === 'string' ? claims.sub : ''
  if (!iss || !sub) return { error: 'missing identity claims' }
  // Exact issuer match (with or without trailing slash normalization)
  const norm = (v: string) => v.replace(/\/+$/, '')
  if (norm(iss) !== norm(expectedIssuer)) return { error: 'issuer mismatch' }

  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : null
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true'
  return {
    issuer: iss.endsWith('/') ? iss : `${iss}/`,
    subject: sub,
    email,
    emailVerified,
    connection,
    givenName: typeof claims.given_name === 'string' ? claims.given_name : null,
    familyName: typeof claims.family_name === 'string' ? claims.family_name : null,
    fullName: typeof claims.name === 'string' ? claims.name : null,
  }
}
