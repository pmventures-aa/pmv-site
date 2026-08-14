import type { Env } from './types'
import { uuid } from './crypto'
import { activityInsert } from './activity'
import { sendEmailStrict } from './email'
import {
  renderAccountWelcome,
  renderPortalReminder,
  renderVendorApplicationReceived,
  renderVendorApproved,
  type AccountCreationType,
  type AccountRole,
  type RenderedEmail,
} from './emailTemplates/welcome'
import { renderHqEmailOrFallback } from './hqEmailTemplates'
import { hqLoginUrl, portalLoginUrl, portalUrl } from './appUrls'

export type AccountEmailKind = 'account_welcome' | 'setup_invite' | 'portal_reminder' | 'vendor_application_received' | 'vendor_approved'
export type AccountEmailStatus = 'queued' | 'skipped' | 'sent' | 'delivered' | 'delayed' | 'bounced' | 'failed' | 'complained' | 'suppressed'

export interface AccountEmailResult {
  deliveryId: string
  status: AccountEmailStatus
  providerId: string | null
  error?: string
  duplicate?: boolean
}

interface TrackedSendInput {
  userId: string
  role: AccountRole
  email: string
  kind: AccountEmailKind
  creationType?: AccountCreationType | 'resend_setup' | 'vendor_approval' | 'reminder'
  rendered: RenderedEmail
  actionUrl?: string | null
  idempotencyKey: string
  actorUserId?: string | null
  updateWelcomeSummary?: boolean
  metadata?: Record<string, unknown>
}

// Canonical post-login surfaces live on secure. Legacy hq. / client. hosts
// still route, but new account mail must not mint those URLs.
export const CLIENT_PORTAL_URL = portalUrl()
export const CLIENT_LOGIN_URL = portalLoginUrl()
export const HQ_LOGIN_URL = hqLoginUrl()

function eventKind(kind: AccountEmailKind, status: AccountEmailStatus): string {
  if (status === 'failed' || status === 'skipped') return 'account_email_failed'
  switch (kind) {
    case 'account_welcome': return 'account_welcome_sent'
    case 'setup_invite': return 'account_invite_sent'
    case 'portal_reminder': return 'portal_reminder_sent'
    case 'vendor_application_received': return 'vendor_application_email_sent'
    case 'vendor_approved': return 'vendor_approval_email_sent'
  }
}

async function insertDelivery(env: Env, input: TrackedSendInput): Promise<{ id: string; existing?: AccountEmailResult }> {
  const existing = await env.DB.prepare(
    `SELECT id, status, provider_id FROM account_email_deliveries WHERE idempotency_key = ?`,
  ).bind(input.idempotencyKey).first<{ id: string; status: AccountEmailStatus; provider_id: string | null }>()
  if (existing) {
    return { id: existing.id, existing: { deliveryId: existing.id, status: existing.status, providerId: existing.provider_id, duplicate: true } }
  }

  const id = uuid()
  await env.DB.prepare(
    `INSERT INTO account_email_deliveries
      (id, user_id, email, kind, creation_type, subject, action_url, idempotency_key, status, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)`,
  ).bind(
    id,
    input.userId,
    input.email.toLowerCase(),
    input.kind,
    input.creationType ?? null,
    input.rendered.subject,
    input.actionUrl ?? null,
    input.idempotencyKey,
    input.metadata ? JSON.stringify(input.metadata) : null,
  ).run()
  return { id }
}

async function updateWelcomeSummary(env: Env, userId: string, status: AccountEmailStatus, providerId: string | null): Promise<void> {
  await env.DB.prepare(
    `UPDATE users SET
       welcome_email_status = ?,
       welcome_email_provider_id = COALESCE(?, welcome_email_provider_id),
       welcome_email_sent_at = CASE WHEN ? IN ('sent','delivered','delayed') THEN COALESCE(welcome_email_sent_at, datetime('now')) ELSE welcome_email_sent_at END,
       welcome_email_last_event_at = datetime('now')
     WHERE id = ?`,
  ).bind(status, providerId, status, userId).run()
}

async function writeActivity(env: Env, input: TrackedSendInput, status: AccountEmailStatus, providerId: string | null, error?: string): Promise<void> {
  await activityInsert(env, {
    actorUserId: input.actorUserId ?? null,
    clientUserId: input.role === 'client' ? input.userId : null,
    kind: eventKind(input.kind, status),
    detail: {
      email: input.email,
      email_kind: input.kind,
      subject: input.rendered.subject,
      status,
      provider_id: providerId,
      error: error || undefined,
    },
  }).run()
}

export async function sendTrackedAccountEmail(env: Env, input: TrackedSendInput): Promise<AccountEmailResult> {
  const inserted = await insertDelivery(env, input)
  if (inserted.existing) return inserted.existing
  const deliveryId = inserted.id

  if (!env.RESEND_API_KEY) {
    const error = 'RESEND_API_KEY is not configured'
    await env.DB.prepare(
      `UPDATE account_email_deliveries SET status = 'skipped', last_error = ?, last_event_type = 'local.skipped', failed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    ).bind(error, deliveryId).run()
    if (input.updateWelcomeSummary) await updateWelcomeSummary(env, input.userId, 'skipped', null)
    await writeActivity(env, input, 'skipped', null, error)
    return { deliveryId, status: 'skipped', providerId: null, error }
  }

  try {
    const providerId = await sendEmailStrict(env, {
      to: input.email,
      subject: input.rendered.subject,
      html: input.rendered.html,
      text: input.rendered.text,
      replyTo: 'orders@pinnaclemanagementventures.com',
      idempotencyKey: input.idempotencyKey,
      tags: [
        { name: 'category', value: input.kind },
        { name: 'user_id', value: input.userId },
      ],
    })
    await env.DB.prepare(
      `UPDATE account_email_deliveries SET provider_id = ?, status = 'sent', last_event_type = 'local.sent', sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    ).bind(providerId, deliveryId).run()
    if (input.updateWelcomeSummary) await updateWelcomeSummary(env, input.userId, 'sent', providerId)
    await writeActivity(env, input, 'sent', providerId)
    return { deliveryId, status: 'sent', providerId }
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 1000) : 'Email delivery failed'
    await env.DB.prepare(
      `UPDATE account_email_deliveries SET status = 'failed', last_error = ?, last_event_type = 'local.failed', failed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    ).bind(error, deliveryId).run()
    if (input.updateWelcomeSummary) await updateWelcomeSummary(env, input.userId, 'failed', null)
    await writeActivity(env, input, 'failed', null, error)
    return { deliveryId, status: 'failed', providerId: null, error }
  }
}

export async function sendAccountWelcome(env: Env, input: {
  userId: string
  role: AccountRole
  email: string
  firstName?: string | null
  businessName?: string | null
  creationType: AccountCreationType
  actionLabel: string
  actionUrl: string
  actorUserId?: string | null
  idempotencyKey?: string
}): Promise<AccountEmailResult> {
  const kind: AccountEmailKind = input.creationType === 'self_signup' ? 'account_welcome' : 'setup_invite'
  const fallback = renderAccountWelcome({
    firstName: input.firstName,
    email: input.email,
    role: input.role,
    creationType: input.creationType,
    actionLabel: input.actionLabel,
    actionUrl: input.actionUrl,
    businessName: input.businessName,
  })
  const setupNote = input.role === 'client' && input.creationType !== 'self_signup'
    ? 'Your secure setup link can be used once and expires in 24 hours. If it expires, contact Pinnacle and we can issue a new one.'
    : ''
  const rendered = await renderHqEmailOrFallback(env, input.role === 'client' ? 'account_welcome_client' : 'account_welcome_hq', {
    first_name: (input.firstName || '').trim().split(/\s+/)[0] || 'there',
    full_name: input.firstName || '',
    email: input.email,
    role_label: input.role === 'admin' ? 'administrator' : 'team member',
    action_label: input.actionLabel,
    action_url: input.actionUrl,
    setup_note: setupNote,
  }, fallback)
  return sendTrackedAccountEmail(env, {
    userId: input.userId,
    role: input.role,
    email: input.email,
    kind,
    creationType: input.creationType,
    rendered,
    actionUrl: input.actionUrl,
    idempotencyKey: input.idempotencyKey || `account-welcome/${input.userId}/${input.creationType}`,
    actorUserId: input.actorUserId,
    updateWelcomeSummary: true,
  })
}

export async function sendVendorApplicationReceived(env: Env, input: {
  userId: string
  email: string
  firstName?: string | null
}): Promise<AccountEmailResult> {
  const rendered = await renderHqEmailOrFallback(env, 'vendor_application_received', {
    first_name: (input.firstName || '').trim().split(/\s+/)[0] || 'there',
    email: input.email,
  }, renderVendorApplicationReceived({ firstName: input.firstName, email: input.email }))
  return sendTrackedAccountEmail(env, {
    userId: input.userId,
    role: 'staff',
    email: input.email,
    kind: 'vendor_application_received',
    creationType: 'self_signup',
    rendered,
    idempotencyKey: `vendor-application/${input.userId}`,
  })
}

export async function sendVendorApproved(env: Env, input: {
  userId: string
  email: string
  firstName?: string | null
  actorUserId?: string | null
  idempotencyKey?: string
}): Promise<AccountEmailResult> {
  const rendered = await renderHqEmailOrFallback(env, 'vendor_approved', {
    first_name: (input.firstName || '').trim().split(/\s+/)[0] || 'there',
    action_url: HQ_LOGIN_URL,
    action_label: 'Open Pinnacle HQ',
  }, renderVendorApproved({ firstName: input.firstName, actionUrl: HQ_LOGIN_URL }))
  return sendTrackedAccountEmail(env, {
    userId: input.userId,
    role: 'staff',
    email: input.email,
    kind: 'vendor_approved',
    creationType: 'vendor_approval',
    rendered,
    actionUrl: HQ_LOGIN_URL,
    idempotencyKey: input.idempotencyKey || `vendor-approved/${input.userId}`,
    actorUserId: input.actorUserId,
    updateWelcomeSummary: true,
  })
}

export async function sendPortalReminder(env: Env, input: {
  userId: string
  role: AccountRole
  email: string
  firstName?: string | null
  actorUserId?: string | null
  idempotencyKey: string
}): Promise<AccountEmailResult> {
  const actionUrl = input.role === 'client' ? CLIENT_LOGIN_URL : HQ_LOGIN_URL
  const rendered = await renderHqEmailOrFallback(env, 'portal_reminder', {
    first_name: (input.firstName || '').trim().split(/\s+/)[0] || 'there',
    workspace_label: input.role === 'client' ? 'your secure Client Portal' : 'Pinnacle HQ',
    action_label: input.role === 'client' ? 'Open My Client Portal' : 'Open Pinnacle HQ',
    action_url: actionUrl,
  }, renderPortalReminder({ firstName: input.firstName, role: input.role, actionUrl }))
  return sendTrackedAccountEmail(env, {
    userId: input.userId,
    role: input.role,
    email: input.email,
    kind: 'portal_reminder',
    creationType: 'reminder',
    rendered,
    actionUrl,
    idempotencyKey: input.idempotencyKey,
    actorUserId: input.actorUserId,
  })
}
