import type { Env } from './types'
import { sendEmailStrict, escapeHtml } from './email'
import { uuid } from './crypto'

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

export function inviteUrl(type: InviteType, token: string): string {
  if (type === 'vendor') return `https://hq.pinnaclemanagementventures.com/vendor-signup?invite=${encodeURIComponent(token)}`
  if (type === 'trusted_contact') return `https://client.pinnaclemanagementventures.com/trusted-invite/${encodeURIComponent(token)}`
  if (type === 'client') return `https://client.pinnaclemanagementventures.com/signup?invite=${encodeURIComponent(token)}`
  return `https://hq.pinnaclemanagementventures.com/invite/${encodeURIComponent(token)}`
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

function inviteLabel(type: InviteType): string {
  if (type === 'vendor') return 'professional provider onboarding'
  if (type === 'trusted_contact') return 'Trusted Contact access'
  if (type === 'client') return 'Pinnacle client onboarding'
  return 'Pinnacle team onboarding'
}

export async function sendInviteEmail(
  env: Env,
  row: { id: string; invite_type: InviteType; email: string; full_name?: string | null; client_name?: string | null },
  token: string,
  expiresAt: string,
): Promise<string> {
  const url = inviteUrl(row.invite_type, token)
  const first = (row.full_name || '').trim().split(/\s+/)[0] || 'there'
  const context = row.invite_type === 'trusted_contact' && row.client_name
    ? `${escapeHtml(row.client_name)} invited you to become a Trusted Contact in their Pinnacle Client Portal.`
    : `You have been invited to complete ${inviteLabel(row.invite_type)} with Pinnacle Management Ventures.`
  const subject = row.invite_type === 'trusted_contact'
    ? `Trusted Contact invitation from ${row.client_name || 'a Pinnacle client'}`
    : `You're invited to Pinnacle — ${inviteLabel(row.invite_type)}`
  return sendEmailStrict(env, {
    to: row.email,
    subject,
    html: `<div style="font-family:Arial,sans-serif;color:#15243b;line-height:1.6"><div style="border-top:6px solid #c59b45;padding-top:22px"><p>Hi ${escapeHtml(first)},</p><p>${context}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;background:#c59b45;color:#091525;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px">Open invitation</a></p><p style="font-size:13px;color:#5e6877">This private one-time invitation expires in 24 hours (${escapeHtml(expiresAt)}). If you were not expecting it, you can ignore this email.</p><p>Pinnacle Management Ventures</p></div></div>`,
    text: `Hi ${first},\n\n${row.invite_type === 'trusted_contact' && row.client_name ? `${row.client_name} invited you to become a Trusted Contact.` : `You have been invited to complete ${inviteLabel(row.invite_type)} with Pinnacle Management Ventures.`}\n\nOpen: ${url}\n\nThis private one-time invitation expires in 24 hours (${expiresAt}).`,
    idempotencyKey: `invite-${row.id}-${expiresAt}`,
    tags: [{ name: 'category', value: 'access_invite' }, { name: 'invite_type', value: row.invite_type }],
  })
}
