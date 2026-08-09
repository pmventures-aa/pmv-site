import { describe, expect, it } from 'vitest'
import { verifyResendWebhookSignature } from '../functions/_lib/resendWebhookVerify'

function bytesToBase64(bytes: Uint8Array): string {
  let raw = ''
  for (const b of bytes) raw += String.fromCharCode(b)
  return btoa(raw)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function signature(secretBytes: Uint8Array, id: string, timestamp: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', toArrayBuffer(secretBytes), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const message = new TextEncoder().encode(`${id}.${timestamp}.${payload}`)
  const signed = await crypto.subtle.sign('HMAC', key, toArrayBuffer(message))
  return bytesToBase64(new Uint8Array(signed))
}

describe('Resend webhook signature verification', () => {
  it('accepts a current valid Svix v1 signature', async () => {
    const secretBytes = new TextEncoder().encode('pmv-test-webhook-secret-32-bytes!!')
    const secret = `whsec_${bytesToBase64(secretBytes)}`
    const id = 'msg_test_123'
    const timestamp = '1700000000'
    const payload = '{"type":"email.delivered","data":{"email_id":"em_123"}}'
    const sig = await signature(secretBytes, id, timestamp, payload)

    await expect(verifyResendWebhookSignature({
      secret,
      payload,
      id,
      timestamp,
      signature: `v1,${sig}`,
      nowMs: 1700000000 * 1000,
    })).resolves.toBe(true)
  })

  it('rejects modified payloads', async () => {
    const secretBytes = new TextEncoder().encode('pmv-test-webhook-secret-32-bytes!!')
    const secret = `whsec_${bytesToBase64(secretBytes)}`
    const id = 'msg_test_456'
    const timestamp = '1700000000'
    const payload = '{"type":"email.sent"}'
    const sig = await signature(secretBytes, id, timestamp, payload)

    await expect(verifyResendWebhookSignature({
      secret,
      payload: '{"type":"email.failed"}',
      id,
      timestamp,
      signature: `v1,${sig}`,
      nowMs: 1700000000 * 1000,
    })).resolves.toBe(false)
  })

  it('rejects replayed signatures outside the timestamp tolerance', async () => {
    const secretBytes = new TextEncoder().encode('pmv-test-webhook-secret-32-bytes!!')
    const secret = `whsec_${bytesToBase64(secretBytes)}`
    const id = 'msg_test_789'
    const timestamp = '1700000000'
    const payload = '{"type":"email.delivered"}'
    const sig = await signature(secretBytes, id, timestamp, payload)

    await expect(verifyResendWebhookSignature({
      secret,
      payload,
      id,
      timestamp,
      signature: `v1,${sig}`,
      nowMs: (1700000000 + 601) * 1000,
      toleranceSeconds: 300,
    })).resolves.toBe(false)
  })

  it('rejects missing signature headers', async () => {
    await expect(verifyResendWebhookSignature({
      secret: 'whsec_dGVzdA==',
      payload: '{}',
      id: null,
      timestamp: null,
      signature: null,
    })).resolves.toBe(false)
  })
})
