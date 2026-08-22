// Field assignments, mirrored onto the calendar so providers get real invites.
//
// The provider network runs on people who already have a calendar and are not
// going to adopt ours. Asking a 1099 provider to connect their personal Google
// account is both a hard sell and a liability - we would be holding tokens for
// every calendar in the network, and it would only ever work for the Google
// half of them. An .ics invite lands in Google, Apple, Outlook, and Fastmail
// alike, needs no OAuth, and leaves nothing for us to store or revoke.
//
// The invite machinery for that already exists (calendarInviteDispatch) and
// already treats VENDOR as a first-class recipient with an opt-out. It is
// keyed on calendar_events, so the only thing missing was the row. Writing one
// per assignment buys three things at once:
//
//   1. providers get an invite that reschedules and cancels itself,
//   2. field work finally shows up on the HQ calendar, which it never did,
//   3. one table means the calendar cannot disagree with the work.

import type { Env } from './types'
import { uuid } from './crypto'
import { dispatchCalendarInvites } from './calendarInviteDispatch'

export interface AssignmentCalendarInput {
  id: string
  kind: string
  service_key: string
  title: string | null
  site_label: string | null
  site_address: string | null
  site_city: string | null
  site_state: string | null
  site_postal_code: string | null
  scheduled_at: string | null
  client_user_id: string
  vendor_user_id: string
  assigned_by_user_id?: string | null
  notes?: string | null
}

/** Default length of a field visit when nothing more specific is known. */
const DEFAULT_MINUTES = 60

function endFor(startsAt: string): string {
  return new Date(Date.parse(startsAt) + DEFAULT_MINUTES * 60_000).toISOString()
}

function addressOf(a: AssignmentCalendarInput): string | null {
  const cityState = [a.site_city, a.site_state].filter(Boolean).join(', ')
  const parts = [a.site_address, cityState, a.site_postal_code].filter(Boolean)
  return parts.length ? parts.join(' ') : null
}

function titleOf(a: AssignmentCalendarInput): string {
  return a.title?.trim() || (a.kind === 'ron' ? 'Remote online notarization' : a.service_key.replace(/_/g, ' '))
}

async function linkedEventId(env: Env, assignmentId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    'SELECT event_id FROM field_assignment_calendar_links WHERE assignment_id = ?',
  ).bind(assignmentId).first<{ event_id: string }>()
  return row?.event_id ?? null
}

/**
 * Creates or updates the calendar event behind an assignment, then sends the
 * invite. Returns the event id, or null when there is nothing to put on a
 * calendar yet.
 *
 * Every failure path returns rather than throws. A provider not getting an
 * invite is a worse day; an assignment failing to save because a calendar row
 * did not is a worse system. The assignment is the source of truth and must
 * never depend on this succeeding.
 */
export async function syncAssignmentToCalendar(
  env: Env,
  assignment: AssignmentCalendarInput,
): Promise<string | null> {
  // An unscheduled assignment has no time, and an invite without a time is
  // noise. It syncs the moment a date is set.
  if (!assignment.scheduled_at) return null

  try {
    const existing = await linkedEventId(env, assignment.id)
    const startsAt = assignment.scheduled_at
    const endsAt = endFor(startsAt)
    // 'field' for a site visit, 'virtual' for RON: the provider needs to know
    // whether to get in the car.
    const locationType = assignment.kind === 'ron' ? 'virtual' : 'field'

    if (existing) {
      await env.DB.prepare(
        `UPDATE calendar_events SET title = ?, starts_at = ?, ends_at = ?,
           location_type = ?, location_name = ?, address = ?, description = ?,
           vendor_user_id = ?, client_user_id = ?, status = 'confirmed'
         WHERE id = ?`,
      ).bind(
        titleOf(assignment), startsAt, endsAt,
        locationType, assignment.site_label, addressOf(assignment), assignment.notes ?? null,
        assignment.vendor_user_id, assignment.client_user_id, existing,
      ).run()
      await env.DB.prepare(
        "UPDATE field_assignment_calendar_links SET updated_at = datetime('now') WHERE assignment_id = ?",
      ).bind(assignment.id).run()
      // RESCHEDULE, not REQUEST: the dispatcher bumps SEQUENCE so the
      // provider's existing entry MOVES rather than a second one appearing
      // beside it. Getting this wrong is how calendars fill with ghosts.
      await dispatchCalendarInvites(env, { eventId: existing, transition: 'RESCHEDULE', actorUserId: assignment.assigned_by_user_id ?? null })
      return existing
    }

    const eventId = uuid()
    await env.DB.prepare(
      `INSERT INTO calendar_events (
         id, title, description, starts_at, ends_at, all_day, timezone, event_type, status,
         location_type, location_name, address,
         created_by_user_id, assigned_user_id, client_user_id, vendor_user_id, visibility
       ) VALUES (?, ?, ?, ?, ?, 0, NULL, 'field_work', 'confirmed', ?, ?, ?, ?, ?, ?, ?, 'internal')`,
    ).bind(
      eventId, titleOf(assignment), assignment.notes ?? null, startsAt, endsAt,
      locationType, assignment.site_label, addressOf(assignment),
      assignment.assigned_by_user_id ?? null, assignment.vendor_user_id,
      assignment.client_user_id, assignment.vendor_user_id,
    ).run()
    await env.DB.prepare(
      'INSERT INTO field_assignment_calendar_links (assignment_id, event_id) VALUES (?, ?)',
    ).bind(assignment.id, eventId).run()

    // CONFIRM: released work is confirmed, not a tentative hold.
    await dispatchCalendarInvites(env, { eventId, transition: 'CONFIRM', actorUserId: assignment.assigned_by_user_id ?? null })
    return eventId
  } catch (err) {
    console.error('[assignment-calendar] sync failed', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Cancels the calendar event behind an assignment. The provider's entry
 * disappears from their own calendar rather than sitting there as a job that
 * is no longer happening.
 */
export async function cancelAssignmentCalendar(env: Env, assignmentId: string, actorUserId?: string | null): Promise<void> {
  try {
    const eventId = await linkedEventId(env, assignmentId)
    if (!eventId) return
    await env.DB.prepare("UPDATE calendar_events SET status = 'cancelled' WHERE id = ?").bind(eventId).run()
    await dispatchCalendarInvites(env, { eventId, transition: 'CANCEL', actorUserId: actorUserId ?? null })
  } catch (err) {
    console.error('[assignment-calendar] cancel failed', err instanceof Error ? err.message : err)
  }
}
