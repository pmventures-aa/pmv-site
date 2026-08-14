import type { Role } from '../types'
import { uuid } from '../crypto'

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

export interface Auth0UserRow {
  id: string
  email: string
  role: Role
  status: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  password_hash: string | null
}

export interface PendingInviteRow {
  id: string
  invite_type: 'vendor' | 'client' | 'staff' | 'trusted_contact'
  email: string
  full_name: string | null
  client_user_id: string | null
  status: string
}

export interface Auth0IdentityClaims {
  issuer: string
  subject: string
  email: string | null
  emailVerified: boolean
  name: string | null
  givenName: string | null
  familyName: string | null
  nonce: string | null
  connection: string
}

export type Auth0Purpose = 'login' | 'link'

export type Auth0ResolveResult =
  | { ok: true; user: Auth0UserRow; created: boolean; linked: boolean }
  | { ok: false; code: 'unverified_email' | 'unknown_identity' | 'disabled_user' | 'already_linked' | 'invalid_link' | 'conflict' | 'wrong_surface' }

export interface Auth0Db {
  findIdentity(issuer: string, subject: string): Promise<ExternalIdentityRow | null>
  insertIdentity(row: Omit<ExternalIdentityRow, 'created_at' | 'last_login_at'> & { last_login_at?: string | null }): Promise<'ok' | 'conflict'>
  updateIdentityLogin(id: string): Promise<void>
  listIdentities(userId: string): Promise<ExternalIdentityRow[]>
  deleteIdentity(id: string, userId: string): Promise<boolean>
  findUserById(id: string): Promise<Auth0UserRow | null>
  findUserByEmail(email: string): Promise<Auth0UserRow | null>
  insertUser(row: Auth0UserRow & { tos_accepted?: boolean }): Promise<void>
  updateUserLogin(id: string): Promise<void>
  findPendingInvite(email: string): Promise<PendingInviteRow | null>
  acceptInvite(inviteId: string, userId: string): Promise<void>
  activateTrustedContact(inviteId: string, clientUserId: string, userId: string, fullName: string): Promise<void>
}

export function splitName(claims: Auth0IdentityClaims): { first: string; last: string; full: string } {
  const given = (claims.givenName || '').trim()
  const family = (claims.familyName || '').trim()
  if (given || family) {
    const full = `${given} ${family}`.trim()
    return { first: given || full, last: family, full }
  }
  const name = (claims.name || '').trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    return { first: parts[0] || name, last: parts.slice(1).join(' '), full: name }
  }
  const local = (claims.email || 'client').split('@')[0]
  return { first: local, last: '', full: local }
}

export function canUnlinkIdentity(user: Auth0UserRow, identities: ExternalIdentityRow[], identityId: string): boolean {
  const target = identities.find((row) => row.id === identityId)
  if (!target) return false
  const remaining = identities.filter((row) => row.id !== identityId)
  return !!user.password_hash || remaining.length > 0
}

export function portalRoleAllowed(role: Role, surface: 'client' | 'staff'): boolean {
  if (surface === 'staff') return role === 'staff' || role === 'admin'
  return role === 'client' || role === 'trusted_contact'
}

function toSessionUser(user: Auth0UserRow): Auth0UserRow {
  return user
}

export async function resolveAuth0Identity(
  db: Auth0Db,
  claims: Auth0IdentityClaims,
  input: {
    purpose: Auth0Purpose
    surface: 'client' | 'staff'
    linkingUserId?: string | null
  },
): Promise<Auth0ResolveResult> {
  if (!claims.issuer || !claims.subject) return { ok: false, code: 'conflict' }
  if (!claims.emailVerified || !claims.email) return { ok: false, code: 'unverified_email' }

  const email = claims.email.trim().toLowerCase()
  const existingIdentity = await db.findIdentity(claims.issuer, claims.subject)

  if (existingIdentity) {
    const user = await db.findUserById(existingIdentity.user_id)
    if (!user || user.status !== 'active') return { ok: false, code: 'disabled_user' }
    if (input.purpose === 'link' && input.linkingUserId && input.linkingUserId !== user.id) {
      return { ok: false, code: 'already_linked' }
    }
    if (input.purpose === 'login' && !portalRoleAllowed(user.role, input.surface)) {
      return { ok: false, code: 'wrong_surface' }
    }
    await db.updateIdentityLogin(existingIdentity.id)
    await db.updateUserLogin(user.id)
    return { ok: true, user: toSessionUser(user), created: false, linked: false }
  }

  if (input.purpose === 'link') {
    if (!input.linkingUserId) return { ok: false, code: 'invalid_link' }
    const linker = await db.findUserById(input.linkingUserId)
    if (!linker || linker.status !== 'active') return { ok: false, code: 'disabled_user' }
    const inserted = await db.insertIdentity({
      id: uuid(),
      user_id: linker.id,
      provider: claims.connection,
      issuer: claims.issuer,
      subject: claims.subject,
      email,
      email_verified: 1,
      last_login_at: new Date().toISOString(),
    })
    if (inserted === 'conflict') {
      const raced = await db.findIdentity(claims.issuer, claims.subject)
      if (raced && raced.user_id === linker.id) {
        await db.updateIdentityLogin(raced.id)
        return { ok: true, user: linker, created: false, linked: false }
      }
      return { ok: false, code: 'already_linked' }
    }
    await db.updateUserLogin(linker.id)
    return { ok: true, user: linker, created: false, linked: true }
  }

  // Never auto-link an established Pinnacle user just because emails match.
  const invite = await db.findPendingInvite(email)
  if (invite && (invite.invite_type === 'client' || invite.invite_type === 'trusted_contact')) {
    const invited = await completeInvitation(db, claims, email, invite, input.surface)
    if (invited) return invited
  }

  const existing = await db.findUserByEmail(email)
  if (existing) {
    const reserved = existing.status === 'active'
      && !existing.password_hash
      && (await db.listIdentities(existing.id)).length === 0
      && existing.role === 'client'
    if (reserved && input.surface === 'client') {
      const inserted = await db.insertIdentity({
        id: uuid(),
        user_id: existing.id,
        provider: claims.connection,
        issuer: claims.issuer,
        subject: claims.subject,
        email,
        email_verified: 1,
        last_login_at: new Date().toISOString(),
      })
      if (inserted === 'conflict') return { ok: false, code: 'already_linked' }
      await db.updateUserLogin(existing.id)
      return { ok: true, user: existing, created: false, linked: true }
    }
    return { ok: false, code: 'unknown_identity' }
  }

  if (input.surface !== 'client') return { ok: false, code: 'unknown_identity' }

  const names = splitName(claims)
  const userId = uuid()
  const user: Auth0UserRow = {
    id: userId,
    email,
    role: 'client',
    status: 'active',
    full_name: names.full,
    first_name: names.first,
    last_name: names.last || null,
    password_hash: null,
  }
  try {
    await db.insertUser({ ...user, tos_accepted: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'email_conflict') return { ok: false, code: 'unknown_identity' }
    throw error
  }
  const inserted = await db.insertIdentity({
    id: uuid(),
    user_id: userId,
    provider: claims.connection,
    issuer: claims.issuer,
    subject: claims.subject,
    email,
    email_verified: 1,
    last_login_at: new Date().toISOString(),
  })
  if (inserted === 'conflict') return { ok: false, code: 'already_linked' }
  return { ok: true, user, created: true, linked: true }
}

async function completeInvitation(
  db: Auth0Db,
  claims: Auth0IdentityClaims,
  email: string,
  invite: PendingInviteRow,
  surface: 'client' | 'staff',
): Promise<Auth0ResolveResult | null> {
  if (surface !== 'client') return null
  const existing = await db.findUserByEmail(email)
  const names = splitName(claims)
  const fullName = names.full || invite.full_name || email

  if (invite.invite_type === 'trusted_contact') {
    if (!invite.client_user_id) return { ok: false, code: 'conflict' }
    if (existing && existing.role !== 'trusted_contact') return { ok: false, code: 'unknown_identity' }
    const user = existing || {
      id: uuid(),
      email,
      role: 'trusted_contact' as const,
      status: 'active',
      full_name: fullName,
      first_name: names.first,
      last_name: names.last || null,
      password_hash: null,
    }
    if (!existing) {
      try { await db.insertUser(user) }
      catch (error) {
        if (error instanceof Error && error.message === 'email_conflict') return { ok: false, code: 'unknown_identity' }
        throw error
      }
    }
    else if (existing.status !== 'active') return { ok: false, code: 'disabled_user' }
    const inserted = await db.insertIdentity({
      id: uuid(),
      user_id: user.id,
      provider: claims.connection,
      issuer: claims.issuer,
      subject: claims.subject,
      email,
      email_verified: 1,
      last_login_at: new Date().toISOString(),
    })
    if (inserted === 'conflict') return { ok: false, code: 'already_linked' }
    await db.activateTrustedContact(invite.id, invite.client_user_id, user.id, fullName)
    await db.acceptInvite(invite.id, user.id)
    await db.updateUserLogin(user.id)
    return { ok: true, user, created: !existing, linked: true }
  }

  if (existing && existing.role !== 'client') return { ok: false, code: 'unknown_identity' }
  const user = existing || {
    id: uuid(),
    email,
    role: 'client' as const,
    status: 'active',
    full_name: fullName,
    first_name: names.first,
    last_name: names.last || null,
    password_hash: null,
  }
  if (!existing) {
    try { await db.insertUser({ ...user, tos_accepted: true }) }
    catch (error) {
      if (error instanceof Error && error.message === 'email_conflict') return { ok: false, code: 'unknown_identity' }
      throw error
    }
  }
  else if (existing.status !== 'active') return { ok: false, code: 'disabled_user' }
  const inserted = await db.insertIdentity({
    id: uuid(),
    user_id: user.id,
    provider: claims.connection,
    issuer: claims.issuer,
    subject: claims.subject,
    email,
    email_verified: 1,
    last_login_at: new Date().toISOString(),
  })
  if (inserted === 'conflict') return { ok: false, code: 'already_linked' }
  await db.acceptInvite(invite.id, user.id)
  await db.updateUserLogin(user.id)
  return { ok: true, user, created: !existing, linked: true }
}

export function stripAuthorizationClaims(raw: Record<string, unknown> | undefined): Auth0IdentityClaims {
  const issuer = typeof raw?.iss === 'string' ? raw.iss : ''
  const subject = typeof raw?.sub === 'string' ? raw.sub : ''
  const email = typeof raw?.email === 'string' ? raw.email : null
  const emailVerified = raw?.email_verified === true || raw?.email_verified === 'true'
  const name = typeof raw?.name === 'string' ? raw.name : null
  const givenName = typeof raw?.given_name === 'string' ? raw.given_name : null
  const familyName = typeof raw?.family_name === 'string' ? raw.family_name : null
  const nonce = typeof raw?.nonce === 'string' ? raw.nonce : null
  return { issuer, subject, email, emailVerified, name, givenName, familyName, nonce, connection: '' }
}
