import { describe, expect, it } from 'vitest'
import {
  buildEvidenceLine,
  describeEnvelopeEvent,
  fieldTypeLabel,
  formatAuditTimestamp,
  formatCoordinates,
  shortSnapshotHash,
} from '../functions/_lib/auditTrailFormat'
import { parseUserAgent } from '../functions/_lib/userAgentParse'

describe('audit trail formatting', () => {
  it('formats coordinates in degrees minutes seconds', () => {
    const formatted = formatCoordinates(26.6758, -80.2486)
    expect(formatted).toContain('N')
    expect(formatted).toContain('W')
  })

  it('describes consent and finalized events in plain language', () => {
    const recipientsById = new Map([
      ['r1', { id: 'r1', name: 'Kristina Roberts', email: 'kroberts@example.com' }],
    ])
    const consent = describeEnvelopeEvent({
      event: { event_type: 'consent.esign_accepted', recipient_id: 'r1' },
      recipientsById,
    })
    expect(consent.headline).toBe('Consented to esign')
    expect(consent.detail).toContain('Kristina Roberts')

    const finalized = describeEnvelopeEvent({
      event: { event_type: 'envelope.completed', recipient_id: 'r1', metadata_json: JSON.stringify({ verified_snapshot: 'b6e249b6' }) },
      recipientsById,
    })
    expect(finalized.headline).toBe('Sign request finalized')
    expect(finalized.evidence).toContain('b6e249b6')
  })

  it('builds evidence lines from IP browser and location', () => {
    const line = buildEvidenceLine({
      ip_address: '2607:fb90:7929:8485:997d:fcb1:fcb3:d00b',
      browser_family: 'Chrome 151',
      os_family: 'iOS 26.6.0',
      geo_lat_approx: 26.6758,
      geo_lon_approx: -80.2486,
    })
    expect(line).toContain('IP')
    expect(line).toContain('Chrome 151')
    expect(line).toContain('N')
  })

  it('labels field types for assigned-field tables', () => {
    expect(fieldTypeLabel('signature')).toBe('Signature')
    expect(fieldTypeLabel('checkbox')).toBe('Checkbox')
  })

  it('shortens snapshot hashes for audit summaries', () => {
    expect(shortSnapshotHash('b6e249b6f0a1c2d3')).toBe('b6e249b6')
  })

  it('formats audit timestamps with timezone label', () => {
    const formatted = formatAuditTimestamp('2026-08-14T18:24:00.000Z')
    expect(formatted).toContain('2026')
    expect(formatted).toContain('@')
  })
})

describe('user agent parsing', () => {
  it('parses Chrome on iOS as mobile evidence', () => {
    const parsed = parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/151.0.0.0 Mobile/15E148 Safari/604.1')
    expect(parsed.browser_family).toContain('Chrome')
    expect(parsed.os_family).toContain('iOS')
    expect(parsed.device_class).toBe('mobile')
  })
})
