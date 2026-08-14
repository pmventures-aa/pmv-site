import type { Env, SessionUser } from '../types'
import { uuid } from '../crypto'

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

export interface LinkedIdentityView {
  id: string
  provider: string
  connection_name: string | null
  provider_email: string | null
  email_verified: boolean
  created_at: string
  last_login_at: string | null
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

export async function listIdentitiesForUser(env: Env, userId: string): Promise<LinkedIdentityView[]> {
  const rows = await env.DB.prepare(
    `SELECT id,provider,connection_name,provider_email,email_verified,created_at,last_login_at
     FROM external_identities WHERE user_id = ? ORDER BY created_at ASC`,
  ).bind(userId).all<ExternalIdentityRow>()
  return (rows.results || []).map((row) => ({
    id: row.id,
    provider: row.provider,
    connection_name: row.connection_name,
    provider_email: row.provider_email,
    email_verified: !!row.email_verified,
    created_at: row.created_at,
    last_login_at: row.last_login_at,
  }))
}

export async function userHasPassword(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first<{ password_hash: string | null }>()
  return Boolean(row?.password_hash)
}

export async function countUsableAuthMethods(env: Env, userId: string): Promise<{ password: boolean; identities: number; total: number }> {
  const password = await userHasPassword(env, userId)
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM external_identities WHERE user_id = ?').bind(userId).first<{ n: number }>()
  const identities = count?.n || 0
  return { password, identities, total: (password ? 1 : 0) + identities }
}

export async function insertExternalIdentity(
  env: Env,
  input: {
    userId: string
    provider: string
    connectionName: string | null
    issuer: string
    subject: string
    providerEmail: string | null
    emailVerified: boolean
  },
): Promise<{ ok: true; id: string } | { ok: false; reason: 'duplicate_identity' | 'conflict' }> {
  const existing = await findIdentityByIssuerSubject(env, input.issuer, input.subject)
  if (existing) {
    if (existing.user_id === input.userId) return { ok: true, id: existing.id }
    return { ok: false, reason: 'duplicate_identity' }
  }
  const id = uuid()
  try {
    await env.DB.prepare(
      `INSERT INTO external_identities
       (id, user_id, provider, connection_name, issuer, subject, provider_email, email_verified, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(
      id,
      input.userId,
      input.provider,
      input.connectionName,
      input.issuer,
      input.subject,
      input.providerEmail,
      input.emailVerified ? 1 : 0,
    ).run()
    return { ok: true, id }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/UNIQUE|constraint/i.test(message)) return { ok: false, reason: 'duplicate_identity' }
    console.error('[auth0] identity insert failed', message)
    return { ok: false, reason: 'conflict' }
  }
}

export async function touchIdentityLogin(env: Env, identityId: string): Promise<void> {
  await env.DB.prepare("UPDATE external_identities SET last_login_at = datetime('now') WHERE id = ?").bind(identityId).run()
}

export async function deleteExternalIdentity(
  env: Env,
  userId: string,
  identityId: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'last_method' }> {
  const row = await env.DB.prepare(
    'SELECT id,user_id FROM external_identities WHERE id = ?',
  ).bind(identityId).first<{ id: string; user_id: string }>()
  if (!row || row.user_id !== userId) return { ok: false, reason: 'not_found' }

  const methods = await countUsableAuthMethods(env, userId)
  if (methods.total <= 1) return { ok: false, reason: 'last_method' }

  await env.DB.prepare('DELETE FROM external_identities WHERE id = ? AND user_id = ?').bind(identityId, userId).run()
  return { ok: true }
}

export async function loadPortalEligibleUser(
  env: Env,
  userId: string,
): Promise<(SessionUser & { status: string }) | null> {
  const user = await env.DB.prepare(
    `SELECT id,email,role,full_name,first_name,last_name,status FROM users WHERE id = ?`,
  ).bind(userId).first<any>()
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
    status: user.status,
  }
}

/** Clients and trusted contacts may use Auth0 on the client portal. */
export function canUseClientPortalAuth(role: string, status: string): boolean {
  if (status !== 'active') return false
  return role === 'client' || role === 'trusted_contact'
}
