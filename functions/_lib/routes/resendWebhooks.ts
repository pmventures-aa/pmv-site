import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { verifyResendWebhookSignature } from '../resendWebhookVerify'

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
  ])

  return c.json({ ok: true })
})
