import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppEnv } from '../types'
import { verifyResendWebhookSignature } from '../resendWebhookVerify'
import { listResendWebhookSecrets } from '../resendWebhookSetup'
import { uuid } from '../crypto'
import { fetchReceivedEmail, ingestReceivedEmail, parseMailbox, parseMailboxList, type ReceivedEmail } from '../resendInbound'

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

async function verifiedResendPayload(c: Context<AppEnv>) {
  const secrets = await listResendWebhookSecrets(c.env)
  if (!secrets.length) return { error: 'webhook not configured' as const, status: 503 as const }
  const payload = await c.req.raw.text()
  const id = c.req.header('svix-id') || null
  const timestamp = c.req.header('svix-timestamp') || null
  const signature = c.req.header('svix-signature') || null
  for (const secret of secrets) {
    const ok = await verifyResendWebhookSignature({ secret, payload, id, timestamp, signature })
    if (ok) return { payload }
  }
  return { error: 'invalid webhook signature' as const, status: 400 as const }
}

function eventError(event: ResendEvent): string | null {
  const failedReason = event.data?.failed?.reason
  if (typeof failedReason === 'string') return failedReason.slice(0, 1000)
  const bounceMessage = event.data?.bounce?.message
  if (typeof bounceMessage === 'string') return bounceMessage.slice(0, 1000)
  return null
}

resendWebhookRoutes.post('/webhooks/resend', async (c) => {
  const verified = await verifiedResendPayload(c)
  if ('error' in verified) return c.json({ error: verified.error }, verified.status)
  const { payload } = verified
  const svixId = c.req.header('svix-id') || null

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

  if (eventType === 'email.received') {
    if (!providerId) return c.json({ ok: true, ignored: true })
    try {
      const received = await fetchReceivedEmail(c.env, providerId)
      const result = await ingestReceivedEmail(c.env, received, c.executionCtx)
      return c.json(result)
    } catch (err) {
      // Drop the svix row so Resend's retry can fetch the body again.
      await c.env.DB.prepare('DELETE FROM email_webhook_events WHERE svix_id = ?').bind(svixId).run()
      return c.json({ error: err instanceof Error ? err.message : 'could not ingest received email' }, 503)
    }
  }

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
    c.env.DB.prepare(
      `UPDATE access_invites SET
         email_status = ?,
         email_error = COALESCE(?, email_error),
         email_sent_at = CASE WHEN ? = 'sent' THEN COALESCE(email_sent_at, datetime('now')) ELSE email_sent_at END,
         email_delivered_at = CASE WHEN ? = 'delivered' THEN COALESCE(email_delivered_at, datetime('now')) ELSE email_delivered_at END,
         updated_at = datetime('now')
       WHERE email_provider_id = ?`,
    ).bind(mapped.status, error, mapped.status, mapped.status, providerId),
  ])

  return c.json({ ok: true })
})

resendWebhookRoutes.post('/webhooks/resend/inbound', async (c) => {
  const verified = await verifiedResendPayload(c)
  if ('error' in verified) return c.json({ error: verified.error }, verified.status)
  const { payload } = verified

  let event: any
  try { event = JSON.parse(payload) } catch { return c.json({ error: 'invalid payload' }, 400) }

  if (event?.type === 'email.received' && typeof event?.data?.email_id === 'string') {
    try {
      const received = await fetchReceivedEmail(c.env, event.data.email_id)
      return c.json(await ingestReceivedEmail(c.env, received, c.executionCtx))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'could not ingest received email' }, 503)
    }
  }

  const inbound: ReceivedEmail = event?.data || event
  const from = parseMailbox(inbound.from)
  if (!from.email && !inbound.html && !inbound.text) return c.json({ error: 'from required' }, 400)
  try {
    return c.json(await ingestReceivedEmail(c.env, {
      id: inbound.id || (typeof event?.data?.email_id === 'string' ? event.data.email_id : uuid()),
      from: from.name ? `${from.name} <${from.email}>` : from.email,
      to: parseMailboxList(inbound.to).map((row) => row.email),
      cc: parseMailboxList(inbound.cc).map((row) => row.email),
      subject: inbound.subject,
      html: inbound.html,
      text: inbound.text,
      headers: inbound.headers,
      message_id: inbound.message_id,
      received_for: inbound.received_for,
    }, c.executionCtx))
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'could not ingest received email' }, 400)
  }
})
