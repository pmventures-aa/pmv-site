import { Hono } from 'hono'
import type { AppEnv, Env, SessionUser } from '../types'
import { requireStaff } from '../mid'
import { canAccessClient, visibleClientIds } from '../access'
import { uuid } from '../crypto'
import { sendEmailStrict } from '../email'
import { sendingFrom, threadReplyAddress, formattedReplyTo } from '../resendInbound'
import { applySelectedSignature } from '../emailSignatures'
import { recordOutboundEmailEngagement, mergeParty } from '../engagements'
import { sanitizeHtml } from '../htmlSanitize'

export const emailThreadRoutes = new Hono<AppEnv>()
emailThreadRoutes.use('*', requireStaff)

async function assertThreadAccess(env: Env, user: SessionUser, scopeClientUserId: string | null) {
  // Unscoped threads are shared HQ mailbox traffic; client-scoped threads follow assignment rules.
  if (!scopeClientUserId) return true
  return canAccessClient(env, user, scopeClientUserId)
}

const clean = (v: unknown, n: number) => typeof v === 'string' ? v.trim().slice(0, n) : ''
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

function parseAddresses(input: unknown): { email: string; name?: string }[] {
  if (!input) return []
  const list = Array.isArray(input) ? input : String(input).split(/[,;]/)
  const out: { email: string; name?: string }[] = []
  for (const raw of list) {
    if (typeof raw === 'object' && raw && 'email' in raw) {
      const e = String((raw as any).email).trim().toLowerCase()
      if (emailOk(e)) out.push({ email: e, name: (raw as any).name })
    } else {
      const s = String(raw).trim()
      const m = s.match(/^(.*)\s*<\s*([^>]+)\s*>\s*$/)
      const email = (m ? m[2] : s).trim().toLowerCase()
      const name = m ? m[1].trim().replace(/^"|"$/g, '') : undefined
      if (emailOk(email)) out.push({ email, name: name || undefined })
    }
  }
  return out.slice(0, 30)
}

function formatAddresses(list: { email: string; name?: string }[]): string[] {
  return list.map((a) => a.name ? `${a.name} <${a.email}>` : a.email)
}

function generateMessageId(env: Env): string {
  const host = sendingFrom(env).email.split('@')[1] || 'pinnaclemanagementventures.com'
  return `<${uuid()}@${host}>`
}

const UNREAD_SQL = `EXISTS (
  SELECT 1 FROM email_messages em
  WHERE em.email_thread_id = et.id AND em.direction = 'inbound'
    AND em.created_at > COALESCE(
      (SELECT r.last_read_at FROM email_thread_reads r WHERE r.user_id = ? AND r.email_thread_id = et.id),
      '1970-01-01'
    )
)`

emailThreadRoutes.get('/email-threads/unread-count', async (c) => {
  const user = c.get('user')
  const visible = await visibleClientIds(c.env, user)
  const scopeSql = visible === null
    ? ''
    : visible.length
      ? `AND (et.scope_client_user_id IS NULL OR et.scope_client_user_id IN (${visible.map(() => '?').join(',')}))`
      : `AND (et.scope_client_user_id IS NULL OR et.created_by_user_id = ?)`
  const params = visible === null ? [user.id] : visible.length ? [user.id, ...visible] : [user.id, user.id]
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM email_threads et WHERE ${UNREAD_SQL} ${scopeSql}`,
  ).bind(...params).first<{ n: number }>()
  return c.json({ count: Number(row?.n || 0) })
})

emailThreadRoutes.get('/email-threads', async (c) => {
  const user = c.get('user')
  const visible = await visibleClientIds(c.env, user)
  const scopeSql = visible === null
    ? ''
    : visible.length
      ? `AND (et.scope_client_user_id IS NULL OR et.scope_client_user_id IN (${visible.map(() => '?').join(',')}))`
      : `AND (et.scope_client_user_id IS NULL OR et.created_by_user_id = ?)`
  const params = visible === null ? [user.id] : visible.length ? [user.id, ...visible] : [user.id, user.id]
  const rows = await c.env.DB.prepare(
    `SELECT et.id, et.subject, et.scope_client_user_id, et.last_activity_at, et.created_at,
            et.conversation_id,
            (SELECT COUNT(*) FROM email_messages em WHERE em.email_thread_id = et.id) message_count,
            (SELECT full_name FROM users WHERE id = et.scope_client_user_id) client_name,
            (SELECT email FROM users WHERE id = et.scope_client_user_id) client_email,
            (SELECT COALESCE(from_name, from_email) FROM email_messages WHERE email_thread_id = et.id ORDER BY created_at DESC LIMIT 1) last_from,
            (SELECT direction FROM email_messages WHERE email_thread_id = et.id ORDER BY created_at DESC LIMIT 1) last_direction,
            (SELECT provider_status FROM email_messages WHERE email_thread_id = et.id ORDER BY created_at DESC LIMIT 1) last_status,
            CASE WHEN ${UNREAD_SQL} THEN 1 ELSE 0 END AS unread
     FROM email_threads et
     WHERE 1=1 ${scopeSql}
     ORDER BY et.last_activity_at DESC LIMIT 200`
  ).bind(...params).all()
  return c.json({ threads: (rows.results as any[]) || [] })
})

emailThreadRoutes.get('/email-threads/:id', async (c) => {
  const user = c.get('user')
  const thread = await c.env.DB.prepare(
    `SELECT et.*, u.full_name AS client_name, u.email AS client_email
     FROM email_threads et
     LEFT JOIN users u ON u.id = et.scope_client_user_id
     WHERE et.id = ?`,
  ).bind(c.req.param('id')).first() as any
  if (!thread) return c.json({ error: 'not found' }, 404)
  if (!(await assertThreadAccess(c.env, user, thread.scope_client_user_id))) return c.json({ error: 'forbidden' }, 403)
  await c.env.DB.prepare(
    `INSERT INTO email_thread_reads (user_id, email_thread_id, last_read_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id, email_thread_id) DO UPDATE SET last_read_at = datetime('now')`,
  ).bind(user.id, thread.id).run().catch(() => {})
  const [messagesRes, attachmentsRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, direction, from_email, from_name, to_json, cc_json, subject, body_html, body_text,
              external_message_id, in_reply_to_external, provider_id, provider_status, opened_at,
              clicked_at, bounced_at, error, sender_user_id, created_at
       FROM email_messages WHERE email_thread_id = ? ORDER BY created_at ASC`
    ).bind(thread.id).all(),
    c.env.DB.prepare(
      `SELECT ea.id, ea.email_message_id, ea.file_name, ea.content_type, ea.size_bytes
       FROM email_attachments ea
       JOIN email_messages em ON em.id = ea.email_message_id
       WHERE em.email_thread_id = ?`
    ).bind(thread.id).all(),
  ])
  const messages = ((messagesRes.results as any[]) || []).map((m) => ({
    ...m,
    body_html: m.body_html ? sanitizeHtml(m.body_html) : m.body_html,
  }))
  return c.json({ thread, messages, attachments: (attachmentsRes.results as any[]) || [] })
})

// POST /admin/email-threads
// Body: { subject, to, cc?, bcc?, body_html, body_text?, scope_client_user_id?, conversation_id? }
emailThreadRoutes.post('/email-threads', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  if (!body) return c.json({ error: 'invalid body' }, 400)
  const subject = clean(body.subject, 300)
  if (!subject) return c.json({ error: 'subject required' }, 400)
  const to = parseAddresses(body.to)
  if (!to.length) return c.json({ error: 'to required' }, 400)
  const cc = parseAddresses(body.cc)
  const bcc = parseAddresses(body.bcc)
  const rawHtml = clean(body.body_html, 60_000)
  if (!rawHtml) return c.json({ error: 'body_html required' }, 400)
  const signed = await applySelectedSignature(c.env, user.id, rawHtml, clean(body.signature_id, 40) || null)
  const bodyHtml = signed.html
  const bodyText = clean(body.body_text, 60_000) || signed.text || undefined

  const knownInquiryId = clean(body.inquiry_id, 40) || null
  const requestedClientId = clean(body.scope_client_user_id, 40) || null
  if (requestedClientId && !(await canAccessClient(c.env, user, requestedClientId))) {
    return c.json({ error: 'forbidden' }, 403)
  }
  const party = await mergeParty(c.env, {
    clientUserId: requestedClientId,
    inquiryId: knownInquiryId,
  }, to.map((a) => a.email))
  const scopeClientId = party.clientUserId
  if (scopeClientId && !(await canAccessClient(c.env, user, scopeClientId))) {
    return c.json({ error: 'forbidden' }, 403)
  }
  let conversationId = clean(body.conversation_id, 40) || null

  // Create the parent conversation if none was passed. Every email thread
  // hangs off a conversation row so the Hub shows them uniformly.
  if (!conversationId) {
    conversationId = uuid()
    await c.env.DB.prepare(
      `INSERT INTO conversations (id, kind, subject, scope_client_user_id, created_by_user_id, last_message_at)
       VALUES (?, 'email_thread', ?, ?, ?, datetime('now'))`
    ).bind(conversationId, subject, scopeClientId, user.id).run()
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, role_in_conv) VALUES (?, ?, 'participant')`
    ).bind(conversationId, user.id).run()
  }

  const threadId = uuid()
  const messageId = uuid()
  const externalMessageId = generateMessageId(c.env)
  const from = sendingFrom(c.env)
  const inboundReplyTo = threadReplyAddress(c.env, threadId)

  await c.env.DB.prepare(
    `INSERT INTO email_threads (id, conversation_id, subject, root_external_message_id, scope_client_user_id, created_by_user_id, last_activity_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(threadId, conversationId, subject, externalMessageId, scopeClientId, user.id).run()

  // Insert the outbound record first as 'queued'; update after Resend returns.
  await c.env.DB.prepare(
    `INSERT INTO email_messages (id, email_thread_id, direction, from_email, from_name, to_json, cc_json, bcc_json, reply_to,
       subject, body_html, body_text, external_message_id, sender_user_id)
     VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(messageId, threadId, from.email, user.full_name || from.name,
    JSON.stringify(to), JSON.stringify(cc), JSON.stringify(bcc), inboundReplyTo,
    subject, bodyHtml, bodyText || null, externalMessageId, user.id).run()

  try {
    const providerId = await sendEmailStrict(c.env, {
      to: formatAddresses(to),
      cc: cc.length ? formatAddresses(cc) : undefined,
      bcc: bcc.length ? formatAddresses(bcc) : undefined,
      subject, html: bodyHtml, text: bodyText,
      replyTo: formattedReplyTo(inboundReplyTo),
      headers: { 'Message-ID': externalMessageId },
      tags: [{ name: 'email_thread_id', value: threadId }, { name: 'email_message_id', value: messageId }],
      idempotencyKey: messageId,
    })
    await c.env.DB.prepare(
      `UPDATE email_messages SET provider_id = ?, provider_status = 'sent' WHERE id = ?`
    ).bind(providerId, messageId).run()
  } catch (err) {
    await c.env.DB.prepare(
      `UPDATE email_messages SET provider_status = 'failed', error = ? WHERE id = ?`
    ).bind(err instanceof Error ? err.message.slice(0, 1000) : 'send failed', messageId).run()
    return c.json({ error: 'send failed', message: err instanceof Error ? err.message : 'unknown', thread_id: threadId, id: messageId }, 502)
  }

  try {
    await recordOutboundEmailEngagement(c.env, {
      actorUserId: user.id,
      toEmail: to[0].email,
      subject,
      bodyHtml,
      clientUserId: party.clientUserId,
      inquiryId: party.inquiryId,
      kind: 'email.sent',
      detail: { email_thread_id: threadId, to: to.map((a) => a.email), conversation_id: conversationId },
    })
  } catch {}

  return c.json({ ok: true, id: messageId, thread_id: threadId, conversation_id: conversationId }, 201)
})

// POST /admin/email-threads/:id/reply
// Body: { body_html, body_text?, cc?, bcc? }
emailThreadRoutes.post('/email-threads/:id/reply', async (c) => {
  const user = c.get('user')
  const thread = await c.env.DB.prepare(`SELECT * FROM email_threads WHERE id = ?`).bind(c.req.param('id')).first() as any
  if (!thread) return c.json({ error: 'not found' }, 404)
  if (!(await assertThreadAccess(c.env, user, thread.scope_client_user_id))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>().catch(() => null)
  const rawHtml = clean(body?.body_html, 60_000)
  if (!rawHtml) return c.json({ error: 'body_html required' }, 400)
  const signed = await applySelectedSignature(c.env, user.id, rawHtml, clean(body?.signature_id, 40) || null)
  const bodyHtml = signed.html
  const bodyText = clean(body?.body_text, 60_000) || signed.text || undefined
  const cc = parseAddresses(body?.cc)
  const bcc = parseAddresses(body?.bcc)

  // Last message in the thread is what we're replying to (from provider POV).
  const last = await c.env.DB.prepare(
    `SELECT external_message_id, in_reply_to_external, references_external, from_email
     FROM email_messages WHERE email_thread_id = ? ORDER BY created_at DESC LIMIT 1`
  ).bind(thread.id).first() as any
  const inReplyTo = last?.external_message_id || thread.root_external_message_id
  const referencesChain = [last?.references_external, last?.in_reply_to_external, last?.external_message_id]
    .filter(Boolean).join(' ').trim().slice(0, 2000) || undefined

  // Reply "to" defaults to the last inbound sender (if any) else the last outbound "to" list.
  let replyTo: { email: string; name?: string }[] = []
  const lastInbound = await c.env.DB.prepare(
    `SELECT from_email, from_name FROM email_messages WHERE email_thread_id = ? AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1`
  ).bind(thread.id).first() as any
  if (lastInbound?.from_email) replyTo = [{ email: lastInbound.from_email, name: lastInbound.from_name || undefined }]
  else {
    const firstOut = await c.env.DB.prepare(
      `SELECT to_json FROM email_messages WHERE email_thread_id = ? AND direction = 'outbound' ORDER BY created_at ASC LIMIT 1`
    ).bind(thread.id).first() as any
    if (firstOut?.to_json) { try { replyTo = JSON.parse(firstOut.to_json) } catch {} }
  }
  if (!replyTo.length) return c.json({ error: 'no reply target' }, 400)

  const messageId = uuid()
  const externalMessageId = generateMessageId(c.env)
  const replySubject = /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`
  const from = sendingFrom(c.env)
  const inboundReplyTo = threadReplyAddress(c.env, thread.id)

  await c.env.DB.prepare(
    `INSERT INTO email_messages (id, email_thread_id, direction, from_email, from_name, to_json, cc_json, bcc_json, reply_to,
       subject, body_html, body_text, external_message_id, in_reply_to_external, references_external, sender_user_id)
     VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(messageId, thread.id, from.email, user.full_name || from.name,
    JSON.stringify(replyTo), JSON.stringify(cc), JSON.stringify(bcc), inboundReplyTo,
    replySubject, bodyHtml, bodyText || null, externalMessageId, inReplyTo, referencesChain || null, user.id).run()

  try {
    const providerId = await sendEmailStrict(c.env, {
      to: formatAddresses(replyTo),
      cc: cc.length ? formatAddresses(cc) : undefined,
      bcc: bcc.length ? formatAddresses(bcc) : undefined,
      subject: replySubject, html: bodyHtml, text: bodyText,
      replyTo: formattedReplyTo(inboundReplyTo),
      headers: {
        'Message-ID': externalMessageId,
        ...(inReplyTo ? { 'In-Reply-To': inReplyTo } : {}),
        ...(referencesChain ? { References: referencesChain } : {}),
      },
      tags: [{ name: 'email_thread_id', value: thread.id }, { name: 'email_message_id', value: messageId }],
      idempotencyKey: messageId,
    })
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE email_messages SET provider_id = ?, provider_status = 'sent' WHERE id = ?`).bind(providerId, messageId),
      c.env.DB.prepare(`UPDATE email_threads SET last_activity_at = datetime('now') WHERE id = ?`).bind(thread.id),
      c.env.DB.prepare(`UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?`).bind(thread.conversation_id),
    ])
  } catch (err) {
    await c.env.DB.prepare(
      `UPDATE email_messages SET provider_status = 'failed', error = ? WHERE id = ?`
    ).bind(err instanceof Error ? err.message.slice(0, 1000) : 'send failed', messageId).run()
    return c.json({ error: 'send failed', message: err instanceof Error ? err.message : 'unknown' }, 502)
  }

  try {
    const party = await mergeParty(c.env, { clientUserId: thread.scope_client_user_id }, replyTo.map((a) => a.email))
    await recordOutboundEmailEngagement(c.env, {
      actorUserId: user.id,
      toEmail: replyTo[0].email,
      subject: replySubject,
      bodyHtml,
      clientUserId: party.clientUserId,
      inquiryId: party.inquiryId,
      kind: 'email.sent',
      detail: { email_thread_id: thread.id, to: replyTo.map((a) => a.email), reply: true },
    })
  } catch {}

  return c.json({ ok: true, id: messageId }, 201)
})
