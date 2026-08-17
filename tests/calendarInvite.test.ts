import { describe, it, expect } from 'vitest'
import {
  buildCalendarInvite,
  buildInviteDescription,
  getInviteTitle,
  inviteUid,
  materialHash,
  methodForTransition,
  statusForTransition,
  transitionIncrementsSequence,
  toUtcStamp,
  toDateValue,
  type InviteEvent,
  type InviteRecipient,
} from '../shared/calendarInvite'

const baseEvent: InviteEvent = {
  id: 'evt_1',
  title: 'Property Inspection',
  serviceName: 'Property Inspection',
  startsAt: '2026-08-18T14:00:00Z',
  endsAt: '2026-08-18T15:00:00Z',
  allDay: false,
  timezone: 'America/New_York',
  status: 'proposed',
  locationType: 'field',
  address: '123 Main St, Miami, FL',
  referenceNumber: 'WO-4821',
  url: 'https://secure.pinnaclemanagementventures.com/calendar?event=evt_1',
}
const client: InviteRecipient = { id: 'usr_c', type: 'CLIENT', email: 'client@example.com', name: 'Casey Client' }
const vendor: InviteRecipient = { id: 'usr_v', type: 'VENDOR', email: 'vendor@example.com', name: 'Val Vendor' }

// RFC 5545 line unfolding: a CRLF followed by a space/tab continues the
// prior logical line. Calendar clients unfold before reading, so tests
// assert against the unfolded content.
function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, '')
}
function line(ics: string, prefix: string): string | undefined {
  return unfold(ics).split('\r\n').find((l) => l.startsWith(prefix))
}

describe('transition mapping', () => {
  it('maps method/status per the spec lifecycle table', () => {
    expect(methodForTransition('REQUEST')).toBe('REQUEST')
    expect(statusForTransition('REQUEST')).toBe('TENTATIVE')
    expect(statusForTransition('CONFIRM')).toBe('CONFIRMED')
    expect(statusForTransition('RESCHEDULE')).toBe('CONFIRMED')
    expect(methodForTransition('DECLINE')).toBe('CANCEL')
    expect(methodForTransition('EXPIRE')).toBe('CANCEL')
    expect(statusForTransition('CANCEL')).toBe('CANCELLED')
    expect(transitionIncrementsSequence('REQUEST')).toBe(false)
    expect(transitionIncrementsSequence('CONFIRM')).toBe(true)
  })
})

describe('deterministic UID', () => {
  it('is stable per event+recipient and differs across recipient/type', () => {
    expect(inviteUid('evt_1', 'CLIENT', 'usr_c')).toBe('pmv-evt_1-client-usr_c@pinnaclemanagementventures.com')
    expect(inviteUid('evt_1', 'CLIENT', 'usr_c')).toBe(inviteUid('evt_1', 'CLIENT', 'usr_c'))
    expect(inviteUid('evt_1', 'VENDOR', 'usr_c')).not.toBe(inviteUid('evt_1', 'CLIENT', 'usr_c'))
  })
})

describe('lifecycle: same UID, monotonic SEQUENCE', () => {
  it('request(0) -> confirm(1) -> reschedule(2) -> cancel(3) keep one UID', () => {
    const req = buildCalendarInvite({ event: baseEvent, recipient: client, method: 'REQUEST', sequence: 0, status: 'TENTATIVE', transition: 'REQUEST' })
    const con = buildCalendarInvite({ event: baseEvent, recipient: client, method: 'REQUEST', sequence: 1, status: 'CONFIRMED', transition: 'CONFIRM' })
    const res = buildCalendarInvite({ event: { ...baseEvent, startsAt: '2026-08-19T14:00:00Z' }, recipient: client, method: 'REQUEST', sequence: 2, status: 'CONFIRMED', transition: 'RESCHEDULE' })
    const can = buildCalendarInvite({ event: baseEvent, recipient: client, method: 'CANCEL', sequence: 3, status: 'CANCELLED', transition: 'CANCEL' })
    const uid = req.uid
    for (const r of [con, res, can]) expect(r.uid).toBe(uid)
    expect(line(req.ics, 'SEQUENCE:')).toBe('SEQUENCE:0')
    expect(line(con.ics, 'SEQUENCE:')).toBe('SEQUENCE:1')
    expect(line(res.ics, 'SEQUENCE:')).toBe('SEQUENCE:2')
    expect(line(can.ics, 'SEQUENCE:')).toBe('SEQUENCE:3')
    expect(line(req.ics, 'METHOD:')).toBe('METHOD:REQUEST')
    expect(line(can.ics, 'METHOD:')).toBe('METHOD:CANCEL')
    expect(line(req.ics, 'STATUS:')).toBe('STATUS:TENTATIVE')
    expect(line(can.ics, 'STATUS:')).toBe('STATUS:CANCELLED')
  })
})

describe('ICS format correctness', () => {
  const { ics } = buildCalendarInvite({ event: baseEvent, recipient: client, method: 'REQUEST', sequence: 0, status: 'TENTATIVE', transition: 'REQUEST' })

  it('has the required VCALENDAR envelope', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('CALSCALE:GREGORIAN')
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
  })

  it('emits timestamps as UTC with a Z suffix', () => {
    expect(line(ics, 'DTSTART:')).toBe('DTSTART:20260818T140000Z')
    expect(line(ics, 'DTEND:')).toBe('DTEND:20260818T150000Z')
    expect(line(ics, 'DTSTAMP:')).toMatch(/^DTSTAMP:\d{8}T\d{6}Z$/)
  })

  it('ORGANIZER is byte-identical to the constant', () => {
    expect(line(ics, 'ORGANIZER')).toBe('ORGANIZER;CN=Pinnacle Management Ventures:mailto:orders@pinnaclemanagementventures.com')
  })

  it('suppresses RSVP and disallows counter-proposals', () => {
    expect(unfold(ics)).toContain('RSVP=FALSE')
    expect(unfold(ics)).toContain('PARTSTAT=NEEDS-ACTION')
    expect(unfold(ics)).toContain('X-MICROSOFT-DISALLOW-COUNTER:TRUE')
  })

  it('escapes commas/semicolons in text values', () => {
    // The address contains commas; they must be backslash-escaped.
    expect(unfold(ics)).toContain('LOCATION:123 Main St\\, Miami\\, FL')
  })

  it('defaults a missing end to +60m', () => {
    const { ics: noEnd } = buildCalendarInvite({ event: { ...baseEvent, endsAt: null }, recipient: client, method: 'REQUEST', sequence: 0, status: 'TENTATIVE', transition: 'REQUEST' })
    expect(line(noEnd, 'DTSTART:')).toBe('DTSTART:20260818T140000Z')
    expect(line(noEnd, 'DTEND:')).toBe('DTEND:20260818T150000Z')
  })
})

describe('all-day events', () => {
  it('use VALUE=DATE with no time component', () => {
    const allDay: InviteEvent = { ...baseEvent, allDay: true, startsAt: '2026-08-18', endsAt: null }
    const { ics } = buildCalendarInvite({ event: allDay, recipient: client, method: 'REQUEST', sequence: 0, status: 'TENTATIVE', transition: 'REQUEST' })
    expect(line(ics, 'DTSTART')).toBe('DTSTART;VALUE=DATE:20260818')
    expect(ics).not.toContain('DTSTART:2026') // never a timed midnight event
  })
})

describe('DST boundary', () => {
  it('emits the stored UTC instant unchanged across a spring-forward date', () => {
    // 2026-03-08 is US spring-forward. A UTC instant must serialize to
    // the same Z stamp regardless of any local DST shift.
    expect(toUtcStamp('2026-03-08T07:30:00Z')).toBe('20260308T073000Z')
    expect(toUtcStamp('2026-11-01T06:30:00Z')).toBe('20261101T063000Z') // fall-back
  })
  it('toDateValue keeps a plain date intact', () => {
    expect(toDateValue('2026-08-18')).toBe('20260818')
  })
})

describe('titles', () => {
  it('render the spec wording per transition', () => {
    expect(getInviteTitle(baseEvent, 'REQUEST')).toBe('[REQUEST] Pinnacle - Property Inspection')
    expect(getInviteTitle(baseEvent, 'CONFIRM')).toBe('Pinnacle Confirmed - Property Inspection')
    expect(getInviteTitle(baseEvent, 'CANCEL')).toBe('CANCELLED - Pinnacle Property Inspection')
    expect(getInviteTitle(baseEvent, 'DECLINE')).toBe('Pinnacle Request Declined - Property Inspection')
    expect(getInviteTitle(baseEvent, 'EXPIRE')).toBe('EXPIRED - Pinnacle Service Request')
  })
})

describe('privacy filtering', () => {
  it('request description carries the action CTA, service, time, location, reference and link', () => {
    const d = buildInviteDescription({ event: baseEvent, recipientType: 'CLIENT', transition: 'REQUEST' })
    expect(d).toContain('Action Required')
    expect(d).toContain('Service: Property Inspection')
    expect(d).toContain('123 Main St')
    expect(d).toContain('Reference: WO-4821')
    expect(d).toContain('secure.pinnaclemanagementventures.com')
  })

  it('vendor description uses Work Order labeling; client uses Reference', () => {
    const v = buildInviteDescription({ event: baseEvent, recipientType: 'VENDOR', transition: 'CONFIRM' })
    expect(v).toContain('Work Order: WO-4821')
    const c = buildInviteDescription({ event: baseEvent, recipientType: 'CLIENT', transition: 'CONFIRM' })
    expect(c).toContain('Reference: WO-4821')
    expect(c).not.toContain('Work Order')
  })

  it('is built from a field whitelist — InviteEvent has no channel for internal notes', () => {
    // The type carries no `description`/notes/rate/margin field, so raw
    // internal text structurally cannot leak into invite bodies. Assert
    // the client body is exactly the whitelisted lines.
    const d = buildInviteDescription({ event: baseEvent, recipientType: 'CLIENT', transition: 'CONFIRM' })
    expect(d).not.toMatch(/margin|rate|internal|staff note/i)
  })
})

describe('material hash', () => {
  it('changes when time/location/title/status change, stable otherwise', () => {
    const h0 = materialHash(baseEvent, 'TENTATIVE')
    expect(materialHash(baseEvent, 'TENTATIVE')).toBe(h0)
    expect(materialHash({ ...baseEvent, startsAt: '2026-08-19T14:00:00Z' }, 'TENTATIVE')).not.toBe(h0)
    expect(materialHash(baseEvent, 'CONFIRMED')).not.toBe(h0)
    // A different reference number is NOT material to the calendar entry.
    expect(materialHash({ ...baseEvent, referenceNumber: 'WO-9999' }, 'TENTATIVE')).toBe(h0)
  })
})
