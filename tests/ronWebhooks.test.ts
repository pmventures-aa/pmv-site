import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { adapterFor, verifyWebhookSignature } from '../functions/_lib/ron/adapter'

const SANDBOX_SECRET = 'sandbox-webhook-secret'

async function signBody(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret) as unknown as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body) as unknown as BufferSource))
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('')
}

describe('RON adapter (sandbox)', () => {
  const adapter = adapterFor('sandbox')

  it('creates a deterministic remote transaction with a session URL', async () => {
    const result = await adapter.createTransaction({
      envelopeId: 'env-1',
      envelopePublicId: 'PMV-2026-ABCD',
      title: 'Remote Closing',
      signer: { name: 'Jane Smith', email: 'jane@example.com', phone_e164: '+15551234567' },
      identityMethods: ['kba', 'device_binding'],
      callbackUrl: 'https://www.pinnaclemanagementventures.com/api/webhooks/ron/sandbox',
    })
    expect(result.remoteTransactionId).toMatch(/^SBX-/)
    expect(result.remoteTransactionId).toContain('PMV-2026-ABCD')
    expect(result.sessionUrl).toContain('sandbox.pinnaclemanagementventures.com')
    expect(result.status).toBe('pending')
  })

  it('normalizes sandbox webhook payloads', () => {
    const payload = {
      event_id: 'evt-1',
      event_type: 'ron.completed',
      remote_transaction_id: 'SBX-XYZ',
      status: 'completed',
      journal_entries: [{ kind: 'notarization_completed' }],
      fee_amount_cents: 0,
      currency: 'USD',
    }
    const n = adapter.normalizeWebhook(payload)
    expect(n.providerEventId).toBe('evt-1')
    expect(n.remoteTransactionId).toBe('SBX-XYZ')
    expect(n.status).toBe('completed')
    expect(n.signerJournalEntries).toHaveLength(1)
  })

  it('rejects unsigned webhook bodies', async () => {
    const r = await verifyWebhookSignature(SANDBOX_SECRET, '{"a":1}', null, null)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/missing signature/)
  })

  it('rejects bodies outside the replay window', async () => {
    const body = '{"event_type":"ron.completed"}'
    const sig = await signBody(body, SANDBOX_SECRET)
    const oldTimestamp = Math.floor(Date.now() / 1000) - 4000
    const r = await verifyWebhookSignature(SANDBOX_SECRET, body, sig, String(oldTimestamp))
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/replay window/)
  })

  it('accepts a correctly signed body inside the replay window', async () => {
    const body = '{"event_type":"ron.completed"}'
    const sig = await signBody(body, SANDBOX_SECRET)
    const now = Math.floor(Date.now() / 1000)
    const r = await verifyWebhookSignature(SANDBOX_SECRET, body, sig, String(now))
    expect(r.ok).toBe(true)
  })

  it('rejects a tampered body', async () => {
    const body = '{"event_type":"ron.completed","tampered":true}'
    const sig = await signBody('{"event_type":"ron.completed"}', SANDBOX_SECRET)
    const r = await verifyWebhookSignature(SANDBOX_SECRET, body, sig, String(Math.floor(Date.now() / 1000)))
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/signature mismatch/)
  })

  it('rejects a body signed with the wrong secret', async () => {
    const body = '{"event_type":"ron.completed"}'
    const sig = await signBody(body, 'other-secret')
    const r = await verifyWebhookSignature(SANDBOX_SECRET, body, sig, String(Math.floor(Date.now() / 1000)))
    expect(r.ok).toBe(false)
  })

  it('the adapter and the route-level verifier agree on the sandbox secret', async () => {
    const body = '{"event_type":"ron.completed"}'
    const sig = await signBody(body, SANDBOX_SECRET)
    const direct = await verifyWebhookSignature(SANDBOX_SECRET, body, sig, null)
    const viaAdapter = await adapter.verifyWebhookSignature(body, sig, null)
    expect(direct.ok).toBe(true)
    expect(viaAdapter.ok).toBe(true)
  })

  it('real providers fail closed without credentials', async () => {
    const inert = adapterFor('oneNotary')
    await expect(inert.createTransaction({
      envelopeId: 'env-1',
      envelopePublicId: 'PMV-2026-ABCD',
      title: 'Remote Closing',
      signer: { name: 'Jane Smith', email: 'jane@example.com' },
      identityMethods: [],
      callbackUrl: 'https://example.com/cb',
    })).rejects.toThrow(/not provisioned/)
  })
})

describe('RON migration (0079)', () => {
  it('defines provider, transaction, webhook, and billing tables', () => {
    const sql = readFileSync(new URL('../migrations/0079_ron_provider_adapter.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ron_providers/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ron_remote_transactions/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ron_webhook_events/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ron_pricing/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ron_charges/)
    expect(sql).toMatch(/idx_ron_webhook_provider_event/)
    expect(sql).toMatch(/idx_ron_remote_transactions_provider_ref/)
  })
})