import type { Env } from './types'
import { googleAccessTokenFor } from './googleFreeBusy'

// Writing consultations onto the host's real Google calendar.
//
// The freebusy module reads Google to decide what is bookable. This is the
// other direction: once a visitor books, the host should see it in the
// calendar they actually look at, not only in HQ. Without this a booking is
// invisible outside the app, and the host's own availability engine will
// happily offer the same hour again from a different device.
//
// Best-effort by construction. Every failure path returns rather than throws,
// because the booking is already true by the time we get here: a Google
// outage must degrade to "not on your phone yet", never to a lost booking.
// The link row records what happened so a later reconciliation can find both
// the events that pushed and the ones that did not.

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars'
const REQUEST_TIMEOUT_MS = 6000

export interface ConsultationEventInput {
  bookingId: string
  contactName: string
  email: string
  phone: string | null
  topic: string | null
  startsAt: string
  endsAt: string
  timezone: string
  meetingFormat: 'virtual' | 'phone'
  joinUrl: string | null
}

async function withTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * What the host sees when they open the event.
 *
 * The attendee list is deliberately empty. Adding the visitor would make
 * Google mail them an invitation on its own schedule, on top of the
 * confirmation this app already sent, and an unverified address does not
 * deserve two. Their details go in the description instead.
 */
function eventBody(input: ConsultationEventInput): Record<string, unknown> {
  const lines = [
    `Booked online by ${input.contactName} <${input.email}>`,
    input.phone ? `Phone: ${input.phone}` : '',
    input.topic ? `Topic: ${input.topic}` : '',
    input.meetingFormat === 'phone'
      ? 'Format: phone call. Pinnacle calls the number above.'
      : 'Format: video call.',
    input.joinUrl ? `Join: ${input.joinUrl}` : '',
  ].filter(Boolean)

  return {
    summary: `Consultation: ${input.contactName}`,
    description: lines.join('\n'),
    start: { dateTime: input.startsAt, timeZone: input.timezone },
    end: { dateTime: input.endsAt, timeZone: input.timezone },
    location: input.meetingFormat === 'phone' ? (input.phone || 'Phone call') : (input.joinUrl || 'Video call'),
    // Busy, so the availability engine's next freebusy read blocks this hour.
    transparency: 'opaque',
    source: { title: 'Pinnacle HQ', url: 'https://hq.pinnaclemanagementventures.com' },
  }
}

async function recordLink(
  env: Env,
  bookingId: string,
  fields: { externalEventId: string | null; calendarId: string | null; error: string | null },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO consultation_calendar_links
       (booking_id, provider, external_event_id, calendar_id, last_error, updated_at)
     VALUES (?, 'google', ?, ?, ?, datetime('now'))
     ON CONFLICT(booking_id, provider) DO UPDATE SET
       external_event_id = excluded.external_event_id,
       calendar_id       = excluded.calendar_id,
       last_error        = excluded.last_error,
       updated_at        = datetime('now')`,
  ).bind(bookingId, fields.externalEventId, fields.calendarId, fields.error).run().catch(() => {})
}

/**
 * Put a confirmed booking on the host's Google calendar.
 *
 * Returns the Google event id when it landed, null otherwise. A null is not
 * an error the caller should surface: the booking stands either way.
 */
export async function pushConsultationToGoogle(
  env: Env,
  hostUserId: string | null,
  input: ConsultationEventInput,
): Promise<string | null> {
  // No host means no calendar to write to. Staff triage it from HQ instead.
  if (!hostUserId) return null

  const auth = await googleAccessTokenFor(env, hostUserId)
  if (!auth) {
    await recordLink(env, input.bookingId, { externalEventId: null, calendarId: null, error: 'not connected' })
    return null
  }

  let response: Response
  try {
    response = await withTimeout(`${EVENTS_URL}/${encodeURIComponent(auth.calendarId)}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody(input)),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'request failed'
    console.error('[gcal-push] request failed', message)
    await recordLink(env, input.bookingId, { externalEventId: null, calendarId: auth.calendarId, error: message.slice(0, 200) })
    return null
  }

  if (!response.ok) {
    console.error('[gcal-push] returned', response.status)
    await recordLink(env, input.bookingId, {
      externalEventId: null,
      calendarId: auth.calendarId,
      error: `google create failed (${response.status})`,
    })
    return null
  }

  const payload = await response.json().catch(() => null) as { id?: string } | null
  const eventId = payload?.id || null
  await recordLink(env, input.bookingId, { externalEventId: eventId, calendarId: auth.calendarId, error: null })
  return eventId
}

/**
 * Take a cancelled booking back off the host's calendar.
 *
 * Deletes rather than marks cancelled: the host's calendar is a working view,
 * and the cancellation history already lives in consultation_bookings. A 404
 * or 410 counts as success, because the goal is "not there any more".
 */
export async function removeConsultationFromGoogle(env: Env, hostUserId: string | null, bookingId: string): Promise<void> {
  if (!hostUserId) return

  const link = await env.DB.prepare(
    `SELECT external_event_id, calendar_id
       FROM consultation_calendar_links
      WHERE booking_id = ? AND provider = 'google'`,
  ).bind(bookingId).first<{ external_event_id: string | null; calendar_id: string | null }>().catch(() => null)
  if (!link?.external_event_id) return

  const auth = await googleAccessTokenFor(env, hostUserId)
  if (!auth) return

  const calendarId = link.calendar_id || auth.calendarId
  try {
    const res = await withTimeout(
      `${EVENTS_URL}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(link.external_event_id)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${auth.token}` } },
    )
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      console.error('[gcal-push] delete returned', res.status)
      return
    }
  } catch (err) {
    console.error('[gcal-push] delete failed', err instanceof Error ? err.message : err)
    return
  }

  await env.DB.prepare(
    `UPDATE consultation_calendar_links
        SET external_event_id = NULL, updated_at = datetime('now')
      WHERE booking_id = ? AND provider = 'google'`,
  ).bind(bookingId).run().catch(() => {})
}
