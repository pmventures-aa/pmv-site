export function shortSnapshotHash(hash: string | null | undefined): string {
  const value = String(hash || '').trim()
  if (!value) return '—'
  return value.length > 8 ? value.slice(0, 8) : value
}

export function formatAuditTimestamp(ts: unknown, timeZone = 'America/New_York'): string {
  const date = new Date(String(ts || ''))
  if (Number.isNaN(date.getTime())) return String(ts || '—')
  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return `${get('month')} ${get('day')}, ${get('year')} @ ${get('hour')}:${get('minute')} ${get('timeZoneName')}`.replace(/\s+/g, ' ').trim()
}

export function formatAuditTimeOnly(ts: unknown, timeZone = 'America/New_York'): string {
  const date = new Date(String(ts || ''))
  if (Number.isNaN(date.getTime())) return String(ts || '—')
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(date)
}

export function formatAuditDateHeading(ts: unknown, timeZone = 'America/New_York'): string {
  const date = new Date(String(ts || ''))
  if (Number.isNaN(date.getTime())) return String(ts || '—')
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  }).format(date)
}

export function formatCoordinates(lat: unknown, lon: unknown): string | null {
  const latitude = Number(lat)
  const longitude = Number(lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const latDms = toDms(latitude, latitude >= 0 ? 'N' : 'S')
  const lonDms = toDms(longitude, longitude >= 0 ? 'E' : 'W')
  return `${latDms} ${lonDms}`
}

function toDms(value: number, hemisphere: string): string {
  const absolute = Math.abs(value)
  const degrees = Math.floor(absolute)
  const minutesFloat = (absolute - degrees) * 60
  const minutes = Math.floor(minutesFloat)
  const seconds = Math.round((minutesFloat - minutes) * 60)
  return `${degrees}°${minutes}′${seconds}″${hemisphere}`
}

export function fieldTypeLabel(type: unknown): string {
  const value = String(type || '').toLowerCase()
  if (value === 'signature') return 'Signature'
  if (value === 'initial') return 'Initial'
  if (value === 'date') return 'Date'
  if (value === 'checkbox') return 'Checkbox'
  return 'Text'
}

export function describeEnvelopeEvent(input: {
  event: Record<string, unknown>
  recipientsById: Map<string, Record<string, unknown>>
  ownerEmail?: string | null
}): { headline: string; detail?: string; evidence?: string } {
  const { event, recipientsById, ownerEmail } = input
  const type = String(event.event_type || '')
  const recipient = event.recipient_id ? recipientsById.get(String(event.recipient_id)) : null
  const recipientName = recipient ? String(recipient.name || recipient.email || 'Signer') : 'Signer'
  const recipientEmail = recipient ? String(recipient.email || '') : ''
  let metadata: Record<string, unknown> = {}
  try {
    metadata = event.metadata_json ? JSON.parse(String(event.metadata_json)) : {}
  } catch {
    metadata = {}
  }

  switch (type) {
    case 'envelope.created':
      return {
        headline: 'Document created',
        detail: `${ownerEmail || 'Pinnacle staff'} created the document`,
      }
    case 'envelope.sent':
      return {
        headline: 'Sign request created',
        detail: `${ownerEmail || 'Pinnacle staff'} initialized a sign request with the document`,
        evidence: metadata.verified_snapshot ? `Verified snapshot ${metadata.verified_snapshot}` : undefined,
      }
    case 'recipient.added':
      return {
        headline: 'Signer added',
        detail: `${String(metadata.email || recipientEmail || 'Signer')} was added to the sign request`,
      }
    case 'authentication.otp_sent':
      return {
        headline: 'Email sent',
        detail: `${recipientName} was notified by email`,
        evidence: 'Email Delivery Status: SENT',
      }
    case 'authentication.passed':
      return {
        headline: 'Identity verified',
        detail: `${recipientName} verified their identity to access the document`,
      }
    case 'recipient.viewed':
      return {
        headline: 'Viewed',
        detail: `${recipientName} viewed the document`,
      }
    case 'consent.esign_accepted':
      return {
        headline: 'Consented to esign',
        detail: `${recipientName} consented to esign`,
      }
    case 'location.reported':
      return {
        headline: 'Location reported',
        detail: `${recipientName}'s location was reported`,
      }
    case 'field.completed':
      return {
        headline: 'Field completed',
        detail: `${recipientName} completed ${fieldTypeLabel(metadata.field_type)} field`,
      }
    case 'recipient.completed':
      return {
        headline: 'Signer finalized',
        detail: `${recipientName} completed required signing actions`,
      }
    case 'envelope.completed':
      return {
        headline: 'Sign request finalized',
        detail: `${recipientName} finalized the sign request for the document`,
        evidence: metadata.verified_snapshot ? `Verified snapshot ${metadata.verified_snapshot}` : undefined,
      }
    case 'envelope.sealed':
      return {
        headline: 'Evidence sealed',
        detail: 'Pinnacle sealed the signed PDF, audit trail, and evidence manifest',
        evidence: metadata.final_pdf_sha256 ? `Verified snapshot ${shortSnapshotHash(String(metadata.final_pdf_sha256))}` : undefined,
      }
    case 'recipient.declined':
      return {
        headline: 'Declined',
        detail: `${recipientName} declined the sign request`,
      }
    case 'envelope.voided':
      return {
        headline: 'Voided',
        detail: 'The sign request was voided',
      }
    default:
      return {
        headline: type.replaceAll('.', ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
        detail: recipientName !== 'Signer' ? recipientName : undefined,
      }
  }
}

export function buildEvidenceLine(event: Record<string, unknown>): string | null {
  const parts: string[] = []
  if (event.ip_address) parts.push(`IP ${event.ip_address}`)
  const browser = [event.browser_family, event.os_family].filter(Boolean).join(', ')
  if (browser) parts.push(browser)
  else if (event.user_agent) parts.push(String(event.user_agent).slice(0, 120))
  const coords = formatCoordinates(event.geo_lat_approx, event.geo_lon_approx)
  if (coords) parts.push(coords)
  return parts.length ? parts.join(', ') : null
}
