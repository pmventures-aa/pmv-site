import type { Env, SessionUser } from '../types'
import { uuid } from '../crypto'
import { toDisplayCase } from '../../../shared/displayCase'
import type { Auth0IdentityClaims } from './claims'
import type { Auth0Provider } from './config'

export interface ExternalIdentityRow {
  id: string
  user_id: string
  provider: string
  issuer: string
  subject: string
  email: string | null
  email_verified: number
  created_at: string
  last_login_at: string | null
}

export interface LinkedUser {
  id: string
  email: string
  role: SessionUser['role']
  full_name: string | null
  first_name: string | null
  last_name: string | null
  status: string
  password_hash: string | null
}

export function toSessionUser(user: LinkedUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    first_name: user.first_name,
    last_name: user.last_name,
  }
}

export async function findIdentity(env: Env, issuer: string, subject: string): Promise<ExternalIdentityRow | null> {
  return env.DB.prepare(
    'SELECT * FROM external_identities WHERE issuer = ? AND subject = ?',
  ).bind(issuer, subject).first<ExternalIdentityRow>()
}

export async function listIdentities(env: Env, userId: string): Promise<ExternalIdentityRow[]> {
  const rows = await env.DB.prepare(
    'SELECT * FROM external_identities WHERE user_id = ? ORDER BY created_at ASC',
  ).bind(userId).all<ExternalIdentityRow>()
  return rows.results ?? []
}

export async function getUserById(env: Env, userId: string): Promise<LinkedUser | null> {
  return env.DB.prepare(
    'SELECT id, email, role, full_name, first_name, last_name, status, password_hash FROM users WHERE id = ?',
  ).bind(userId).first<LinkedUser>()
}

export async function getUserByEmail(env: Env, email: string): Promise<LinkedUser | null> {
  return env.DB.prepare(
    'SELECT id, email, role, full_name, first_name, last_name, status, password_hash FROM users WHERE email = ?',
  ).bind(email.trim().toLowerCase()).first<LinkedUser>()
}

export function canUnlinkIdentity(user: Pick<LinkedUser, 'password_hash'>, identities: ExternalIdentityRow[], identityId: string): { ok: true } | { ok: false; error: string } {
  const target = identities.find((row) => row.id === identityId)
  if (!target) return { ok: false, error: 'that sign-in method is not connected to this account' }
  const remaining = identities.filter((row) => row.id !== identityId)
  const hasPassword = Boolean(user.password_hash)
  if (!hasPassword && remaining.length === 0) {
    return { ok: false, error: 'add a password or another sign-in method before removing this one' }
  }
  return { ok: true }
}

export async function insertIdentity(
  env: Env,
  userId: string,
  claims: Auth0IdentityClaims,
  provider: Auth0Provider | { id: string; connection: string },
): Promise<ExternalIdentityRow> {
  const id = uuid()
  const providerName = provider.connection
  await env.DB.prepare(
    `INSERT INTO external_identities
      (id, user_id, provider, issuer, subject, email, email_verified, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(
    id,
    userId,
    providerName,
    claims.iss,
    claims.sub,
    claims.email,
    claims.emailVerified ? 1 : 0,
  ).run()
  const row = await env.DB.prepare('SELECT * FROM external_identities WHERE id = ?').bind(id).first<ExternalIdentityRow>()
  if (!row) throw new Error('identity insert failed')
  return row
}

export async function touchIdentityLogin(env: Env, identityId: string, userId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("UPDATE external_identities SET last_login_at = datetime('now') WHERE id = ?").bind(identityId),
    env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(userId),
  ])
}

export async function deleteIdentity(env: Env, identityId: string, userId: string): Promise<boolean> {
  const result = await env.DB.prepare(
    'DELETE FROM external_identities WHERE id = ? AND user_id = ?',
  ).bind(identityId, userId).run()
  return (result.meta?.changes || 0) > 0
}

export function namesFromClaims(claims: Auth0IdentityClaims, fallbackEmail: string): { firstName: string; lastName: string; fullName: string } {
  const emailLocal = fallbackEmail.split('@')[0] || 'Client'
  const firstName = toDisplayCase(claims.givenName) || toDisplayCase(claims.fullName.split(/\s+/)[0] || '') || toDisplayCase(emailLocal)
  const lastName = toDisplayCase(claims.familyName) || toDisplayCase(claims.fullName.split(/\s+/).slice(1).join(' ')) || ''
  const fullName = `${firstName} ${lastName}`.trim()
  return { firstName, lastName, fullName }
}

export async function createClientFromAuth0(env: Env, claims: Auth0IdentityClaims): Promise<LinkedUser> {
  if (!claims.email) throw new Error('email required')
  const id = uuid()
  const personPartyId = uuid()
  const { firstName, lastName, fullName } = namesFromClaims(claims, claims.email)
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, phone, two_factor_enabled, status, tos_accepted_at)
       VALUES (?, ?, NULL, 'client', ?, ?, ?, NULL, 0, 'active', datetime('now'))`,
    ).bind(id, claims.email, fullName, firstName, lastName || null),
    env.DB.prepare(
      `INSERT INTO client_profiles (id, user_id, business_name, onboarding_completed) VALUES (?, ?, NULL, 0)`,
    ).bind(uuid(), id),
    env.DB.prepare("INSERT INTO relationship_parties(id,party_type,display_name,email,phone) VALUES (?,'person',?,?,NULL)").bind(personPartyId, fullName, claims.email),
    env.DB.prepare('INSERT INTO relationship_people(party_id,first_name,last_name) VALUES (?,?,?)').bind(personPartyId, firstName, lastName || null),
    env.DB.prepare("INSERT INTO account_parties(user_id,party_id,access_role,is_primary) VALUES (?,?,'self',1)").bind(id, personPartyId),
    env.DB.prepare('UPDATE client_profiles SET primary_party_id=? WHERE user_id=?').bind(personPartyId, id),
  ])
  const user = await getUserById(env, id)
  if (!user) throw new Error('client create failed')
  return user
}

export function isPortalRole(role: string): boolean {
  return role === 'client' || role === 'trusted_contact'
}

export function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /unique|constraint|SQLITE_CONSTRAINT/i.test(message)
}
