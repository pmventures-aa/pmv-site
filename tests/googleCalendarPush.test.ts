import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const push = read('../functions/_lib/googleCalendarPush.ts')
const booking = read('../functions/_lib/routes/consultationBooking.ts')
const migration = read('../migrations/0099_consultation_calendar_links.sql')

// The Google integration read the host's calendar to decide what was bookable
// but never wrote back, so a confirmed booking existed only inside HQ. These
// guard the write direction and the property that matters most about it: it
// can fail without costing anyone their booking.

describe('a booking reaches the host calendar', () => {
  it('creates the event on the connected calendar', () => {
    expect(push).toContain('https://www.googleapis.com/calendar/v3/calendars')
    expect(push).toContain("method: 'POST'")
    expect(push).toContain('googleAccessTokenFor(env, hostUserId)')
  })

  it('is wired into the booking route after the write, not inside it', () => {
    expect(booking).toContain('pushConsultationToGoogle(c.env, row.host_user_id')
    const writeAt = booking.indexOf('INSERT INTO consultation_bookings')
    const pushAt = booking.indexOf('pushConsultationToGoogle(c.env')
    expect(writeAt).toBeGreaterThan(-1)
    expect(pushAt).toBeGreaterThan(writeAt)
  })

  it('marks the hour busy so the availability engine blocks it next read', () => {
    expect(push).toContain("transparency: 'opaque'")
  })

  it('sends the slot with its timezone rather than a bare instant', () => {
    expect(push).toContain('timeZone: input.timezone')
  })
})

describe('the push cannot cost anyone a booking', () => {
  it('returns instead of throwing on every failure path', () => {
    // No throw anywhere in the module: the caller awaits it directly, so a
    // throw here would surface as a failed booking for the visitor.
    expect(push).not.toMatch(/\bthrow\b/)
  })

  it('gives up rather than hanging the request', () => {
    expect(push).toContain('REQUEST_TIMEOUT_MS')
    expect(push).toContain('controller.abort()')
  })

  it('records why a push did not land', () => {
    expect(push).toContain('last_error')
    expect(push).toContain("error: 'not connected'")
  })

  it('does nothing at all when the schedule has no host', () => {
    expect(push).toContain('if (!hostUserId) return null')
  })
})

describe('the visitor is not invited by Google', () => {
  it('adds no attendees', () => {
    // Google mails attendees on its own schedule. The app already sent a
    // confirmation, and the address is unverified, so two is wrong.
    expect(push).not.toContain('attendees')
    expect(push).not.toContain('sendUpdates')
  })

  it('carries their details in the description instead', () => {
    expect(push).toContain('Booked online by ${input.contactName} <${input.email}>')
    expect(push).toContain('Topic: ${input.topic}')
  })
})

describe('cancelling takes it back off', () => {
  it('deletes the event and clears the stored id', () => {
    expect(push).toContain("method: 'DELETE'")
    expect(push).toContain('external_event_id = NULL')
  })

  it('treats an already-gone event as done', () => {
    expect(push).toContain('res.status !== 404 && res.status !== 410')
  })

  it('is called from the cancel route with the schedule host', () => {
    expect(booking).toContain('removeConsultationFromGoogle(c.env, row.host_user_id, row.id)')
    expect(booking).toContain('LEFT JOIN availability_schedules s ON s.id = b.schedule_id')
  })
})

describe('the mapping table stays re-runnable', () => {
  it('is a new table, not a new column', () => {
    // ALTER TABLE ADD COLUMN is the statement that cannot repeat; 0098 exists
    // to clear exactly that trap and a column here would restore it.
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS consultation_calendar_links')
    // Comments stripped first: the header explains the ALTER trap it avoids,
    // and the explanation must not read as the statement itself.
    const statements = migration
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
    expect(statements).not.toMatch(/\bALTER\s+TABLE\b/i)
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS')
  })

  it('holds one row per booking per provider', () => {
    expect(migration).toContain('PRIMARY KEY (booking_id, provider)')
    expect(push).toContain('ON CONFLICT(booking_id, provider) DO UPDATE SET')
  })
})
