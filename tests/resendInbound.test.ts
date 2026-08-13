import { describe, expect, it } from 'vitest'
import {
  compactUuid,
  expandCompactUuid,
  findThreadIdInRecipients,
  formattedReplyTo,
  hqInboundAddress,
  inboundDomain,
  normalizeMessageId,
  parseMailbox,
  sendingFrom,
  threadIdFromInboundAddress,
  threadReplyAddress,
} from '../functions/_lib/resendInbound'

describe('Resend inbound addressing', () => {
  const env = { RESEND_INBOUND_DOMAIN: 'ziloifaluk.resend.app' }
  const threadId = '11111111-2222-3333-4444-555555555555'

  it('keeps From on the Pinnacle sending domain', () => {
    const from = sendingFrom({ RESEND_FROM_EMAIL: 'Pinnacle Management Ventures <notifications@pinnaclemanagementventures.com>' })
    expect(from.email).toBe('notifications@pinnaclemanagementventures.com')
    expect(from.email.endsWith('pinnaclemanagementventures.com')).toBe(true)
    expect(from.formatted).toContain('pinnaclemanagementventures.com')
  })

  it('builds Reply-To on the Resend receiving domain without touching From', () => {
    expect(inboundDomain(env)).toBe('ziloifaluk.resend.app')
    expect(threadReplyAddress(env, threadId)).toBe(`t-${compactUuid(threadId)}@ziloifaluk.resend.app`)
    expect(hqInboundAddress(env)).toBe('hq@ziloifaluk.resend.app')
    expect(formattedReplyTo(threadReplyAddress(env, threadId))).toContain('ziloifaluk.resend.app')
    expect(formattedReplyTo(threadReplyAddress(env, threadId))).toContain('Pinnacle Management Ventures')
    expect(threadReplyAddress(env, threadId)).not.toContain('pinnaclemanagementventures.com')
  })

  it('round-trips a thread id from anything@ziloifaluk.resend.app', () => {
    const address = threadReplyAddress(env, threadId)
    expect(threadIdFromInboundAddress(address, inboundDomain(env))).toBe(threadId)
    expect(findThreadIdInRecipients(
      ['jordan@example.com', address],
      inboundDomain(env),
    )).toBe(threadId)
    expect(expandCompactUuid(compactUuid(threadId))).toBe(threadId)
  })

  it('ignores mail that is not on the receiving domain', () => {
    expect(threadIdFromInboundAddress('orders@pinnaclemanagementventures.com', inboundDomain(env))).toBeNull()
    expect(findThreadIdInRecipients(['hq@other.resend.app'], inboundDomain(env))).toBeNull()
  })

  it('normalizes Message-ID values so In-Reply-To can match outbound rows', () => {
    expect(normalizeMessageId('<Abc@pinnaclemanagementventures.com>')).toBe('abc@pinnaclemanagementventures.com')
    expect(normalizeMessageId('Abc@pinnaclemanagementventures.com')).toBe('abc@pinnaclemanagementventures.com')
    expect(parseMailbox('Jordan Lee <jordan@example.com>')).toEqual({ email: 'jordan@example.com', name: 'Jordan Lee' })
  })
})
