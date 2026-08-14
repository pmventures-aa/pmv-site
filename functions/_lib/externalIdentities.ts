import type { Env } from './types'
import { uuid } from './crypto'

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

export async function findIdentityByIssuerSubject(
  env: Env,
  issuer: string,
  subject: string,
): Promise<ExternalIdentityRow | null> {
  return env.DB.prepare(
    `SELECT id, user_id, provider, issuer, subject, provider_email, email_verified, created_at, last_login_at
     FROM external_identities WHERE issuer = ? AND subject = ?`,
  ).bind(issuer, subject).first<ExternalIdentityRow>()
}

export async function listIdentitiesForUser(env: Env, userId: string): Promise<ExternalIdentityRow[]> {
  const result = await env.DB.prepare(
    `SELECT id, user_id, provider, issuer, subject, provider_email, email_verified, created_at, last_login_at
     FROM external_identities WHERE user_id = ? ORDER BY created_at ASC`,
  ).bind(userId).all<ExternalIdentityRow>()
  return result.results || []
}

export async function touchIdentityLogin(env: Env, identityId: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE external_identities SET last_login_at = datetime('now') WHERE id = ?",
  ).bind(identityId).run()
}

export async function insertExternalIdentity(
  env: Env,
  input: {
    userId: string
    provider: string
    issuer: string
    subject: string
    providerEmail: string | null
    emailVerified: boolean
  },
): Promise<ExternalIdentityRow> {
  const id = uuid()
  await env.DB.prepare(
    `INSERT INTO external_identities
      (id, user_id, provider, issuer, subject, provider_email, email_verified, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(
    id,
    input.userId,
    input.provider,
    input.issuer,
    input.subject,
    input.providerEmail,
    input.emailVerified ? 1 : 0,
  ).run()

  const row = await findIdentityByIssuerSubject(env, input.issuer, input.subject)
  if (!row) throw new Error('failed to persist external identity')
  return row
}

export async function deleteExternalIdentity(env: Env, identityId: string, userId: string): Promise<boolean> {
  const result = await env.DB.prepare(
    'DELETE FROM external_identities WHERE id = ? AND user_id = ?',
  ).bind(identityId, userId).run()
  return (result.meta?.changes || 0) > 0
}

export async function userHasPassword(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first<{ password_hash: string | null }>()
  return Boolean(row?.password_hash)
}

export async function countAuthMethods(env: Env, userId: string): Promise<{ passwords: number; identities: number; total: number }> {
  const user = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first<{ password_hash: string | null }>()
  const identities = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM external_identities WHERE user_id = ?',
  ).bind(userId).first<{ c: number }>()
  const passwords = user?.password_hash ? 1 : 0
  const identityCount = Number(identities?.c || 0)
  return { passwords, identities: identityCount, total: passwords + identityCount }
}
