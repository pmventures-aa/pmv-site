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

const PUBLIC_BASE = 'https://www.pinnaclemanagementventures.com'
const CLIENT_BASE = `${PUBLIC_BASE}/portal`
const HQ_BASE = 'https://hq.pinnaclemanagementventures.com'

export function inviteUrl(type: InviteType, token: string): string {
  if (type === 'vendor') return `${HQ_BASE}/vendor-signup?invite=${encodeURIComponent(token)}`
  if (type === 'trusted_contact') return `${CLIENT_BASE}/trusted-invite/${encodeURIComponent(token)}`
  if (type === 'client') return `${CLIENT_BASE}/signup?invite=${encodeURIComponent(token)}`
  return `${HQ_BASE}/invite/${encodeURIComponent(token)}`
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
    stagedUserId?: string | null
  },
): Promise<{ id: string; token: string; expiresAt: string }> {
  const token = newInviteToken()
  const tokenHash = await inviteTokenHash(token)
  const id = uuid()
  const expiresAt = inviteExpiry(24)
  await env.DB.prepare(
    `INSERT INTO access_invites
      (id, invite_type, email, full_name, client_user_id, role_definition_id, metadata_json, token_hash, status, invited_by_user_id, expires_at, staged_user_id, email_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, 'queued')`,
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
    input.stagedUserId || null,
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

const providerServiceLabels: Record<string, string> = {
  property_field: 'property and field services',
  mobile_notary: 'mobile notary and signing work',
  ron: 'Remote Online Notarization (RON)',
  document_courier: 'document courier and mobile support',
  merchant_technology: 'merchant services, POS, and payment technology',
  business_operations: 'business operations and administrative support',
  bookkeeping_financial: 'bookkeeping and financial support',
  other: 'other professional services',
}

function parseInviteMetadata(value?: string | null): Record<string, unknown> {
  if (!value) return {}
  try { return JSON.parse(value) as Record<string, unknown> } catch { return {} }
}

export function providerInviteCopy(metadata: Record<string, unknown> = {}): { subject:string; eyebrow:string; title:string; body:string; cta:string } {
  const knownServices = Array.isArray(metadata.known_services)
    ? metadata.known_services.map(String).filter((key) => providerServiceLabels[key])
    : []
  const labels = knownServices.map((key) => providerServiceLabels[key])
  const notaryKnown = knownServices.includes('mobile_notary') || knownServices.includes('ron')
  const specialty = typeof metadata.vendor_category === 'string' ? metadata.vendor_category.trim() : ''
  const personalNote = typeof metadata.personal_note === 'string' ? metadata.personal_note.trim() : ''
  const knownContext = labels.length
    ? `Based on what I already know about your experience with ${labels.join(', ')}, I thought you could be a strong addition to the professional network we are building at Pinnacle Management Ventures.`
    : specialty
      ? `Based on what I know about your work in ${specialty}, I thought you could be a strong addition to the professional network we are building at Pinnacle Management Ventures.`
      : 'I am reaching out because I believe your professional experience could be a strong fit for the network we are building at Pinnacle Management Ventures.'
  const prefill = labels.length
    ? `I preselected ${labels.join(', ')} based on what I know today. Please review those selections, change anything that is not accurate, and add every other service you would like us to consider.`
    : 'The application lets you choose every service you would like us to consider and the locations or types of assignments you are available to accept.'

  return {
    subject: notaryKnown ? 'An invitation to join Pinnacle’s notary and professional network' : 'An invitation to join Pinnacle’s professional network',
    eyebrow: 'Pinnacle Professional Network',
    title: notaryKnown ? 'Your notary experience could be a strong fit for Pinnacle.' : 'I would like to learn more about the work you do.',
    body: `${knownContext}${personalNote ? `\n\n${personalNote}` : ''}\n\nPinnacle supports business owners, property owners, landlords, and professionals with operational support, documents and signing, notary services, property and field work, and coordinated provider assignments. When a client needs a qualified professional, I want to be able to turn to people who communicate clearly, protect the relationship, document the work, and follow through.\n\n${prefill}\n\nYou can apply as an individual or sole proprietor, or register your LLC, corporation, partnership, nonprofit, or other business. This invitation is connected to you, but it does not lock you into one business structure.\n\nApproved providers may be contacted when an assignment matches their services, location, availability, credentials, and fit. Joining the network is not an employment offer and does not guarantee assignment volume, but it gives us the information we need to consider you for the right opportunities.`,
    cta: 'Review & Start Application',
  }
}

function inviteCopy(type: InviteType, clientName?: string | null, metadata: Record<string, unknown> = {}): { subject:string; eyebrow:string; title:string; body:string; cta:string } {
  if (type === 'vendor') return providerInviteCopy(metadata)
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
  row: { id: string; invite_type: InviteType; email: string; full_name?: string | null; client_name?: string | null; metadata_json?: string | null },
  token: string,
  expiresAt: string,
): Promise<string> {
  const url = inviteUrl(row.invite_type, token)
  const copy = inviteCopy(row.invite_type, row.client_name, parseInviteMetadata(row.metadata_json))
  const firstName = (row.full_name || '').trim().split(/\s+/)[0] || 'there'
  const rendered = renderRelationshipEvent({
    eventKey: `invite_${row.invite_type}`,
    firstName,
    subject: copy.subject,
    preheader: row.invite_type === 'vendor' ? 'A personal invitation to apply to Pinnacle’s professional provider network.' : 'Your private Pinnacle invitation expires in 24 hours.',
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

export async function recordInviteEmailResult(
  env: Env,
  inviteId: string,
  result: { status: 'sent' | 'failed'; providerId?: string | null; error?: string | null },
): Promise<void> {
  await env.DB.prepare(
    `UPDATE access_invites SET
       email_status = ?,
       email_provider_id = COALESCE(?, email_provider_id),
       email_error = ?,
       email_sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE email_sent_at END,
       updated_at = datetime('now')
     WHERE id = ?`,
  ).bind(result.status, result.providerId || null, result.error || null, result.status, inviteId).run()
}
