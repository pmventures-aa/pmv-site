import type { Env } from './types'
import { uuid } from './crypto'
import { pushNotification } from './notificationFeed'
import { logActivity } from './activity'
import { mergeParty } from './engagements'
import { sanitizeHtml } from './htmlSanitize'

export const DEFAULT_INBOUND_DOMAIN = 'ziloifaluk.resend.app'
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024

export function inboundDomain(env: { RESEND_INBOUND_DOMAIN?: string }): string {
  const raw = (env.RESEND_INBOUND_DOMAIN || DEFAULT_INBOUND_DOMAIN).trim().toLowerCase().replace(/^@/, '')
  return raw || DEFAULT_INBOUND_DOMAIN
}

export function sendingFrom(env: { RESEND_FROM_EMAIL?: string }): { email: string; name: string | null; formatted: string } {
  const formatted = env.RESEND_FROM_EMAIL || 'Pinnacle Management Ventures <orders@pinnaclemanagementventures.com>'
  return { ...parseMailbox(formatted), formatted }
}

export function threadReplyAddress(env: { RESEND_INBOUND_DOMAIN?: string }, threadId: string): string {
  return `t-${compactUuid(threadId)}@${inboundDomain(env)}`
}

export function hqInboundAddress(env: { RESEND_INBOUND_DOMAIN?: string }): string {
  return `hq@${inboundDomain(env)}`
}

export function formattedReplyTo(address: string): string {
  return `Pinnacle Management Ventures <${address}>`
}

export function compactUuid(id: string): string {
  return id.replace(/-/g, '').toLowerCase()
}

export function expandCompactUuid(hex: string): string | null {
  const h = hex.replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(h)) return null
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function normalizeMessageId(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().replace(/^<|>$/g, '').toLowerCase()
  return trimmed || null
}

export function parseMailbox(input: string | { email?: string; name?: string } | null | undefined): { email: string; name: string | null } {
  if (!input) return { email: '', name: null }
  if (typeof input === 'object') {
    const email = String(input.email || '').trim().toLowerCase()
    const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : null
    return { email, name }
  }
  const raw = input.trim()
  const angled = raw.match(/^(.*)\s*<\s*([^>]+)\s*>\s*$/)
  if (angled) return { email: angled[2].trim().toLowerCase(), name: angled[1].trim().replace(/^"|"$/g, '') || null }
  return { email: raw.toLowerCase(), name: null }
}

export function parseMailboxList(input: unknown): { email: string; name: string | null }[] {
  if (!input) return []
  const list = Array.isArray(input) ? input : [input]
  return list.map((item) => parseMailbox(item as string)).filter((row) => row.email.includes('@'))
}

export function threadIdFromInboundAddress(email: string, domain: string): string | null {
  const mailbox = parseMailbox(email)
  const at = mailbox.email.lastIndexOf('@')
  if (at < 0) return null
  const local = mailbox.email.slice(0, at)
  const host = mailbox.email.slice(at + 1)
  if (host !== domain.toLowerCase()) return null
  const match = local.match(/^t-([0-9a-f-]{32,36})$/i)
  if (!match) return null
  return expandCompactUuid(match[1])
}

export function findThreadIdInRecipients(emails: string[], domain: string): string | null {
  for (const email of emails) {
    const id = threadIdFromInboundAddress(email, domain)
    if (id) return id
  }
  return null
}

function headerLookup(headers: Record<string, string> | Array<{ name: string; value: string }> | undefined, name: string): string | null {
  if (!headers) return null
  if (Array.isArray(headers)) {
    const row = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
    return row?.value ?? null
  }
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? String(headers[key]) : null
}

export type ReceivedEmail = {
  id: string
  from?: string
  to?: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  html?: string | null
  text?: string | null
  headers?: Record<string, string> | Array<{ name: string; value: string }>
  message_id?: string
  received_for?: string[]
  attachments?: Array<{ id?: string; filename?: string; content_type?: string; content_disposition?: string; content_id?: string; size?: number }>
}

export async function fetchReceivedEmail(env: Env, emailId: string): Promise<ReceivedEmail> {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured')
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
  })
  const payload = await res.json<ReceivedEmail & { message?: string }>().catch(() => ({} as ReceivedEmail & { message?: string }))
  if (!res.ok) throw new Error(payload.message || `Resend receiving fetch failed (${res.status})`)
  return { ...payload, id: payload.id || emailId }
}

export async function ingestReceivedEmail(
  env: Env,
  received: ReceivedEmail,
  executionCtx?: { waitUntil: (promise: Promise<unknown>) => void },
): Promise<{ ok: true; id: string; thread_id: string; duplicate?: boolean }> {
  const domain = inboundDomain(env)
  const headerFrom = headerLookup(received.headers, 'from')
  const from = parseMailbox(headerFrom || received.from)
  if (!from.email) throw new Error('from required')
  const to = parseMailboxList(received.to)
  const cc = parseMailboxList(received.cc)
  const receivedFor = parseMailboxList(received.received_for)
  const subject = (received.subject || headerLookup(received.headers, 'subject') || '(no subject)').trim().slice(0, 300)
  const html = typeof received.html === 'string' ? sanitizeHtml(received.html, 200_000) : null
  const text = typeof received.text === 'string' ? received.text.slice(0, 200_000) : null
  const externalMessageId = received.message_id || headerLookup(received.headers, 'message-id') || null
  const inReplyTo = headerLookup(received.headers, 'in-reply-to')
  const references = headerLookup(received.headers, 'references')
  const recipientEmails = [...to, ...cc, ...receivedFor].map((row) => row.email)

  if (received.id) {
    const byProvider = await env.DB.prepare(
      `SELECT id, email_thread_id FROM email_messages WHERE provider_id = ? AND direction = 'inbound' LIMIT 1`,
    ).bind(received.id).first<{ id: string; email_thread_id: string }>()
    if (byProvider) return { ok: true, id: byProvider.id, thread_id: byProvider.email_thread_id, duplicate: true }
  }
  if (externalMessageId) {
    const exists = await env.DB.prepare(
      `SELECT id, email_thread_id FROM email_messages WHERE external_message_id = ? LIMIT 1`,
    ).bind(externalMessageId).first<{ id: string; email_thread_id: string }>()
    if (exists) return { ok: true, id: exists.id, thread_id: exists.email_thread_id, duplicate: true }
  }

  let threadId = findThreadIdInRecipients(recipientEmails, domain)
  if (threadId) {
    const exists = await env.DB.prepare('SELECT id FROM email_threads WHERE id = ?').bind(threadId).first<{ id: string }>()
    if (!exists) threadId = null
  }

  const replyTokens = [inReplyTo, ...(references || '').split(/\s+/)].map((token) => normalizeMessageId(token)).filter((token): token is string => !!token)
  if (!threadId && replyTokens.length) {
    for (const token of replyTokens.slice(0, 12)) {
      const row = await env.DB.prepare(
        `SELECT email_thread_id FROM email_messages
         WHERE lower(replace(replace(external_message_id, '<', ''), '>', '')) = ? LIMIT 1`,
      ).bind(token).first<{ email_thread_id: string }>()
      if (row?.email_thread_id) { threadId = row.email_thread_id; break }
    }
  }

  if (!threadId) {
    const actor = await env.DB.prepare(
      `SELECT id FROM users WHERE role IN ('admin','staff') AND status = 'active' ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, created_at LIMIT 1`,
    ).first<{ id: string }>()
    const known = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = ? LIMIT 1').bind(from.email).first<{ id: string }>()
    const scopeClientId = known?.id || null
    const createdBy = actor?.id || known?.id
    if (!createdBy) throw new Error('no HQ user available to own the inbound thread')
    const conversationId = uuid()
    threadId = uuid()
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO conversations (id, kind, subject, scope_client_user_id, created_by_user_id, last_message_at)
         VALUES (?, 'email_thread', ?, ?, ?, datetime('now'))`,
      ).bind(conversationId, subject, scopeClientId, createdBy),
      env.DB.prepare(
        `INSERT INTO email_threads (id, conversation_id, subject, root_external_message_id, scope_client_user_id, created_by_user_id, last_activity_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      ).bind(threadId, conversationId, subject, externalMessageId, scopeClientId, createdBy),
    ])
  }

  const messageId = uuid()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO email_messages (id, email_thread_id, direction, from_email, from_name, to_json, cc_json,
         subject, body_html, body_text, external_message_id, in_reply_to_external, references_external, provider_id, provider_status)
       VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received')`,
    ).bind(
      messageId, threadId, from.email, from.name,
      JSON.stringify(to), JSON.stringify(cc), subject, html, text,
      externalMessageId, inReplyTo, references, received.id || null,
    ),
    env.DB.prepare(`UPDATE email_threads SET last_activity_at = datetime('now') WHERE id = ?`).bind(threadId),
    env.DB.prepare(`UPDATE conversations SET last_message_at = datetime('now') WHERE id = (SELECT conversation_id FROM email_threads WHERE id = ?)`).bind(threadId),
  ])

  const attachments = received.attachments || []
  if (attachments.length && env.UPLOADS && env.RESEND_API_KEY) {
    const work = storeInboundAttachments(env, received.id, messageId, attachments).catch((err) => {
      console.error('[resend-inbound] attachment store failed', err)
    })
    if (executionCtx) executionCtx.waitUntil(work)
    else await work
  }

  executionCtx?.waitUntil(notifyInbound(env, threadId, from, subject, text || html || ''))

  return { ok: true, id: messageId, thread_id: threadId }
}

async function storeInboundAttachments(
  env: Env,
  receivedEmailId: string,
  messageId: string,
  listed: NonNullable<ReceivedEmail['attachments']>,
) {
  if (!env.UPLOADS || !env.RESEND_API_KEY) return
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(receivedEmailId)}/attachments`, {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
  })
  const payload = await res.json<{ data?: Array<{ id: string; filename?: string; content_type?: string; content_id?: string; size?: number; download_url?: string }> }>().catch(() => ({ data: [] }))
  const files = payload.data?.length ? payload.data : listed.map((item) => ({ ...item, id: item.id || '', download_url: undefined }))
  for (const file of files.slice(0, 20)) {
    if (!file.download_url || (file.size && file.size > MAX_ATTACHMENT_BYTES)) continue
    const download = await fetch(file.download_url)
    if (!download.ok) continue
    const bytes = await download.arrayBuffer()
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) continue
    const safeName = (file.filename || 'attachment').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 160) || 'attachment'
    const key = `email-inbound/${messageId}/${file.id || uuid()}-${safeName}`
    await env.UPLOADS.put(key, bytes, { httpMetadata: { contentType: file.content_type || 'application/octet-stream' } })
    await env.DB.prepare(
      `INSERT INTO email_attachments (id, email_message_id, r2_key, file_name, content_type, size_bytes, content_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(uuid(), messageId, key, file.filename || safeName, file.content_type || 'application/octet-stream', bytes.byteLength, file.content_id || null).run()
  }
}

async function notifyInbound(env: Env, threadId: string, from: { email: string; name: string | null }, subject: string, preview: string) {
  const thread = await env.DB.prepare(
    `SELECT et.id, et.conversation_id, et.subject, et.scope_client_user_id FROM email_threads et WHERE et.id = ?`,
  ).bind(threadId).first<{ id: string; conversation_id: string; subject: string; scope_client_user_id: string | null }>()
  if (!thread) return
  const staff = await env.DB.prepare(
    `SELECT id FROM users WHERE status = 'active' AND role IN ('staff','admin')`,
  ).all<{ id: string }>()
  const link = `/messages?tab=email&thread=${thread.id}`
  const body = `${thread.subject}: ${preview.replace(/<[^>]+>/g, '').slice(0, 180)}`
  for (const row of staff.results || []) {
    await pushNotification(env, {
      userId: row.id, kind: 'email.inbound',
      subjectType: 'email_thread', subjectId: thread.id,
      title: `New reply from ${from.name || from.email}`,
      body, deepLinkPath: link, dedupeWindowSeconds: 90,
    })
  }
  try {
    const party = await mergeParty(env, { clientUserId: thread.scope_client_user_id }, [from.email])
    await logActivity(env, {
      actorUserId: null,
      clientUserId: party.clientUserId,
      inquiryId: party.inquiryId,
      kind: 'email.inbound',
      detail: { email_thread_id: thread.id, subject: thread.subject, from: from.email, from_name: from.name },
    })
  } catch {}
}
