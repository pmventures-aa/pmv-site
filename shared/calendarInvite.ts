// Centralized iCalendar invite builder. This is the ONLY place that
// assembles REQUEST/CANCEL invite text — shared/ics.ts builds the
// separate PUBLISH "add to calendar" download feed and must not be
// conflated with this. Pure + dependency-free so server and tests share
// it (mirrors shared/authorization.ts).
//
// Correctness anchors (see the calendar-invites spec):
//  - Deterministic UID per (event, recipient); never reissued.
//  - SEQUENCE increments only on a material change; DTSTAMP every send.
//  - ORGANIZER byte-identical across every send for a given UID, or
//    clients treat it as a different event and duplicate it.
//  - Timestamps emitted UTC with a Z suffix (no TZID without VTIMEZONE).
//  - All-day events use DTSTART;VALUE=DATE with no time component.

export const INVITE_ORGANIZER_EMAIL = 'orders@pinnaclemanagementventures.com'
export const INVITE_ORGANIZER_CN = 'Pinnacle Management Ventures'
export const INVITE_DOMAIN = 'pinnaclemanagementventures.com'
const PRODID = '-//Pinnacle Management Ventures//Calendar Invites//EN'

export type RecipientType = 'CLIENT' | 'VENDOR'
export type InviteMethod = 'REQUEST' | 'CANCEL'
export type InviteStatus = 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED'
// The domain transition drives method/status/sequence and the title
// wording (decline vs cancel vs expire all share STATUS:CANCELLED but
// read differently to the recipient).
export type InviteTransition =
  | 'REQUEST' | 'CONFIRM' | 'RESCHEDULE' | 'CANCEL' | 'DECLINE' | 'EXPIRE'

export interface InviteEvent {
  id: string
  title: string | null
  serviceName?: string | null
  startsAt: string                 // ISO / UTC
  endsAt?: string | null           // ISO / UTC; null -> +60m
  allDay?: boolean
  timezone?: string | null
  status?: string | null
  locationType?: string | null     // virtual | phone | office | field | client_location | other
  address?: string | null
  locationName?: string | null
  meetingUrl?: string | null
  referenceNumber?: string | null
  // Secure Pinnacle page for this event (work order / confirmation).
  url?: string | null
}

export interface InviteRecipient {
  id: string
  type: RecipientType
  email: string
  name?: string | null
}

// --- transition -> method/status ------------------------------------

export function methodForTransition(t: InviteTransition): InviteMethod {
  return t === 'CANCEL' || t === 'DECLINE' || t === 'EXPIRE' ? 'CANCEL' : 'REQUEST'
}
export function statusForTransition(t: InviteTransition): InviteStatus {
  if (t === 'REQUEST') return 'TENTATIVE'
  if (t === 'CONFIRM' || t === 'RESCHEDULE') return 'CONFIRMED'
  return 'CANCELLED'
}
// SEQUENCE 0 on the first REQUEST; every other transition is a material
// change and increments. The dispatcher owns the running counter; this
// is the "does this transition increment?" rule.
export function transitionIncrementsSequence(t: InviteTransition): boolean {
  return t !== 'REQUEST'
}

// --- text escaping / folding ----------------------------------------

export function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

// Fold at 75 octets per RFC 5545. Continuation lines start with a space.
export function foldIcs(line: string): string {
  if (line.length <= 75) return line
  const out = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length) {
    out.push(` ${rest.slice(0, 74)}`)
    rest = rest.slice(74)
  }
  return out.join('\r\n')
}

// --- time formatting -------------------------------------------------

function two(n: number): string { return String(n).padStart(2, '0') }

// UTC basic format with Z suffix: YYYYMMDDTHHMMSSZ.
export function toUtcStamp(iso: string): string {
  const d = new Date(iso.trim().replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return iso
  return (
    `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}` +
    `T${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}Z`
  )
}

// Date-only value for all-day events: YYYYMMDD, taken from the local
// wall date if a timezone is known, else the UTC date. Never convert an
// all-day deadline into a midnight-to-midnight timed event.
export function toDateValue(iso: string): string {
  const raw = iso.trim()
  // If already a plain date, keep its digits.
  const plain = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (plain) return `${plain[1]}${plain[2]}${plain[3]}`
  const d = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return raw.replace(/[^0-9]/g, '').slice(0, 8)
  return `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}`
}

// --- material change hash -------------------------------------------

// Stable fingerprint of the fields that, when changed, must bump
// SEQUENCE and re-notify: time, all-day, title/service, location, and
// status. Internal notes and other metadata are deliberately excluded.
export function materialHash(event: InviteEvent, status: InviteStatus): string {
  const parts = [
    event.startsAt || '',
    event.endsAt || '',
    event.allDay ? '1' : '0',
    (event.serviceName || event.title || '').trim(),
    (event.address || event.locationName || event.meetingUrl || '').trim(),
    status,
  ]
  // Small, deterministic FNV-1a — no crypto needed for change detection.
  let h = 0x811c9dc5
  const s = parts.join('')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// --- deterministic UID ----------------------------------------------

export function inviteUid(eventId: string, recipientType: RecipientType, recipientId: string): string {
  return `pmv-${eventId}-${recipientType.toLowerCase()}-${recipientId}@${INVITE_DOMAIN}`
}

// --- titles ----------------------------------------------------------

function serviceLabel(event: InviteEvent): string {
  return (event.serviceName || event.title || 'Pinnacle Appointment').trim()
}

export function getInviteTitle(event: InviteEvent, transition: InviteTransition): string {
  const svc = serviceLabel(event)
  switch (transition) {
    case 'REQUEST': return `[REQUEST] Pinnacle - ${svc}`
    case 'CONFIRM':
    case 'RESCHEDULE': return `Pinnacle Confirmed - ${svc}`
    case 'DECLINE': return `Pinnacle Request Declined - ${svc}`
    case 'EXPIRE': return `EXPIRED - Pinnacle Service Request`
    case 'CANCEL':
    default: return `CANCELLED - Pinnacle ${svc}`
  }
}

// --- descriptions (privacy-filtered) --------------------------------

function locationLine(event: InviteEvent, recipientType: RecipientType): string | null {
  if (event.meetingUrl && (event.locationType === 'virtual' || event.locationType === 'phone')) {
    return `Location: ${event.meetingUrl}`
  }
  if (event.address) return `Location: ${event.address}`
  if (event.locationName) return `Location: ${event.locationName}`
  return null
}

function whenLine(event: InviteEvent): string {
  if (event.allDay) return `When: ${toDateValue(event.startsAt)} (all day)`
  const tz = event.timezone ? ` ${event.timezone}` : ' UTC'
  return `When: ${event.startsAt}${tz}`
}

// Build the plain-text invite description. Permission-filtered by
// recipient type — never pass unrestricted internal objects in. The
// InviteEvent type already carries only shareable fields, and we build
// the body from a whitelist rather than echoing event.description.
export function buildInviteDescription(input: {
  event: InviteEvent
  recipientType: RecipientType
  transition: InviteTransition
}): string {
  const { event, recipientType, transition } = input
  const lines: string[] = []
  const svc = serviceLabel(event)

  if (transition === 'REQUEST') {
    lines.push('Action Required - Please Review This Request')
    lines.push('')
  } else if (transition === 'CONFIRM' || transition === 'RESCHEDULE') {
    lines.push(transition === 'RESCHEDULE' ? 'This Pinnacle appointment has been rescheduled.' : 'This Pinnacle appointment is confirmed.')
    lines.push('')
  } else if (transition === 'DECLINE') {
    lines.push('This Pinnacle service request was declined.')
    lines.push('')
  } else if (transition === 'EXPIRE') {
    lines.push('This Pinnacle service request has expired.')
    lines.push('')
  } else {
    lines.push('This Pinnacle appointment has been cancelled.')
    lines.push('')
  }

  lines.push(`Service: ${svc}`)
  lines.push(whenLine(event))
  const loc = locationLine(event, recipientType)
  if (loc) lines.push(loc)
  if (event.referenceNumber) {
    lines.push(`${recipientType === 'VENDOR' ? 'Work Order' : 'Reference'}: ${event.referenceNumber}`)
  }
  if (recipientType === 'VENDOR') {
    lines.push('Please review the assignment and arrival window in Pinnacle.')
  }
  if (event.url) {
    lines.push('')
    if (transition === 'REQUEST') lines.push(`Review and respond in Pinnacle: ${event.url}`)
    else if (methodForTransition(transition) === 'REQUEST') lines.push(`${recipientType === 'VENDOR' ? 'View Work Order' : 'View Service Confirmation'}: ${event.url}`)
    else lines.push(`View in Pinnacle: ${event.url}`)
  }
  return lines.join('\n')
}

// --- the builder -----------------------------------------------------

export interface BuildInviteResult { ics: string; uid: string }

// buildCalendarInvite: one event + one recipient -> one VCALENDAR with a
// single VEVENT. method/sequence/status come from the caller (the
// dispatcher derives them from the transition + prior sequence).
export function buildCalendarInvite(input: {
  event: InviteEvent
  recipient: InviteRecipient
  method: InviteMethod
  sequence: number
  status: InviteStatus
  transition: InviteTransition
}): BuildInviteResult {
  const { event, recipient, method, sequence, status, transition } = input
  const uid = inviteUid(event.id, recipient.type, recipient.id)
  const now = toUtcStamp(new Date().toISOString())
  const title = getInviteTitle(event, transition)
  const description = buildInviteDescription({ event, recipientType: recipient.type, transition })

  const L: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    foldIcs(`UID:${uid}`),
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${now}`,
  ]

  if (event.allDay) {
    L.push(`DTSTART;VALUE=DATE:${toDateValue(event.startsAt)}`)
    // For an all-day event DTEND is the exclusive next day; if we have no
    // explicit end, a single all-day is start-only which every client
    // accepts. Emit DTEND only when an explicit end date is provided.
    if (event.endsAt) L.push(`DTEND;VALUE=DATE:${toDateValue(event.endsAt)}`)
  } else {
    L.push(`DTSTART:${toUtcStamp(event.startsAt)}`)
    const end = event.endsAt || new Date(new Date(event.startsAt.replace(' ', 'T')).getTime() + 60 * 60_000).toISOString()
    L.push(`DTEND:${toUtcStamp(end)}`)
  }

  L.push(foldIcs(`SUMMARY:${escapeIcs(title)}`))
  L.push(foldIcs(`DESCRIPTION:${escapeIcs(description)}`))

  const locValue = event.meetingUrl && (event.locationType === 'virtual' || event.locationType === 'phone')
    ? event.meetingUrl
    : event.address || event.locationName || ''
  if (locValue) L.push(foldIcs(`LOCATION:${escapeIcs(locValue)}`))
  if (event.url) L.push(foldIcs(`URL:${escapeIcs(event.url)}`))

  L.push(`STATUS:${status}`)
  L.push('TRANSP:OPAQUE')
  // ORGANIZER byte-identical every time.
  L.push(foldIcs(`ORGANIZER;CN=${INVITE_ORGANIZER_CN}:mailto:${INVITE_ORGANIZER_EMAIL}`))
  // Acceptance happens inside Pinnacle, not the mail client: suppress RSVP
  // and disallow counter-proposals.
  const attendeeName = recipient.name ? `;CN=${escapeIcs(recipient.name)}` : ''
  L.push(foldIcs(`ATTENDEE${attendeeName};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${recipient.email}`))
  L.push('X-MICROSOFT-DISALLOW-COUNTER:TRUE')

  L.push('END:VEVENT')
  L.push('END:VCALENDAR')

  return { ics: L.join('\r\n'), uid }
}
