import type { Env } from './types'
import { uuid } from './crypto'

export interface ExternalIdentity {
  id: string
  user_id: string
  provider: string
  connection: string
  issuer: string
  subject: string
  email: string | null
  email_verified: number
  created_at: string
  last_login_at: string | null
}

export interface Auth0IdentityClaims {
  issuer: string
  subject: string
  connection: string
  email: string | null
  emailVerified: boolean
}

export async function findExternalIdentityByIssuerSubject(
  env: Env,
  issuer: string,
  subject: string,
): Promise<ExternalIdentity | null> {
  return env.DB.prepare(
    'SELECT * FROM external_identities WHERE issuer = ? AND subject = ?',
  ).bind(issuer, subject).first<ExternalIdentity>()
}

export async function listExternalIdentities(env: Env, userId: string): Promise<ExternalIdentity[]> {
  const res = await env.DB.prepare(
    'SELECT * FROM external_identities WHERE user_id = ? ORDER BY created_at ASC',
  ).bind(userId).all<ExternalIdentity>()
  return res.results ?? []
}

export async function countExternalIdentities(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM external_identities WHERE user_id = ?',
  ).bind(userId).first<{ n: number }>()
  return row?.n ?? 0
}

export async function touchExternalIdentityLogin(env: Env, identityId: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE external_identities SET last_login_at = datetime('now') WHERE id = ?",
  ).bind(identityId).run()
}

export async function insertExternalIdentity(
  env: Env,
  input: {
    userId: string
    claims: Auth0IdentityClaims
  },
): Promise<ExternalIdentity> {
  const id = uuid()
  await env.DB.prepare(
    `INSERT INTO external_identities
      (id, user_id, provider, connection, issuer, subject, email, email_verified, last_login_at)
     VALUES (?, ?, 'auth0', ?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(
    id,
    input.userId,
    input.claims.connection,
    input.claims.issuer,
    input.claims.subject,
    input.claims.email,
    input.claims.emailVerified ? 1 : 0,
  ).run()
  const created = await env.DB.prepare('SELECT * FROM external_identities WHERE id = ?').bind(id).first<ExternalIdentity>()
  if (!created) throw new Error('failed to create external identity')
  return created
}

export async function deleteExternalIdentity(env: Env, identityId: string, userId: string): Promise<boolean> {
  const result = await env.DB.prepare(
    'DELETE FROM external_identities WHERE id = ? AND user_id = ?',
  ).bind(identityId, userId).run()
  return (result.meta?.changes ?? 0) > 0
}

export async function userHasPassword(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT password_hash FROM users WHERE id = ?',
  ).bind(userId).first<{ password_hash: string | null }>()
  return Boolean(row?.password_hash)
}

export async function userCanUnlinkIdentity(env: Env, userId: string): Promise<boolean> {
  const [password, identityCount] = await Promise.all([
    userHasPassword(env, userId),
    countExternalIdentities(env, userId),
  ])
  if (identityCount <= 1) return password
  return true
}
