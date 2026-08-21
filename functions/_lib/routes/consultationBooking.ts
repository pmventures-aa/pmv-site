// Consultation booking: the public write path.
//
//   consultationBookingPublicRoutes -> mounted at '/'      (book, look up, cancel)
//   consultationBookingAdminRoutes  -> mounted at '/admin' (HQ booking list)
//
// Reading availability lives in ./availability. This file only takes bookings,
// which is the surface that actually writes on behalf of an anonymous caller,
// so the guards live here:
//
//   * Per-IP throttle, because the endpoint creates rows without an account.
//   * The submitted slot is re-derived from the schedule at write time. A slot
//     list goes stale between render and submit, and the submitted time is
//     attacker-controlled regardless, so the only trustworthy check is
//     "would the engine generate this exact instant right now".
//   * A booked email address is UNVERIFIED. It is recorded, and matched
//     against existing accounts for staff convenience, but a match never
//     grants portal visibility: otherwise anyone could inject events into a
//     stranger's calendar by typing their address.
//   * Cancellation is authorized by an unguessable token, never by email
//     address or booking id.

import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { requireStaff } from '../mid'
import { uuid } from '../crypto'
import { actorGeo, actorIp, actorUserAgent, logAudit } from '../auditLog'
import { notifyStaff, escapeHtml, sendEmail } from '../email'
import { renderRelationshipEvent } from '../emailTemplates/relationship'
import { PUBLIC_SITE_BASE } from '../scopeFunnel'
import { isSlotBookable } from '../../../shared/availability'
import { loadScheduleRow, loadSchedule, loadBusyIntervals } from './availability'

export const consultationBookingPublicRoutes = new Hono<AppEnv>()
export const consultationBookingAdminRoutes = new Hono<AppEnv>()

const CONSULTATION_SLUG = 'consultation'
// Bookings create rows for an anonymous caller, so this is tighter than the
// scope funnel's read-mostly limit.
const MAX_BOOKINGS_PER_HOUR = 6

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

async function throttled(env: Env, ip: string): Promise<boolean> {
  const key = `consult-book:${ip}`
  try {
    const count = Number((await env.SESSIONS.get(key)) || 0)
    if (count >= MAX_BOOKINGS_PER_HOUR) return true
    await env.SESSIONS.put(key, String(count + 1), { expirationTtl: 3600 })
    return false
  } catch {
    // A KV blip must not take the booking form offline.
    return false
  }
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return { first: full, last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

// Human-readable local time for emails and staff notifications.
function localLabel(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

interface BookingBody {
  startsAt?: unknown
  name?: unknown
  email?: unknown
  phone?: unknown
  topic?: unknown
}

consultationBookingPublicRoutes.post('/consultation/book', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  if (await throttled(c.env, ip)) {
    return c.json({ error: 'Too many booking attempts. Call (561) 388-7879 if this is urgent.' }, 429)
  }

  const body = (await c.req.json().catch(() => ({}))) as BookingBody
  const name = clean(body.name, 120)
  const email = clean(body.email, 200).toLowerCase()
  const phone = clean(body.phone, 40)
  const topic = clean(body.topic, 1000)
  const startsAt = clean(body.startsAt, 40)

  if (!name) return c.json({ error: 'Enter your name' }, 400)
  if (!emailOk(email)) return c.json({ error: 'Enter a valid email address' }, 400)
  if (!startsAt || Number.isNaN(Date.parse(startsAt))) return c.json({ error: 'Choose a time' }, 400)

  const row = await loadScheduleRow(c.env, CONSULTATION_SLUG)
  if (!row || !row.active || !row.public_bookable) {
    return c.json({ error: 'Online booking is not available right now. Call (561) 388-7879 and we will find a time.' }, 409)
  }

  const schedule = await loadSchedule(c.env, row)
  const startMs = Date.parse(startsAt)
  const startIso = new Date(startMs).toISOString()
  const endIso = new Date(startMs + schedule.slotMinutes * 60_000).toISOString()

  // Re-derive rather than trust. Covers a stale slot list, a concurrent
  // booking, and a hand-crafted request asking for 3am.
  const bounds = {
    from: new Date(startMs - 2 * 86_400_000).toISOString(),
    to: new Date(startMs + 2 * 86_400_000).toISOString(),
  }
  const busy = await loadBusyIntervals(c.env, row, bounds.from, bounds.to)
  if (!isSlotBookable(schedule, busy, startIso, Date.now())) {
    return c.json({ error: 'That time is no longer available. Pick another slot.', code: 'slot_taken' }, 409)
  }

  const { first, last } = splitName(name)
  // Recorded for staff, never used to grant visibility: the address is not
  // verified at this point.
  const matched = await c.env.DB.prepare(
    'SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1',
  ).bind(email).first<{ id: string }>()

  const bookingId = uuid()
  const publicToken = uuid()
  const eventId = uuid()
  const inquiryId = uuid()
  const whenLabel = localLabel(startIso, schedule.timezone)

  await c.env.DB.batch([
    // The calendar row staff work from. Internal until someone confirms it, so
    // an unverified email can never surface an event in a client's portal.
    c.env.DB.prepare(
      `INSERT INTO calendar_events
         (id, title, description, starts_at, ends_at, all_day, timezone, event_type, status,
          location_type, visibility, client_visible, assigned_user_id)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'proposed', ?, 'internal', 0, ?)`,
    ).bind(
      eventId,
      `Consultation: ${name}`,
      [topic ? `Topic: ${topic}` : '', `Booked online by ${name} <${email}>${phone ? ` (${phone})` : ''}`]
        .filter(Boolean).join('\n\n'),
      startIso, endIso, schedule.timezone, row.event_type, row.location_type, row.host_user_id,
    ),
    // The CRM lead, same shape every other public funnel produces.
    c.env.DB.prepare(
      `INSERT INTO contact_inquiries
         (id, name, email, phone, service_key, message, source, lifecycle_stage, first_name, last_name, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, 'consultation_booking', 'lead', ?, ?, datetime('now'))`,
    ).bind(inquiryId, name, email, phone || null, topic || `Consultation booked for ${whenLabel}`, first, last),
    c.env.DB.prepare(
      `INSERT INTO consultation_bookings
         (id, public_token, schedule_id, calendar_event_id, inquiry_id, contact_name, email, phone,
          topic, matched_user_id, starts_at, ends_at, timezone, created_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      bookingId, publicToken, row.id, eventId, inquiryId, name, email, phone || null,
      topic || null, matched?.id ?? null, startIso, endIso, schedule.timezone, ip,
    ),
  ])

  const manageUrl = `${PUBLIC_SITE_BASE}/consultation/booking?ref=${encodeURIComponent(publicToken)}`

  // Delivery is best-effort: a mail outage must not lose a confirmed booking.
  const confirmation = renderRelationshipEvent({
    eventKey: 'consultation_booked',
    firstName: first,
    subject: `Your consultation is booked for ${whenLabel}`,
    preheader: 'Time, duration, and how to change it.',
    eyebrow: 'Consultation booked',
    title: 'Your consultation is on the calendar',
    body: `You are booked for ${whenLabel}. The call is scheduled for ${schedule.slotMinutes} minutes.\n\n`
      + `${topic ? `You told us you wanted to cover: ${topic}\n\n` : ''}`
      + 'We will send joining details before the call. Use the link below if you need to cancel or you booked the wrong time.',
    ctaLabel: 'Manage My Booking',
    ctaUrl: manageUrl,
  })

  await Promise.allSettled([
    sendEmail(c.env, {
      to: email,
      subject: confirmation.subject,
      html: confirmation.html,
      text: confirmation.text,
      replyTo: 'orders@pinnaclemanagementventures.com',
      idempotencyKey: `consultation-booked-${publicToken}`,
      tags: [{ name: 'category', value: 'consultation' }],
    }),
    notifyStaff(c.env, {
      staffUserIds: row.host_user_id ? [row.host_user_id] : [],
      kind: 'consultation_booked',
      subject: `New consultation: ${name} on ${whenLabel}`,
      html: `<p><strong>${escapeHtml(name)}</strong> booked a consultation.</p>`
        + `<p>When: ${escapeHtml(whenLabel)}<br>Email: ${escapeHtml(email)}`
        + `${phone ? `<br>Phone: ${escapeHtml(phone)}` : ''}</p>`
        + `${topic ? `<p>Topic: ${escapeHtml(topic)}</p>` : ''}`,
      fallbackMode: 'no_recipients',
    }),
  ])

  await logAudit(c.env, {
    actorUserId: null,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'consultation_booked',
    entityType: 'consultation_booking',
    entityId: bookingId,
    after: { startsAt: startIso, scheduleId: row.id },
  }).catch(() => {})

  return c.json({
    booking: {
      ref: publicToken,
      startsAt: startIso,
      endsAt: endIso,
      timezone: schedule.timezone,
      whenLabel,
      manageUrl,
    },
  }, 201)
})

interface BookingRow {
  public_token: string
  contact_name: string
  email: string
  topic: string | null
  starts_at: string
  ends_at: string
  timezone: string
  status: string
  meeting_url: string | null
}

// Look up a booking by its token. Returns only what the person who booked
// already knows, so a guessed token leaks nothing new about anyone else.
consultationBookingPublicRoutes.get('/consultation/booking/:ref', async (c) => {
  const ref = c.req.param('ref') ?? ''
  const row = await c.env.DB.prepare(
    `SELECT public_token, contact_name, email, topic, starts_at, ends_at, timezone, status, meeting_url
       FROM consultation_bookings WHERE public_token = ?`,
  ).bind(ref).first<BookingRow>()
  if (!row) return c.json({ error: 'Booking not found' }, 404)

  return c.json({
    booking: {
      ref: row.public_token,
      name: row.contact_name,
      topic: row.topic,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      timezone: row.timezone,
      status: row.status,
      whenLabel: localLabel(row.starts_at, row.timezone),
      // Only ever the join url. The provider's host url is never stored.
      meetingUrl: row.status === 'booked' ? row.meeting_url : null,
    },
  })
})

consultationBookingPublicRoutes.post('/consultation/booking/:ref/cancel', async (c) => {
  const ref = c.req.param('ref') ?? ''
  const row = await c.env.DB.prepare(
    `SELECT id, calendar_event_id, contact_name, email, starts_at, timezone, status
       FROM consultation_bookings WHERE public_token = ?`,
  ).bind(ref).first<{ id: string; calendar_event_id: string | null; contact_name: string; email: string; starts_at: string; timezone: string; status: string }>()
  if (!row) return c.json({ error: 'Booking not found' }, 404)
  // Cancelling an already-cancelled booking is a no-op, not an error: the
  // visitor may simply have hit the link twice.
  if (row.status === 'cancelled') return c.json({ ok: true, status: 'cancelled' })
  if (row.status !== 'booked') return c.json({ error: 'This booking can no longer be cancelled online.' }, 409)

  const body = (await c.req.json().catch(() => ({}))) as { reason?: unknown }
  const reason = clean(body.reason, 300)

  const statements = [
    c.env.DB.prepare(
      `UPDATE consultation_bookings
          SET status = 'cancelled', cancelled_at = datetime('now'), cancelled_reason = ?, updated_at = datetime('now')
        WHERE id = ?`,
    ).bind(reason || null, row.id),
  ]
  if (row.calendar_event_id) {
    // Cancel rather than delete, so the slot frees up while the history stays.
    statements.push(
      c.env.DB.prepare(
        "UPDATE calendar_events SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?",
      ).bind(row.calendar_event_id),
    )
  }
  await c.env.DB.batch(statements)

  await notifyStaff(c.env, {
    staffUserIds: [],
    kind: 'consultation_cancelled',
    subject: `Consultation cancelled: ${row.contact_name}`,
    html: `<p><strong>${escapeHtml(row.contact_name)}</strong> cancelled their consultation on `
      + `${escapeHtml(localLabel(row.starts_at, row.timezone))}.</p>`
      + `${reason ? `<p>Reason: ${escapeHtml(reason)}</p>` : ''}`,
    fallbackMode: 'no_recipients',
  }).catch(() => {})

  await logAudit(c.env, {
    actorUserId: null,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'consultation_cancelled',
    entityType: 'consultation_booking',
    entityId: row.id,
    before: { status: row.status },
    after: { status: 'cancelled', reason: reason || null },
  }).catch(() => {})

  return c.json({ ok: true, status: 'cancelled' })
})

// ---------------------------------------------------------------------------
// Admin: what has been booked
// ---------------------------------------------------------------------------

consultationBookingAdminRoutes.get('/consultation/bookings', requireStaff, async (c) => {
  const status = c.req.query('status')
  const allowed = ['booked', 'cancelled', 'completed', 'no_show']
  const where = status && allowed.includes(status) ? 'WHERE b.status = ?' : ''
  const params = where ? [status] : []

  const { results } = await c.env.DB.prepare(
    `SELECT b.id, b.public_token, b.contact_name, b.email, b.phone, b.topic, b.starts_at, b.ends_at,
            b.timezone, b.status, b.meeting_url, b.matched_user_id, b.calendar_event_id, b.created_at
       FROM consultation_bookings b
       ${where}
       ORDER BY b.starts_at DESC
       LIMIT 200`,
  ).bind(...params).all<Record<string, unknown>>()

  return c.json({
    bookings: (results ?? []).map((r) => ({
      id: r.id,
      ref: r.public_token,
      name: r.contact_name,
      email: r.email,
      phone: r.phone,
      topic: r.topic,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      timezone: r.timezone,
      status: r.status,
      meetingUrl: r.meeting_url,
      matchedUserId: r.matched_user_id,
      calendarEventId: r.calendar_event_id,
      createdAt: r.created_at,
      whenLabel: localLabel(String(r.starts_at), String(r.timezone)),
    })),
  })
})
