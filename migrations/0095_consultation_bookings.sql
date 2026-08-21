-- Consultation bookings taken from the public site.
--
-- Three records are written per booking and each has a distinct job:
--   * calendar_events  -> the operational occurrence staff work from
--   * contact_inquiries -> the CRM lead, same as every other public funnel
--   * this table        -> the booking itself: who booked, which slot, which
--                          schedule, and the tokens that let them manage it
--                          without an account
--
-- Keeping the booking separate from calendar_events means a visitor with no
-- account still has a durable record to cancel or reschedule against, and the
-- calendar row stays a plain calendar row.
--
-- Additive-only: one new table. Nothing dropped, renamed, or retyped.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS consultation_bookings (
  id                   TEXT PRIMARY KEY,
  -- Unguessable handle used in confirmation links. Deliberately separate from
  -- id so a public URL never exposes an internal identifier.
  public_token         TEXT NOT NULL UNIQUE,

  schedule_id          TEXT REFERENCES availability_schedules(id) ON DELETE SET NULL,
  calendar_event_id    TEXT REFERENCES calendar_events(id) ON DELETE SET NULL,
  inquiry_id           TEXT REFERENCES contact_inquiries(id) ON DELETE SET NULL,

  -- Who booked. An email here is UNVERIFIED: anyone can type any address into
  -- the public form. matched_user_id records that the address happens to
  -- belong to an existing account, but the booking is never made visible in
  -- that account's portal on the strength of an unverified match. Staff link
  -- it deliberately.
  contact_name         TEXT NOT NULL,
  email                TEXT NOT NULL,
  phone                TEXT,
  topic                TEXT,
  matched_user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,

  starts_at            TEXT NOT NULL,             -- UTC ISO
  ends_at              TEXT NOT NULL,             -- UTC ISO
  -- Schedule timezone at time of booking, so a later schedule edit does not
  -- silently rewrite what the visitor was shown.
  timezone             TEXT NOT NULL,

  status               TEXT NOT NULL DEFAULT 'booked'
                         CHECK (status IN ('booked','cancelled','completed','no_show')),
  cancelled_at         TEXT,
  cancelled_reason     TEXT,

  -- Video conference details, filled once meeting generation is wired up.
  -- meeting_url is the JOIN url and is safe to email to the attendee.
  -- The provider's host/start url is a bearer credential and is deliberately
  -- NOT stored: it must never reach a template, an ICS invite, or a log.
  meeting_provider     TEXT,                      -- e.g. 'zoom'
  meeting_external_id  TEXT,                      -- provider's meeting id, for update/cancel
  meeting_url          TEXT,

  created_ip           TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_consultation_bookings_slot ON consultation_bookings(schedule_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_consultation_bookings_email ON consultation_bookings(email, created_at);
CREATE INDEX IF NOT EXISTS idx_consultation_bookings_status ON consultation_bookings(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_consultation_bookings_event ON consultation_bookings(calendar_event_id);
