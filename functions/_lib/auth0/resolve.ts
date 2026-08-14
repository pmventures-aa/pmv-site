import type { Env, SessionUser } from '../types'
import { uuid } from '../crypto'
import { activityInsert, logActivity } from '../activity'
import { logAudit, actorIp, actorUserAgent, actorGeo } from '../auditLog'
import { notifyStaff, escapeHtml, sendEmail } from '../email'
import { renderPinnacleEmailLayout } from '../emailTemplates/layout'
import { CLIENT_PORTAL_URL, sendAccountWelcome } from '../accountEmails'
import { advanceInquiryLifecycle } from '../lifecycle'
import type { InviteRow } from '../invites'
import type { Auth0IdentityClaims } from './claims'
import type { Auth0AppState } from './sdk'
import type { Auth0Provider } from './config'
import { AUTH0_GENERIC_ERROR, defaultPortalReturnTo, trustedReturnTo } from './config'
import {
  canUnlinkIdentity,
  createClientFromAuth0,
  deleteIdentity,
  findIdentity,
  getUserByEmail,
  getUserById,
  insertIdentity,
  isPortalRole,
  isUniqueConstraintError,
  listIdentities,
  namesFromClaims,
  toSessionUser,
  touchIdentityLogin,
  type ExternalIdentityRow,
  type LinkedUser,
} from './identities'

export type Auth0ResolveResult =
  | { ok: true; user: SessionUser; returnTo: string; created: boolean }
  | { ok: false; error: string; code: 'signin' | 'link' | 'unavailable'; status?: number }

const LINK_TTL_SECONDS = 30 * 60

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function pendingInviteForEmail(env: Env, email: string): Promise<InviteRow | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM access_invites
     WHERE email = ? AND status = 'pending' AND invite_type IN ('client', 'trusted_contact')
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(email).first<InviteRow>()
  if (!row) return null
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare("UPDATE access_invites SET status='expired', updated_at=datetime('now') WHERE id=? AND status='pending'").bind(row.id).run()
    return null
  }
  return row
}

async function acceptInvite(env: Env, invite: InviteRow, userId: string, fullName: string): Promise<void> {
  const statements = [
    env.DB.prepare(
      `UPDATE access_invites
       SET status = 'accepted', accepted_by_user_id = ?, accepted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND status = 'pending'`,
    ).bind(userId, invite.id),
  ]
  if (invite.invite_type === 'trusted_contact' && invite.client_user_id) {
    statements.push(
      env.DB.prepare(
        `UPDATE trusted_contacts
         SET contact_user_id = ?, full_name = ?, status = 'active', accepted_at = datetime('now'), updated_at = datetime('now')
         WHERE invite_id = ? AND client_user_id = ?`,
      ).bind(userId, fullName, invite.id, invite.client_user_id),
    )
  }
  await env.DB.batch(statements)
}

async function createTrustedContactFromInvite(env: Env, invite: InviteRow, claims: Auth0IdentityClaims): Promise<LinkedUser> {
  const email = (claims.email || invite.email).toLowerCase()
  const { firstName, lastName, fullName } = namesFromClaims(claims, email)
  const existing = await getUserByEmail(env, email)
  if (existing && (existing.role !== 'trusted_contact' || existing.status !== 'active')) {
    throw new Error('invite email belongs to another account')
  }
  const userId = existing?.id || uuid()
  if (existing) {
    await env.DB.prepare("UPDATE users SET full_name = ?, first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), status = 'active' WHERE id = ?")
      .bind(fullName, firstName || null, lastName || null, userId).run()
  } else {
    await env.DB.prepare(
      `INSERT INTO users(id,email,password_hash,role,full_name,first_name,last_name,two_factor_enabled,status)
       VALUES(?,?,NULL,'trusted_contact',?,?,?,0,'active')`,
    ).bind(userId, email, fullName, firstName || null, lastName || null).run()
  }
  await acceptInvite(env, invite, userId, fullName)
  const user = await getUserById(env, userId)
  if (!user) throw new Error('trusted contact create failed')
  return user
}

async function attachIdentity(env: Env, userId: string, claims: Auth0IdentityClaims, provider: Auth0Provider): Promise<ExternalIdentityRow> {
  try {
    return await insertIdentity(env, userId, claims, provider)
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error
    const existing = await findIdentity(env, claims.iss, claims.sub)
    if (existing && existing.user_id === userId) return existing
    throw Object.assign(new Error('identity_taken'), { code: 'identity_taken' })
  }
}

export async function sendLinkVerificationEmail(
  env: Env,
  user: LinkedUser,
  claims: Auth0IdentityClaims,
  provider: Auth0Provider,
  confirmUrl: string,
): Promise<void> {
  const firstName = user.first_name || String(user.full_name || '').split(/\s+/)[0] || 'there'
  const html = renderPinnacleEmailLayout({
    preheader: 'Connect a sign-in method to your Pinnacle account',
    eyebrow: 'Pinnacle account security',
    title: 'Connect this sign-in method',
    bodyHtml: `<p>Hi ${escapeHtml(firstName)},</p><p>Someone tried to sign in to Pinnacle with ${escapeHtml(provider.label)}. Confirm this request to connect that method to your existing account. This link expires in 30 minutes and can be used only once.</p><p>If you did not request this, you can ignore this email. Your current sign-in methods will remain unchanged.</p>`,
    cta: { label: 'Connect this method', url: confirmUrl },
    securityNote: 'Pinnacle will not connect a sign-in method until you confirm it from this email.',
  })
  await sendEmail(env, {
    to: user.email,
    subject: 'Connect a sign-in method to your Pinnacle account',
    html,
    replyTo: 'support@pinnaclemanagementventures.com',
    tags: [{ name: 'category', value: 'account_security' }],
  })
}

export async function createLinkToken(
  env: Env,
  userId: string,
  claims: Auth0IdentityClaims,
  provider: Auth0Provider,
): Promise<string> {
  const token = randomToken()
  await env.SESSIONS.put(
    `auth0-link:${token}`,
    JSON.stringify({
      userId,
      issuer: claims.iss,
      subject: claims.sub,
      provider: provider.connection,
      providerId: provider.id,
      email: claims.email,
      emailVerified: claims.emailVerified,
    }),
    { expirationTtl: LINK_TTL_SECONDS },
  )
  return token
}

export async function consumeLinkToken(env: Env, token: string): Promise<{
  userId: string
  issuer: string
  subject: string
  provider: string
  providerId: string
  email: string | null
  emailVerified: boolean
} | null> {
  const raw = await env.SESSIONS.get(`auth0-link:${token}`)
  if (!raw) return null
  await env.SESSIONS.delete(`auth0-link:${token}`)
  try {
    return JSON.parse(raw) as {
      userId: string
      issuer: string
      subject: string
      provider: string
      providerId: string
      email: string | null
      emailVerified: boolean
    }
  } catch {
    return null
  }
}

async function audit(env: Env, request: Request, action: string, userId: string | null, after?: Record<string, unknown>): Promise<void> {
  await logAudit(env, {
    actorUserId: userId,
    actorIp: actorIp(request),
    actorUserAgent: actorUserAgent(request),
    actorGeo: actorGeo(request),
    action,
    entityType: 'user',
    entityId: userId,
    after,
  })
}

export async function resolveAuth0Login(input: {
  env: Env
  request: Request
  claims: Auth0IdentityClaims
  appState: Auth0AppState
  provider: Auth0Provider
  authenticatedUserId?: string | null
  confirmLinkBase: string
}): Promise<Auth0ResolveResult> {
  const { env, request, claims, appState, provider } = input

  if (!claims.iss || !claims.sub) {
    return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'signin' }
  }

  const existingIdentity = await findIdentity(env, claims.iss, claims.sub)

  if (appState.intent === 'link') {
    const userId = input.authenticatedUserId || appState.userId
    if (!userId) return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'link' }
    if (appState.userId && appState.userId !== userId) {
      return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'link' }
    }
    const user = await getUserById(env, userId)
    if (!user || user.status !== 'active') return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'link' }
    if (!claims.emailVerified || !claims.email) {
      return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'link' }
    }
    if (existingIdentity && existingIdentity.user_id !== user.id) {
      return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'link' }
    }
    if (!existingIdentity) {
      try {
        await attachIdentity(env, user.id, claims, provider)
      } catch {
        return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'link' }
      }
    }
    await touchIdentityLogin(env, (existingIdentity || await findIdentity(env, claims.iss, claims.sub))!.id, user.id)
    await audit(env, request, 'identity_linked', user.id, { provider: provider.id })
    await logActivity(env, { actorUserId: user.id, clientUserId: user.role === 'client' ? user.id : null, kind: 'identity_linked', detail: { provider: provider.id } })
    return { ok: true, user: toSessionUser(user), returnTo: appState.returnTo, created: false }
  }

  if (existingIdentity) {
    const user = await getUserById(env, existingIdentity.user_id)
    if (!user || user.status !== 'active' || !isPortalRole(user.role)) {
      await audit(env, request, 'login_failed', user?.id ?? null, { reason: 'inactive_or_disallowed' })
      return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'signin' }
    }
    await touchIdentityLogin(env, existingIdentity.id, user.id)
    if (user.role === 'client') {
      await env.DB.prepare("UPDATE contact_inquiries SET client_user_id = COALESCE(client_user_id, ?), updated_at = datetime('now') WHERE lower(email) = lower(?) AND converted_at IS NULL AND archived_at IS NULL").bind(user.id, user.email).run()
      await advanceInquiryLifecycle(env, { userId: user.id, email: user.email, target: 'prospect' })
    }
    await audit(env, request, 'login', user.id, { method: 'auth0', provider: provider.id })
    return { ok: true, user: toSessionUser(user), returnTo: appState.returnTo, created: false }
  }

  if (!claims.email || !claims.emailVerified) {
    return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'signin' }
  }

  const invite = await pendingInviteForEmail(env, claims.email)
  if (invite) {
    try {
      const existingInvitee = await getUserByEmail(env, claims.email)
      if (existingInvitee) {
        const roleOk = invite.invite_type === 'trusted_contact'
          ? existingInvitee.role === 'trusted_contact'
          : existingInvitee.role === 'client'
        if (existingInvitee.status !== 'active' || !roleOk) {
          return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'signin' }
        }
        await acceptInvite(env, invite, existingInvitee.id, existingInvitee.full_name || existingInvitee.email)
        await attachIdentity(env, existingInvitee.id, claims, provider)
        await audit(env, request, 'login', existingInvitee.id, { method: 'auth0', provider: provider.id, invited: true })
        return { ok: true, user: toSessionUser(existingInvitee), returnTo: appState.returnTo, created: false }
      }
      const invited = invite.invite_type === 'trusted_contact'
        ? await createTrustedContactFromInvite(env, invite, claims)
        : await (async () => {
          const created = await createClientFromAuth0(env, claims)
          await acceptInvite(env, invite, created.id, created.full_name || created.email)
          return created
        })()
      await attachIdentity(env, invited.id, claims, provider)
      await audit(env, request, 'login', invited.id, { method: 'auth0', provider: provider.id, invited: true })
      return { ok: true, user: toSessionUser(invited), returnTo: appState.returnTo, created: true }
    } catch {
      return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'signin' }
    }
  }

  const emailOwner = await getUserByEmail(env, claims.email)
  if (emailOwner) {
    if (emailOwner.status === 'active' && isPortalRole(emailOwner.role)) {
      const token = await createLinkToken(env, emailOwner.id, claims, provider)
      const confirmUrl = `${input.confirmLinkBase}?token=${encodeURIComponent(token)}`
      await sendLinkVerificationEmail(env, emailOwner, claims, provider, confirmUrl)
      await audit(env, request, 'identity_link_requested', emailOwner.id, { provider: provider.id })
    }
    return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'link' }
  }

  try {
    const created = await createClientFromAuth0(env, claims)
    await attachIdentity(env, created.id, claims, provider)
    await env.DB.prepare("UPDATE contact_inquiries SET client_user_id = COALESCE(client_user_id, ?), updated_at = datetime('now') WHERE lower(email) = lower(?) AND converted_at IS NULL AND archived_at IS NULL").bind(created.id, created.email).run()
    await advanceInquiryLifecycle(env, { userId: created.id, email: created.email, target: 'prospect' })
    await env.DB.batch([
      activityInsert(env, { clientUserId: created.id, kind: 'client_signed_up', detail: { email: created.email, method: 'auth0', provider: provider.id } }),
    ])
    await audit(env, request, 'login', created.id, { method: 'auth0', provider: provider.id, created: true })
    const firstName = created.first_name || created.full_name || 'there'
    const fullName = created.full_name || created.email
    void notifyStaff(env, {
      staffUserIds: [],
      kind: 'client_signed_up',
      subject: `New client signup: ${fullName}`,
      html: `<p><strong>${escapeHtml(fullName)}</strong> created a new Pinnacle client account with ${escapeHtml(provider.label)}.</p><p>Email: ${escapeHtml(created.email)}</p>`,
    }).catch(() => undefined)
    void sendAccountWelcome(env, {
      userId: created.id,
      role: 'client',
      email: created.email,
      firstName,
      businessName: null,
      creationType: 'self_signup',
      actionLabel: 'Open My Client Portal',
      actionUrl: CLIENT_PORTAL_URL,
    }).catch((err) => console.error('[account-email] auth0 signup welcome failed', err))
    return { ok: true, user: toSessionUser(created), returnTo: appState.returnTo, created: true }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'link' }
    }
    console.error('[auth0] new user failed', error instanceof Error ? error.message : 'error')
    return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'signin' }
  }
}

export async function confirmAuth0Link(env: Env, request: Request, token: string): Promise<Auth0ResolveResult> {
  const pending = await consumeLinkToken(env, token)
  if (!pending) return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'link' }
  const user = await getUserById(env, pending.userId)
  if (!user || user.status !== 'active' || !isPortalRole(user.role)) {
    return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'link' }
  }
  const taken = await findIdentity(env, pending.issuer, pending.subject)
  if (taken && taken.user_id !== user.id) return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'link' }
  if (!taken) {
    try {
      await insertIdentity(env, user.id, {
        iss: pending.issuer,
        sub: pending.subject,
        email: pending.email,
        emailVerified: pending.emailVerified,
        givenName: '',
        familyName: '',
        fullName: '',
        connection: pending.provider,
      }, { id: pending.providerId, connection: pending.provider })
    } catch {
      return { ok: false, error: AUTH0_GENERIC_ERROR, code: 'link' }
    }
  }
  await audit(env, request, 'identity_linked', user.id, { provider: pending.providerId, method: 'email_confirmation' })
  await logActivity(env, { actorUserId: user.id, clientUserId: user.role === 'client' ? user.id : null, kind: 'identity_linked', detail: { provider: pending.providerId } })
  return { ok: true, user: toSessionUser(user), returnTo: user.role === 'trusted_contact' ? trustedReturnTo(request) : defaultPortalReturnTo(request), created: false }
}

export async function unlinkIdentityForUser(env: Env, request: Request, user: SessionUser, identityId: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const live = await getUserById(env, user.id)
  if (!live || live.status !== 'active') return { ok: false, error: 'unauthorized', status: 401 }
  const identities = await listIdentities(env, user.id)
  const allowed = canUnlinkIdentity(live, identities, identityId)
  if (!allowed.ok) return { ok: false, error: allowed.error, status: 400 }
  const removed = await deleteIdentity(env, identityId, user.id)
  if (!removed) return { ok: false, error: 'that sign-in method is not connected to this account', status: 404 }
  await audit(env, request, 'identity_unlinked', user.id, { identity_id: identityId })
  await logActivity(env, { actorUserId: user.id, clientUserId: user.role === 'client' ? user.id : null, kind: 'identity_unlinked', detail: { identity_id: identityId } })
  return { ok: true }
}
