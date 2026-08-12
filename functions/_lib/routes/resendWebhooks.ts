import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { verifyResendWebhookSignature } from '../resendWebhookVerify'
import { uuid } from '../crypto'

export const resendWebhookRoutes = new Hono<AppEnv>()

type ResendEvent = {
  type?: string
  created_at?: string
  data?: {
    email_id?: string
    failed?: { reason?: string }
    bounce?: { message?: string; type?: string; subType?: string }
    [key: string]: unknown
  }
}

function deliveryStatus(eventType: string): { status: string; failure: boolean } | null {
  switch (eventType) {
    case 'email.sent': return { status: 'sent', failure: false }
    case 'email.delivered': return { status: 'delivered', failure: false }
    case 'email.delivery_delayed': return { status: 'delayed', failure: false }
    case 'email.bounced': return { status: 'bounced', failure: true }
    case 'email.failed': return { status: 'failed', failure: true }
    case 'email.complained': return { status: 'complained', failure: false }
    case 'email.suppressed': return { status: 'suppressed', failure: true }
    // Open + click keep the last delivery status intact but let the row's
    // opened_at / clicked_at columns advance. The status arg is passed through
    // COALESCE below so it never overwrites a real delivery state.
    case 'email.opened': return { status: 'delivered', failure: false }
    case 'email.clicked': return { status: 'delivered', failure: false }
    default: return null
  }
}

function eventError(event: ResendEvent): string | null {
  const failedReason = event.data?.failed?.reason
  if (typeof failedReason === 'string') return failedReason.slice(0, 1000)
  const bounceMessage = event.data?.bounce?.message
  if (typeof bounceMessage === 'string') return bounceMessage.slice(0, 1000)
  return null
}

resendWebhookRoutes.post('/webhooks/resend', async (c) => {
  if (!c.env.RESEND_WEBHOOK_SECRET) return c.json({ error: 'webhook not configured' }, 503)

  const payload = await c.req.raw.text()
  const svixId = c.req.header('svix-id') || null
  const svixTimestamp = c.req.header('svix-timestamp') || null
  const svixSignature = c.req.header('svix-signature') || null
  const verified = await verifyResendWebhookSignature({
    secret: c.env.RESEND_WEBHOOK_SECRET,
    payload,
    id: svixId,
    timestamp: svixTimestamp,
    signature: svixSignature,
  })
  if (!verified) return c.json({ error: 'invalid webhook signature' }, 400)

  let event: ResendEvent
  try {
    event = JSON.parse(payload) as ResendEvent
  } catch {
    return c.json({ error: 'invalid payload' }, 400)
  }

  const eventType = typeof event.type === 'string' ? event.type : 'unknown'
  const providerId = typeof event.data?.email_id === 'string' ? event.data.email_id : null

  const dedupe = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO email_webhook_events (svix_id, event_type, provider_id) VALUES (?, ?, ?)`,
  ).bind(svixId, eventType, providerId).run()
  if ((dedupe.meta?.changes ?? 0) === 0) return c.json({ ok: true, duplicate: true })

  const mapped = deliveryStatus(eventType)
  if (!providerId || !mapped) return c.json({ ok: true, ignored: true })

  const error = eventError(event)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE account_email_deliveries SET
         status = ?,
         last_event_type = ?,
         last_error = COALESCE(?, last_error),
         sent_at = CASE WHEN ? = 'sent' THEN COALESCE(sent_at, datetime('now')) ELSE sent_at END,
         delivered_at = CASE WHEN ? = 'delivered' THEN COALESCE(delivered_at, datetime('now')) ELSE delivered_at END,
         failed_at = CASE WHEN ? = 1 THEN COALESCE(failed_at, datetime('now')) ELSE failed_at END,
         updated_at = datetime('now')
       WHERE provider_id = ?`,
    ).bind(mapped.status, eventType, error, mapped.status, mapped.status, mapped.failure ? 1 : 0, providerId),
    c.env.DB.prepare(
      `UPDATE users SET welcome_email_status = ?, welcome_email_last_event_at = datetime('now') WHERE welcome_email_provider_id = ?`,
    ).bind(mapped.status, providerId),
    c.env.DB.prepare(
      `UPDATE comms_recipients SET
         status = ?,
         error = COALESCE(?, error)
       WHERE provider_message_id = ?`,
    ).bind(mapped.status, error, providerId),
    // Email threading path (PR B): mirror delivery status onto the
    // per-thread outbound message row. opened/bounced timestamps are set
    // on the specific status transition so the Hub can surface them.
    c.env.DB.prepare(
      `UPDATE email_messages SET
         provider_status = ?,
         error = COALESCE(?, error),
         bounced_at = CASE WHEN ? = 1 THEN COALESCE(bounced_at, datetime('now')) ELSE bounced_at END,
         opened_at = CASE WHEN ? = 'email.opened' THEN COALESCE(opened_at, datetime('now')) ELSE opened_at END,
         clicked_at = CASE WHEN ? = 'email.clicked' THEN COALESCE(clicked_at, datetime('now')) ELSE clicked_at END
       WHERE provider_id = ?`,
    ).bind(mapped.status, error, mapped.failure ? 1 : 0, eventType, eventType, providerId),
  ])

  return c.json({ ok: true })
})

// Resend Inbound Webhooks: parsed inbound email delivered as JSON.
// Threads by walking In-Reply-To → References → subject match. When no
// match is found, a NEW conversation + email_thread pair is created so
// truly-new inbound never gets lost.
type InboundHeaders = { name: string; value: string }[]
type InboundPayload = {
  from?: { email?: string; name?: string } | string
  to?: Array<{ email?: string; name?: string } | string>
  cc?: Array<{ email?: string; name?: string } | string>
  subject?: string
  html?: string
  text?: string
  headers?: InboundHeaders | Record<string, string>
  message_id?: string
  in_reply_to?: string
  references?: string
}

function headerValue(headers: InboundPayload['headers'] | undefined, name: string): string | null {
  if (!headers) return null
  if (Array.isArray(headers)) {
    const row = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
    return row?.value ?? null
  }
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? String(headers[key]) : null
}

function parseAddress(input: InboundPayload['from']): { email: string; name?: string } | null {
  if (!input) return null
  if (typeof input === 'string') {
    const m = input.match(/^(.*)\s*<\s*([^>]+)\s*>\s*$/)
    if (m) return { email: m[2].trim().toLowerCase(), name: m[1].trim().replace(/^"|"$/g, '') || undefined }
    return { email: input.trim().toLowerCase() }
  }
  if (!input.email) return null
  return { email: String(input.email).trim().toLowerCase(), name: input.name || undefined }
}

function parseAddressList(input: InboundPayload['to']): Array<{ email: string; name?: string }> {
  if (!input) return []
  return input.map((v) => parseAddress(v as any)).filter((v): v is { email: string; name?: string } => !!v)
}

resendWebhookRoutes.post('/webhooks/resend/inbound', async (c) => {
  // Resend signs inbound with the same Svix header set as outbound events.
  if (!c.env.RESEND_WEBHOOK_SECRET) return c.json({ error: 'webhook not configured' }, 503)
  const payload = await c.req.raw.text()
  const verified = await verifyResendWebhookSignature({
    secret: c.env.RESEND_WEBHOOK_SECRET, payload,
    id: c.req.header('svix-id') || null,
    timestamp: c.req.header('svix-timestamp') || null,
    signature: c.req.header('svix-signature') || null,
  })
  if (!verified) return c.json({ error: 'invalid webhook signature' }, 400)

  let event: any
  try { event = JSON.parse(payload) } catch { return c.json({ error: 'invalid payload' }, 400) }
  const inbound: InboundPayload = event?.data || event
  const from = parseAddress(inbound.from)
  if (!from) return c.json({ error: 'from required' }, 400)
  const to = parseAddressList(inbound.to)
  const cc = parseAddressList(inbound.cc)
  const subject = (inbound.subject || '').trim().slice(0, 300) || '(no subject)'
  const html = typeof inbound.html === 'string' ? inbound.html.slice(0, 200_000) : null
  const text = typeof inbound.text === 'string' ? inbound.text.slice(0, 200_000) : null
  const externalMessageId = (inbound.message_id || headerValue(inbound.headers, 'Message-ID') || '').trim() || null
  const inReplyTo = (inbound.in_reply_to || headerValue(inbound.headers, 'In-Reply-To') || '').trim() || null
  const references = (inbound.references || headerValue(inbound.headers, 'References') || '').trim() || null

  // Dedupe by external Message-ID.
  if (externalMessageId) {
    const exists = await c.env.DB.prepare(`SELECT 1 FROM email_messages WHERE external_message_id = ? LIMIT 1`).bind(externalMessageId).first()
    if (exists) return c.json({ ok: true, duplicate: true })
  }

  // Threading: try In-Reply-To -> References tokens -> subject match.
  let threadId: string | null = null
  if (inReplyTo) {
    const row = await c.env.DB.prepare(`SELECT email_thread_id FROM email_messages WHERE external_message_id = ? LIMIT 1`).bind(inReplyTo).first() as any
    if (row?.email_thread_id) threadId = row.email_thread_id
  }
  if (!threadId && references) {
    const tokens = references.split(/\s+/).filter(Boolean).slice(-10)
    if (tokens.length) {
      const placeholders = tokens.map(() => '?').join(',')
      const row = await c.env.DB.prepare(`SELECT email_thread_id FROM email_messages WHERE external_message_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 1`).bind(...tokens).first() as any
      if (row?.email_thread_id) threadId = row.email_thread_id
    }
  }
  if (!threadId) {
    // No thread match - open a fresh one attached to a new conversation.
    // Try to match the sender to a known client user so scope is right.
    const known = await c.env.DB.prepare(`SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1`).bind(from.email).first() as any
    const scopeClientId = known?.id || null
    const conversationId = uuid()
    threadId = uuid()
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO conversations (id, kind, subject, scope_client_user_id, created_by_user_id, last_message_at)
         VALUES (?, 'email_thread', ?, ?, ?, datetime('now'))`
      ).bind(conversationId, subject, scopeClientId, scopeClientId || null),
      c.env.DB.prepare(
        `INSERT INTO email_threads (id, conversation_id, subject, root_external_message_id, scope_client_user_id, created_by_user_id, last_activity_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(threadId, conversationId, subject, externalMessageId, scopeClientId, scopeClientId || null),
    ])
  }

  const messageId = uuid()
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO email_messages (id, email_thread_id, direction, from_email, from_name, to_json, cc_json,
         subject, body_html, body_text, external_message_id, in_reply_to_external, references_external, provider_status)
       VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received')`
    ).bind(messageId, threadId, from.email, from.name || null,
      JSON.stringify(to), JSON.stringify(cc), subject, html, text,
      externalMessageId, inReplyTo, references),
    c.env.DB.prepare(`UPDATE email_threads SET last_activity_at = datetime('now') WHERE id = ?`).bind(threadId),
    c.env.DB.prepare(`UPDATE conversations SET last_message_at = datetime('now') WHERE id = (SELECT conversation_id FROM email_threads WHERE id = ?)`).bind(threadId),
  ])

  return c.json({ ok: true, id: messageId, thread_id: threadId })
})
