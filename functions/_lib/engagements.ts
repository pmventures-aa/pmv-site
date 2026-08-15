import type { Env } from './types'
import { uuid } from './crypto'
import { activityInsert } from './activity'

export interface PartyRef {
  clientUserId: string | null
  inquiryId: string | null
  role: string | null
}

export async function resolvePartyByEmail(env: Env, email: string | null | undefined): Promise<PartyRef> {
  const addr = String(email || '').trim().toLowerCase()
  if (!addr || !addr.includes('@')) return { clientUserId: null, inquiryId: null, role: null }
  const [user, inquiry] = await Promise.all([
    env.DB.prepare(
      `SELECT id, role FROM users WHERE lower(email) = ? LIMIT 1`,
    ).bind(addr).first<{ id: string; role: string }>(),
    env.DB.prepare(
      `SELECT id FROM contact_inquiries WHERE lower(email) = ? AND archived_at IS NULL ORDER BY datetime(created_at) DESC LIMIT 1`,
    ).bind(addr).first<{ id: string }>(),
  ])
  return {
    clientUserId: user?.role === 'client' ? user.id : null,
    inquiryId: inquiry?.id ?? null,
    role: user?.role ?? null,
  }
}

export async function mergeParty(
  env: Env,
  known: { clientUserId?: string | null; inquiryId?: string | null },
  emails: Array<string | null | undefined>,
): Promise<PartyRef> {
  let clientUserId = known.clientUserId || null
  let inquiryId = known.inquiryId || null
  if (clientUserId && inquiryId) return { clientUserId, inquiryId, role: 'client' }
  for (const email of emails) {
    const party = await resolvePartyByEmail(env, email)
    if (!clientUserId) clientUserId = party.clientUserId
    if (!inquiryId) inquiryId = party.inquiryId
    if (clientUserId && inquiryId) return { clientUserId, inquiryId, role: party.role }
  }
  return { clientUserId, inquiryId, role: clientUserId ? 'client' : null }
}

export function emailLogInsert(
  env: Env,
  opts: {
    actorUserId: string | null
    clientUserId?: string | null
    inquiryId?: string | null
    toAddress: string
    subject: string
    body: string
    providerMessageId?: string | null
  },
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO email_log (id, inquiry_id, client_user_id, sent_by_user_id, to_address, subject, body, provider_message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    uuid(),
    opts.inquiryId ?? null,
    opts.clientUserId ?? null,
    opts.actorUserId,
    opts.toAddress,
    opts.subject,
    opts.body,
    opts.providerMessageId ?? null,
  )
}

export async function recordOutboundEmailEngagement(
  env: Env,
  opts: {
    actorUserId: string
    toEmail: string
    subject: string
    bodyHtml: string
    clientUserId?: string | null
    inquiryId?: string | null
    providerMessageId?: string | null
    kind?: 'email.sent' | 'comms_message_sent'
    detail?: Record<string, unknown>
  },
): Promise<PartyRef> {
  const party = await mergeParty(env, { clientUserId: opts.clientUserId, inquiryId: opts.inquiryId }, [opts.toEmail])
  if (!party.clientUserId && !party.inquiryId) return party
  const kind = opts.kind || 'email.sent'
  const stmts: D1PreparedStatement[] = [
    emailLogInsert(env, {
      actorUserId: opts.actorUserId,
      clientUserId: party.clientUserId,
      inquiryId: party.inquiryId,
      toAddress: opts.toEmail,
      subject: opts.subject,
      body: opts.bodyHtml,
      providerMessageId: opts.providerMessageId,
    }),
    activityInsert(env, {
      actorUserId: opts.actorUserId,
      clientUserId: party.clientUserId,
      inquiryId: party.inquiryId,
      kind,
      detail: { subject: opts.subject, to: opts.toEmail, ...(opts.detail || {}) },
    }),
  ]
  if (party.inquiryId) {
    stmts.push(
      env.DB.prepare(
        `UPDATE contact_inquiries SET last_contacted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      ).bind(party.inquiryId),
    )
  }
  await env.DB.batch(stmts)
  return party
}
