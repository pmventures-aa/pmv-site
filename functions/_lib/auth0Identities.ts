import type { Env, Role, SessionUser } from './types'
import { uuid } from './crypto'
import { activityInsert } from './activity'
import { toDisplayCase } from '../../shared/displayCase'
import type { Auth0ProviderId } from './auth0Config'
import type { VerifiedAuth0Identity } from './auth0Client'

export const PORTAL_ROLES: Role[] = ['client', 'trusted_contact']

export interface ExternalIdentityRow {
  id: string
  user_id: string
  provider: string
  issuer: string
  subject: string
  provider_email: string | null
  email_verified: number
  created_at: string
  last_login_at: string | null
}

export interface PortalUserRow {
  id: string
  email: string
  role: Role
  status: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  password_hash: string | null
}

export class IdentityConflictError extends Error {
  readonly code: 'taken' | 'mismatch' | 'disabled' | 'forbidden' | 'unverified' | 'last_method'
  constructor(code: IdentityConflictError['code']) {
    super(code)
    this.code = code
  }
}

export async function findIdentity(env: Env, issuer: string, subject: string): Promise<ExternalIdentityRow | null> {
  return env.DB.prepare(
    'SELECT id, user_id, provider, issuer, subject, provider_email, email_verified, created_at, last_login_at FROM external_identities WHERE issuer = ? AND subject = ?',
  ).bind(issuer, subject).first<ExternalIdentityRow>()
}

export async function identitiesForUser(env: Env, userId: string): Promise<ExternalIdentityRow[]> {
  const rows = await env.DB.prepare(
    'SELECT id, user_id, provider, issuer, subject, provider_email, email_verified, created_at, last_login_at FROM external_identities WHERE user_id = ? ORDER BY created_at',
  ).bind(userId).all<ExternalIdentityRow>()
  return rows.results || []
}

export async function getPortalUser(env: Env, userId: string): Promise<PortalUserRow | null> {
  return env.DB.prepare(
    'SELECT id, email, role, status, full_name, first_name, last_name, password_hash FROM users WHERE id = ?',
  ).bind(userId).first<PortalUserRow>()
}

export async function getPortalUserByEmail(env: Env, email: string): Promise<PortalUserRow | null> {
  return env.DB.prepare(
    'SELECT id, email, role, status, full_name, first_name, last_name, password_hash FROM users WHERE email = ?',
  ).bind(email.trim().toLowerCase()).first<PortalUserRow>()
}

export function isPortalAllowed(user: PortalUserRow): boolean {
  return user.status === 'active' && PORTAL_ROLES.includes(user.role)
}

export function sessionFromUser(user: PortalUserRow): SessionUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    first_name: user.first_name,
    last_name: user.last_name,
  }
}

export async function usableAuthMethodCount(env: Env, user: PortalUserRow): Promise<number> {
  const identities = await identitiesForUser(env, user.id)
  return (user.password_hash ? 1 : 0) + identities.length
}

export async function touchIdentityLogin(env: Env, identityId: string, userId: string) {
  await env.DB.batch([
    env.DB.prepare("UPDATE external_identities SET last_login_at = datetime('now'), email_verified = 1 WHERE id = ?").bind(identityId),
    env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(userId),
  ])
}

export async function insertIdentity(
  env: Env,
  userId: string,
  identity: VerifiedAuth0Identity,
): Promise<ExternalIdentityRow> {
  const existing = await findIdentity(env, identity.issuer, identity.subject)
  if (existing) {
    if (existing.user_id !== userId) throw new IdentityConflictError('taken')
    await env.DB.prepare(
      'UPDATE external_identities SET provider = ?, provider_email = ?, email_verified = ?, last_login_at = datetime(\'now\') WHERE id = ?',
    ).bind(identity.provider, identity.email, identity.emailVerified ? 1 : 0, existing.id).run()
    return { ...existing, provider: identity.provider, provider_email: identity.email, email_verified: identity.emailVerified ? 1 : 0 }
  }

  const id = uuid()
  try {
    await env.DB.prepare(
      `INSERT INTO external_identities (id, user_id, provider, issuer, subject, provider_email, email_verified, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(id, userId, identity.provider, identity.issuer, identity.subject, identity.email, identity.emailVerified ? 1 : 0).run()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/UNIQUE constraint failed/i.test(message)) {
      const raced = await findIdentity(env, identity.issuer, identity.subject)
      if (raced && raced.user_id === userId) return raced
      throw new IdentityConflictError('taken')
    }
    throw error
  }
  const created = await findIdentity(env, identity.issuer, identity.subject)
  if (!created) throw new Error('identity insert failed')
  return created
}

export async function unlinkIdentity(env: Env, user: PortalUserRow, identityId: string): Promise<ExternalIdentityRow> {
  const identities = await identitiesForUser(env, user.id)
  const target = identities.find((row) => row.id === identityId)
  if (!target) throw new IdentityConflictError('forbidden')
  const remaining = (user.password_hash ? 1 : 0) + identities.length - 1
  if (remaining < 1) throw new IdentityConflictError('last_method')
  await env.DB.prepare('DELETE FROM external_identities WHERE id = ? AND user_id = ?').bind(identityId, user.id).run()
  return target
}

export async function assertLinkable(env: Env, user: PortalUserRow, identity: VerifiedAuth0Identity) {
  if (!isPortalAllowed(user)) throw new IdentityConflictError('disabled')
  if (!identity.emailVerified) throw new IdentityConflictError('unverified')
  if (identity.email !== user.email.trim().toLowerCase()) throw new IdentityConflictError('mismatch')
  const existing = await findIdentity(env, identity.issuer, identity.subject)
  if (existing && existing.user_id !== user.id) throw new IdentityConflictError('taken')
}

export async function createClientFromAuth0(
  env: Env,
  identity: VerifiedAuth0Identity,
  input: { firstName: string; lastName: string; phone: string; businessName?: string | null },
): Promise<PortalUserRow> {
  const email = identity.email
  const taken = await getPortalUserByEmail(env, email)
  if (taken) throw new IdentityConflictError('taken')

  const id = uuid()
  const personPartyId = uuid()
  const firstName = toDisplayCase(input.firstName)
  const lastName = toDisplayCase(input.lastName)
  const fullName = `${firstName} ${lastName}`.trim()
  const phone = input.phone.trim().slice(0, 40)
  const businessName = input.businessName ? toDisplayCase(input.businessName).slice(0, 200) || null : null

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, phone, two_factor_enabled, status, tos_accepted_at)
       VALUES (?, ?, NULL, 'client', ?, ?, ?, ?, 0, 'active', datetime('now'))`,
    ).bind(id, email, fullName, firstName, lastName, phone),
    env.DB.prepare(
      'INSERT INTO client_profiles (id, user_id, business_name, onboarding_completed) VALUES (?, ?, ?, 0)',
    ).bind(uuid(), id, businessName),
    env.DB.prepare("INSERT INTO relationship_parties(id,party_type,display_name,email,phone) VALUES (?,'person',?,?,?)").bind(personPartyId, fullName, email, phone),
    env.DB.prepare('INSERT INTO relationship_people(party_id,first_name,last_name) VALUES (?,?,?)').bind(personPartyId, firstName, lastName),
    env.DB.prepare("INSERT INTO account_parties(user_id,party_id,access_role,is_primary) VALUES (?,?,'self',1)").bind(id, personPartyId),
    env.DB.prepare('UPDATE client_profiles SET primary_party_id=? WHERE user_id=?').bind(personPartyId, id),
    activityInsert(env, { clientUserId: id, kind: 'client_signed_up', detail: { email, method: 'auth0', provider: identity.provider } }),
  ])

  if (businessName) {
    const businessPartyId = uuid()
    await env.DB.batch([
      env.DB.prepare("INSERT INTO relationship_parties(id,party_type,display_name) VALUES (?,'business',?)").bind(businessPartyId, businessName),
      env.DB.prepare('INSERT INTO relationship_businesses(party_id,legal_name,primary_contact_party_id) VALUES (?,?,?)').bind(businessPartyId, businessName, personPartyId),
      env.DB.prepare("INSERT INTO party_relationships(id,from_party_id,to_party_id,relationship_type,label) VALUES (?,?,?,'primary_contact','Primary Contact')").bind(uuid(), personPartyId, businessPartyId),
      env.DB.prepare('UPDATE client_profiles SET business_party_id=? WHERE user_id=?').bind(businessPartyId, id),
    ])
  }

  await insertIdentity(env, id, identity)
  const user = await getPortalUser(env, id)
  if (!user) throw new Error('auth0 user create failed')
  return user
}

export function providerLabel(provider: string): string {
  if (provider === 'google-oauth2') return 'Google'
  if (provider === 'windowslive' || provider === 'waad') return 'Microsoft'
  return provider
}

export type { Auth0ProviderId }
