import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { uuid } from '../crypto'
import { adapterFor, verifyWebhookSignature } from '../ron/adapter'
import { appendEnvelopeEventFromContext } from '../envelopeEvents'

export const ronRoutes = new Hono<AppEnv>()

function now(): string {
  return new Date().toISOString()
}

async function providerRow(c: any, code: string): Promise<any | null> {
  const row = await c.env.DB.prepare('SELECT * FROM ron_providers WHERE code=?').bind(code).first()
  return row || null
}

// Sandbox simulator: signs a deterministic webhook body with the sandbox
// secret so contract tests and staged demos can exercise the full pipeline.
ronRoutes.post('/ron/sandbox/simulate/:remoteTransactionId', async (c) => {
  const remoteTransactionId = c.req.param('remoteTransactionId')
  const provider = await providerRow(c, 'sandbox')
  if (!provider) return c.json({ error: 'sandbox provider not provisioned' }, 404)
  const body = JSON.stringify({
    event_id: uuid(),
    event_type: 'ron.completed',
    remote_transaction_id: remoteTransactionId,
    status: 'completed',
    journal_entries: [
      { kind: 'identity_verified', method: 'kba', note: 'sandbox simulation' },
      { kind: 'notarization_completed', note: 'sandbox simulation' },
    ],
    fee_amount_cents: 0,
    currency: 'USD',
  })
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('sandbox-webhook-secret') as unknown as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body) as unknown as BufferSource))
  const hex = [...sig].map((b) => b.toString(16).padStart(2, '0')).join('')
  return c.json({ simulated: true, body: JSON.parse(body), signature: hex })
})

// Provider health + portability status (spec §63): lists registered providers,
// their activation state, and outstanding transactions per provider so ops can
// reroute to the second provider when one degrades.
ronRoutes.get('/health/ron', async (c) => {
  const providers = await c.env.DB.prepare(`SELECT id,name,code,status,capabilities_json,created_at,updated_at FROM ron_providers ORDER BY created_at`).all() as any
  const counts = await c.env.DB.prepare(`SELECT provider_id,status,COUNT(*) n FROM ron_remote_transactions WHERE status NOT IN ('completed','failed','cancelled') GROUP BY provider_id,status`).all() as any
  const countMap = new Map<string, number>()
  for (const row of counts.results || []) countMap.set(`${row.provider_id}:${row.status}`, row.n)
  return c.json({
    ok: true,
    providers: (providers.results || []).map((p: any) => ({
      name: p.name,
      code: p.code,
      status: p.status,
      active: p.status === 'active',
      capabilities: JSON.parse(p.capabilities_json || '[]'),
      open_transactions: countMap.get(`${p.id}:pending`) || countMap.get(`${p.id}:in_progress`) || 0,
    })),
  })
})

// Signed webhook inbox (spec §38-§41): HMAC + replay window + idempotency.
ronRoutes.post('/webhooks/ron/:providerCode', async (c) => {
  const providerCode = c.req.param('providerCode')
  const provider = await providerRow(c, providerCode)
  if (!provider) return c.json({ error: 'unknown provider' }, 404)
  if (provider.status !== 'active') return c.json({ error: 'provider inactive' }, 403)

  const rawBody = await c.req.text()
  const signature = c.req.header('x-signature') || c.req.header('x-ron-signature') || null
  const timestamp = c.req.header('x-timestamp') || null
  const adapter = adapterFor(provider.code, provider.base_url, provider.api_key_encrypted)

  const verified = await verifyWebhookSignature(provider.webhook_secret_encrypted || 'sandbox-webhook-secret', rawBody, signature, timestamp)
  const payload = adapter.parseWebhookPayload(rawBody)
  const normalized = adapter.normalizeWebhook(payload)

  const eventId = uuid()
  const providerEventId = normalized.providerEventId || null
  if (providerEventId) {
    const existing = await c.env.DB.prepare('SELECT id FROM ron_webhook_events WHERE provider_id=? AND provider_event_id=?').bind(provider.id, providerEventId).first<any>()
    if (existing) return c.json({ ok: true, duplicate: true })
  }

  const handled = verified.ok && Boolean(normalized.remoteTransactionId)
  await c.env.DB.prepare(`INSERT INTO ron_webhook_events (id,provider_id,provider_event_id,event_type,received_at,signature_verified,payload_json,handled,processed_at,error) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(eventId, provider.id, providerEventId, normalized.eventType, now(), verified.ok ? 1 : 0, rawBody.slice(0, 100000), handled ? 1 : 0, handled ? now() : null, verified.ok ? null : verified.reason || null).run()

  if (!verified.ok) return c.json({ error: 'signature verification failed', reason: verified.reason }, 401)
  if (!normalized.remoteTransactionId) return c.json({ error: 'missing remote transaction id' }, 400)

  const tx = await c.env.DB.prepare('SELECT * FROM ron_remote_transactions WHERE provider_id=? AND remote_transaction_id=?').bind(provider.id, normalized.remoteTransactionId).first<any>()
  if (!tx) {
    await c.env.DB.prepare(`UPDATE ron_webhook_events SET handled=0,error=? WHERE id=?`).bind('unknown transaction', eventId).run()
    return c.json({ error: 'unknown transaction' }, 404)
  }

  await c.env.DB.prepare(`UPDATE ron_remote_transactions SET status=?,signer_journal_entries_json=?,completed_at=CASE WHEN ?='completed' THEN ? ELSE completed_at END,updated_at=? WHERE id=?`)
    .bind(normalized.status || tx.status, JSON.stringify(normalized.signerJournalEntries), normalized.status, now(), now(), tx.id).run()

  if (tx.envelope_id && normalized.status === 'completed') {
    await appendEnvelopeEventFromContext(c, {
      envelopeId: tx.envelope_id,
      eventType: 'ron.remote_notarization_completed',
      actorType: 'system',
      actorId: null,
      recipientId: null,
      metadata: {
        provider: provider.code,
        remote_transaction_id: tx.remote_transaction_id,
        journal_entry_count: normalized.signerJournalEntries.length,
      },
    }).catch(() => undefined)
  }
  return c.json({ ok: true, event_id: eventId })
})