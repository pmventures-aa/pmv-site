import type { Env } from './types'
import { sendEmailStrict } from './email'
import { uuid } from './crypto'
import { renderRelationshipEvent } from './emailTemplates/relationship'

export type InviteType = 'vendor' | 'client' | 'staff' | 'trusted_contact'

export interface InviteRow {
  id: string
  invite_type: InviteType
  email: string
  full_name: string | null
  client_user_id: string | null
  role_definition_id: string | null
  metadata_json: string
  status: string
  expires_at: string
  invited_by_user_id: string | null
  accepted_by_user_id: string | null
  accepted_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function newInviteToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)))
}

export async function inviteTokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token) as unknown as BufferSource)
  return hex(new Uint8Array(digest))
}

export function inviteExpiry(hours = 24): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

const SECURE_BASE = 'https://secure.pinnaclemanagementventures.com'

export function inviteUrl(type: InviteType, token: string): string {
  if (type === 'vendor') return `${SECURE_BASE}/hq/vendor-signup?invite=${encodeURIComponent(token)}`
  if (type === 'trusted_contact') return `${SECURE_BASE}/trusted-invite/${encodeURIComponent(token)}`
  if (type === 'client') return `${SECURE_BASE}/signup?invite=${encodeURIComponent(token)}`
  return `${SECURE_BASE}/hq/invite/${encodeURIComponent(token)}`
}

export async function createInvite(
  env: Env,
  input: {
    inviteType: InviteType
    email: string
    fullName?: string | null
    clientUserId?: string | null
    roleDefinitionId?: string | null
    metadata?: Record<string, unknown>
    invitedByUserId?: string | null
  },
): Promise<{ id: string; token: string; expiresAt: string }> {
  const token = newInviteToken()
  const tokenHash = await inviteTokenHash(token)
  const id = uuid()
  const expiresAt = inviteExpiry(24)
  await env.DB.prepare(
    `INSERT INTO access_invites
      (id, invite_type, email, full_name, client_user_id, role_definition_id, metadata_json, token_hash, status, invited_by_user_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).bind(
    id,
    input.inviteType,
    input.email.trim().toLowerCase(),
    input.fullName?.trim() || null,
    input.clientUserId || null,
    input.roleDefinitionId || null,
    JSON.stringify(input.metadata || {}),
    tokenHash,
    input.invitedByUserId || null,
    expiresAt,
  ).run()
  return { id, token, expiresAt }
}

export async function getInviteByToken(env: Env, token: string): Promise<InviteRow | null> {
  const hash = await inviteTokenHash(token)
  const row = await env.DB.prepare('SELECT * FROM access_invites WHERE token_hash = ?').bind(hash).first<InviteRow>()
  if (!row) return null
  if (row.status === 'pending' && new Date(row.expires_at).getTime() <= Date.now()) {
    await env.DB.prepare("UPDATE access_invites SET status='expired', updated_at=datetime('now') WHERE id=? AND status='pending'").bind(row.id).run()
    return { ...row, status: 'expired' }
  }
  return row
}

export async function rotateInviteToken(env: Env, inviteId: string): Promise<{ token: string; expiresAt: string }> {
  const token = newInviteToken()
  const hash = await inviteTokenHash(token)
  const expiresAt = inviteExpiry(24)
  await env.DB.prepare(
    `UPDATE access_invites SET token_hash=?, status='pending', expires_at=?, accepted_by_user_id=NULL,
       accepted_at=NULL, revoked_at=NULL, updated_at=datetime('now') WHERE id=?`,
  ).bind(hash, expiresAt, inviteId).run()
  return { token, expiresAt }
}

function inviteCopy(type: InviteType, clientName?: string | null): { subject:string; eyebrow:string; title:string; body:string; cta:string } {
  if (type === 'vendor') return {
    subject: 'Pinnacle provider application invitation',
    eyebrow: 'Pinnacle Professional Network',
    title: 'Complete your provider application',
    body: 'Pinnacle would like to review your services and qualifications for our professional network. Approved providers may be contacted for specific client assignments based on specialty, location, availability, credentials, and fit.\n\nJoining the network is not an employment offer and does not guarantee assignment volume. The application helps us understand the work you are qualified and available to perform.',
    cta: 'Open Provider Application',
  }
  if (type === 'trusted_contact') return {
    subject: `${clientName || 'A Pinnacle client'} invited you as a Trusted Contact`,
    eyebrow: 'Trusted Contact access',
    title: 'You have been invited to a Pinnacle client workspace',
    body: `${clientName || 'A Pinnacle client'} has given you secure access to specific parts of their Pinnacle Client Portal. The client controls what you can view or edit and may change or revoke that access at any time.\n\nUse the invitation to create your own secure login. You will not need the client’s password.`,
    cta: 'Review Access',
  }
  if (type === 'client') return {
    subject: 'Your Pinnacle client invitation',
    eyebrow: 'Pinnacle client invitation',
    title: 'Set up your Pinnacle account',
    body: 'Pinnacle has created a private invitation for you to open your Client Portal. Your portal keeps services, applications, documents, messages, appointments, billing, and active work in one place.',
    cta: 'Set Up Client Account',
  }
  return {
    subject: 'Your Pinnacle HQ invitation',
    eyebrow: 'Pinnacle HQ',
    title: 'Set up your Pinnacle team account',
    body: 'You have been invited to Pinnacle Management Ventures with a defined role and permission set. HQ will show only the tools and client information your account is authorized to access.\n\nUse your private setup link to create your account.',
    cta: 'Set Up HQ Access',
  }
}

export async function sendInviteEmail(
  env: Env,
  row: { id: string; invite_type: InviteType; email: string; full_name?: string | null; client_name?: string | null },
  token: string,
  expiresAt: string,
): Promise<string> {
  const url = inviteUrl(row.invite_type, token)
  const copy = inviteCopy(row.invite_type, row.client_name)
  const firstName = (row.full_name || '').trim().split(/\s+/)[0] || 'there'
  const rendered = renderRelationshipEvent({
    eventKey: `invite_${row.invite_type}`,
    firstName,
    subject: copy.subject,
    preheader: 'Your private Pinnacle invitation expires in 24 hours.',
    eyebrow: copy.eyebrow,
    title: copy.title,
    body: `${copy.body}\n\nThis private invitation expires in 24 hours. If you were not expecting it, you can ignore this message or contact Pinnacle before creating an account.`,
    ctaLabel: copy.cta,
    ctaUrl: url,
  })
  return sendEmailStrict(env, {
    to: row.email,
    subject: rendered.subject,
    html: rendered.html,
    text: `${rendered.text}\n\nInvitation expiration: ${expiresAt}`,
    replyTo: 'orders@pinnaclemanagementventures.com',
    idempotencyKey: `invite-${row.id}-${expiresAt}`,
    tags: [{ name: 'category', value: 'access_invite' }, { name: 'invite_type', value: row.invite_type }],
  })
}
