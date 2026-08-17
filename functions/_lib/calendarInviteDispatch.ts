import type { Env } from './types'
import { uuid } from './crypto'
import { sendEmail, type EmailAttachment } from './email'
import { renderPinnacleEmailLayout } from './emailTemplates/layout'
import { logAudit } from './auditLog'
import { escapeHtml } from './email'
import {
  buildCalendarInvite,
  buildInviteDescription,
  getInviteTitle,
  inviteUid,
  materialHash,
  methodForTransition,
  statusForTransition,
  type InviteEvent,
  type InviteRecipient,
  type InviteTransition,
  type RecipientType,
} from '../../shared/calendarInvite'

// Server-side calendar-invite dispatcher. Turns a Pinnacle domain
// transition on a calendar event into per-recipient .ics invites that
// ride along the notification email. Everything here is best-effort and
// MUST NOT throw to the caller: if invite generation or send fails, the
// underlying Pinnacle workflow is unaffected.
//
// Guarantees:
//  - Idempotent: the same transition processed twice does not increment
//    SEQUENCE twice or send two invites (guarded on the calendar_invites
//    row: unchanged material hash + status => skip).
//  - Fan-out isolation: one recipient's failure never affects another.
//  - Opt-out: a recipient with calendar_invites_enabled = 0 is skipped
//    silently (no send, no error, no row mutation).

interface CalendarEventRow {
  id: string
  title: string | null
  description: string | null
  starts_at: string
  ends_at: string | null
  all_day: number
  timezone: string | null
  status: string | null
  location_type: string | null
  location_name: string | null
  address: string | null
  meeting_url: string | null
  client_user_id: string | null
  vendor_user_id: string | null
  work_order_ref?: string | null
}

interface InviteRow {
  id: string
  uid: string
  sequence: number
  last_status: string | null
  material_hash: string | null
}

function baseUrl(_env: Env): string {
  return 'https://secure.pinnaclemanagementventures.com'
}

function toInviteEvent(row: CalendarEventRow, url: string | null): InviteEvent {
  return {
    id: row.id,
    title: row.title,
    serviceName: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day === 1,
    timezone: row.timezone,
    status: row.status,
    locationType: row.location_type,
    address: row.address,
    locationName: row.location_name,
    meetingUrl: row.meeting_url,
    referenceNumber: row.work_order_ref ?? null,
    url,
  }
}

async function loadEvent(env: Env, eventId: string): Promise<CalendarEventRow | null> {
  return await env.DB.prepare(
    `SELECT id, title, description, starts_at, ends_at, all_day, timezone, status,
            location_type, location_name, address, meeting_url, client_user_id, vendor_user_id
       FROM calendar_events WHERE id = ?`,
  ).bind(eventId).first<CalendarEventRow>()
}

interface ResolvedRecipient { recipient: InviteRecipient; enabled: boolean }

async function resolveRecipients(env: Env, row: CalendarEventRow): Promise<ResolvedRecipient[]> {
  const out: ResolvedRecipient[] = []
  const seen = new Set<string>()
  const pairs: Array<{ id: string | null; type: RecipientType }> = [
    { id: row.client_user_id, type: 'CLIENT' },
    { id: row.vendor_user_id, type: 'VENDOR' },
  ]
  for (const pair of pairs) {
    if (!pair.id || seen.has(pair.id)) continue
    seen.add(pair.id)
    const user = await env.DB.prepare(
      'SELECT id, email, full_name, calendar_invites_enabled FROM users WHERE id = ?',
    ).bind(pair.id).first<{ id: string; email: string | null; full_name: string | null; calendar_invites_enabled: number }>()
    if (!user?.email) continue
    out.push({
      recipient: { id: user.id, type: pair.type, email: user.email, name: user.full_name },
      enabled: Number(user.calendar_invites_enabled ?? 1) === 1,
    })
  }
  return out
}

function toBase64(text: string): string {
  // UTF-8 safe base64 for the Resend attachment payload.
  return btoa(unescape(encodeURIComponent(text)))
}

function inviteEmailHtml(event: InviteEvent, recipientType: RecipientType, transition: InviteTransition): string {
  const description = buildInviteDescription({ event, recipientType, transition })
  const title = getInviteTitle(event, transition)
  const bodyHtml = `<p style="margin:0 0 12px"><strong>${escapeHtml(title)}</strong></p>` +
    description.split('\n').map((line) => line ? `<p style="margin:0 0 6px">${escapeHtml(line)}</p>` : '<div style="height:8px"></div>').join('')
  return renderPinnacleEmailLayout({
    preheader: title,
    eyebrow: 'Pinnacle Calendar',
    title,
    bodyHtml,
  })
}

// Map the transition to the audit action per the spec's audit vocabulary.
function auditAction(transition: InviteTransition, isNew: boolean, failed: boolean): string {
  if (failed) return 'CALENDAR_INVITE_FAILED'
  if (methodForTransition(transition) === 'CANCEL') return 'CALENDAR_INVITE_CANCELLED'
  return isNew ? 'CALENDAR_INVITE_SENT' : 'CALENDAR_INVITE_UPDATED'
}

export interface DispatchOptions {
  eventId: string
  transition: InviteTransition
  actorUserId?: string | null
  // Secure Pinnacle page for this event (work order / confirmation).
  eventUrl?: string | null
}

// The single entry point. Best-effort; returns a summary but never
// throws. Call AFTER authoritative Pinnacle state is saved.
export async function dispatchCalendarInvites(env: Env, opts: DispatchOptions): Promise<{ sent: number; skipped: number; failed: number }> {
  const summary = { sent: 0, skipped: 0, failed: 0 }
  let row: CalendarEventRow | null = null
  try {
    row = await loadEvent(env, opts.eventId)
  } catch (err) {
    console.error('[calendar-invite] event load failed', err)
    return summary
  }
  if (!row) return summary

  const url = opts.eventUrl ?? `${baseUrl(env)}/calendar?event=${encodeURIComponent(row.id)}`
  const event = toInviteEvent(row, url)

  let recipients: ResolvedRecipient[] = []
  try { recipients = await resolveRecipients(env, row) } catch (err) { console.error('[calendar-invite] recipient resolve failed', err); return summary }

  for (const { recipient, enabled } of recipients) {
    // Per-recipient isolation: one failure never affects another.
    try {
      if (!enabled) { summary.skipped++; continue }

      const method = methodForTransition(opts.transition)
      const status = statusForTransition(opts.transition)
      const hash = materialHash(event, status)
      const uid = inviteUid(event.id, recipient.type, recipient.id)

      const existing = await env.DB.prepare(
        'SELECT id, uid, sequence, last_status, material_hash FROM calendar_invites WHERE pmv_event_id = ? AND recipient_id = ?',
      ).bind(event.id, recipient.id).first<InviteRow>()

      let sequence = 0
      let isNew = false
      if (existing) {
        // Idempotency: identical material + status as last send -> the
        // domain event is a duplicate. Do not increment or re-send.
        if (existing.material_hash === hash && existing.last_status === status) {
          summary.skipped++
          continue
        }
        sequence = existing.sequence + 1
      } else {
        isNew = true
        sequence = 0
      }

      const { ics } = buildCalendarInvite({ event, recipient, method, sequence, status, transition: opts.transition })
      const attachment: EmailAttachment = {
        filename: 'invite.ics',
        content: toBase64(ics),
        content_type: `text/calendar; method=${method}; charset=UTF-8`,
      }

      // Upsert the row BEFORE the send so idempotency holds even if the
      // send is retried; mark PENDING then flip to SENT/FAILED.
      const now = new Date().toISOString()
      if (existing) {
        await env.DB.prepare(
          `UPDATE calendar_invites SET sequence = ?, last_method = ?, last_status = ?, material_hash = ?,
              last_sent_at = ?, send_status = 'PENDING', updated_at = ? WHERE id = ?`,
        ).bind(sequence, method, status, hash, now, now, existing.id).run()
      } else {
        await env.DB.prepare(
          `INSERT INTO calendar_invites (id, pmv_event_id, recipient_id, recipient_type, uid, sequence,
              last_method, last_status, material_hash, last_sent_at, send_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        ).bind(uuid(), event.id, recipient.id, recipient.type, uid, sequence, method, status, hash, now).run()
      }

      let sendOk = true
      try {
        await sendEmail(env, {
          to: recipient.email,
          subject: getInviteTitle(event, opts.transition),
          html: inviteEmailHtml(event, recipient.type, opts.transition),
          text: buildInviteDescription({ event, recipientType: recipient.type, transition: opts.transition }),
          attachments: [attachment],
          headers: { 'Content-Class': 'urn:content-classes:calendarmessage' },
          idempotencyKey: `cal-invite-${uid}-${sequence}`,
        })
      } catch (err) {
        sendOk = false
        console.error('[calendar-invite] send failed', err)
      }

      await env.DB.prepare(
        `UPDATE calendar_invites SET send_status = ?, last_error_code = ? WHERE pmv_event_id = ? AND recipient_id = ?`,
      ).bind(sendOk ? 'SENT' : 'FAILED', sendOk ? null : 'send_failed', event.id, recipient.id).run()

      if (sendOk) summary.sent++; else summary.failed++
      try {
        await logAudit(env, {
          actorUserId: opts.actorUserId ?? null,
          action: auditAction(opts.transition, isNew, !sendOk),
          entityType: 'calendar_invite',
          entityId: event.id,
          after: { recipient_type: recipient.type, sequence, method, status },
        })
      } catch { /* audit is best-effort */ }
    } catch (err) {
      summary.failed++
      console.error('[calendar-invite] recipient dispatch failed', err)
    }
  }
  return summary
}
