import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PUBLIC_SITE_BASE,
  RESEND_WEBHOOK_EVENTS,
  describeResendWebhookState,
  findMatchingWebhook,
  isPmvResendWebhookEndpoint,
  mergeWebhookEvents,
  missingWebhookEvents,
  normalizeWebhookEndpoint,
  webhookEndpointUrl,
} from '../functions/_lib/resendWebhookSetup'

describe('Resend webhook setup', () => {
  it('points production callbacks at the public Pages API', () => {
    expect(webhookEndpointUrl()).toBe(`${DEFAULT_PUBLIC_SITE_BASE}/api/webhooks/resend`)
    expect(webhookEndpointUrl('https://www.pinnaclemanagementventures.com/')).toBe(
      'https://www.pinnaclemanagementventures.com/api/webhooks/resend',
    )
  })

  it('treats www, hq, and secure hosts as the same Pinnacle webhook', () => {
    expect(isPmvResendWebhookEndpoint('https://www.pinnaclemanagementventures.com/api/webhooks/resend')).toBe(true)
    expect(isPmvResendWebhookEndpoint('https://hq.pinnaclemanagementventures.com/api/webhooks/resend/')).toBe(true)
    expect(isPmvResendWebhookEndpoint('https://secure.pinnaclemanagementventures.com/api/webhooks/resend')).toBe(true)
    expect(isPmvResendWebhookEndpoint('https://www.pinnaclemanagementventures.com/api/webhooks/resend/inbound')).toBe(false)
    expect(isPmvResendWebhookEndpoint('https://example.com/api/webhooks/resend')).toBe(false)
  })

  it('normalizes trailing slashes so an existing webhook is reused', () => {
    expect(normalizeWebhookEndpoint('https://www.pinnaclemanagementventures.com/api/webhooks/resend/'))
      .toBe('https://www.pinnaclemanagementventures.com/api/webhooks/resend')
  })

  it('requires inbound received plus delivery events', () => {
    expect(missingWebhookEvents(['email.sent', 'email.delivered'])).toContain('email.received')
    expect(missingWebhookEvents([...RESEND_WEBHOOK_EVENTS])).toEqual([])
    expect(mergeWebhookEvents(['email.sent'])).toEqual(expect.arrayContaining([...RESEND_WEBHOOK_EVENTS]))
  })

  it('matches an empty Resend list as needs_create', () => {
    const status = describeResendWebhookState({
      apiKeyConfigured: true,
      inboundDomain: 'ziloifaluk.resend.app',
      endpoint: webhookEndpointUrl(),
      webhooks: [],
      envSecretConfigured: false,
      storedSecretConfigured: false,
    })
    expect(status.listed_count).toBe(0)
    expect(status.needs_create).toBe(true)
    expect(status.ready).toBe(false)
    expect(status.webhook).toBeNull()
  })

  it('prefers the canonical endpoint and flags missing inbound events', () => {
    const canonical = webhookEndpointUrl()
    const match = findMatchingWebhook([
      { id: 'other', endpoint: 'https://example.com/hooks', events: ['email.sent'] },
      { id: 'pmv', endpoint: 'https://www.pinnaclemanagementventures.com/api/webhooks/resend/', events: ['email.sent'] },
    ], canonical)
    expect(match?.id).toBe('pmv')

    const status = describeResendWebhookState({
      apiKeyConfigured: true,
      inboundDomain: 'ziloifaluk.resend.app',
      endpoint: canonical,
      webhooks: [match!],
      envSecretConfigured: false,
      storedSecretConfigured: true,
    })
    expect(status.needs_create).toBe(false)
    expect(status.needs_update).toBe(true)
    expect(status.webhook?.missing_events).toContain('email.received')
  })

  it('is ready only when the webhook exists, events are complete, and a secret is stored', () => {
    const status = describeResendWebhookState({
      apiKeyConfigured: true,
      inboundDomain: 'ziloifaluk.resend.app',
      endpoint: webhookEndpointUrl(),
      webhooks: [{
        id: 'ready',
        endpoint: webhookEndpointUrl(),
        status: 'enabled',
        events: [...RESEND_WEBHOOK_EVENTS],
      }],
      envSecretConfigured: false,
      storedSecretConfigured: true,
    })
    expect(status.ready).toBe(true)
    expect(status.needs_create).toBe(false)
    expect(status.needs_update).toBe(false)
    expect(status.needs_secret).toBe(false)
  })
})
