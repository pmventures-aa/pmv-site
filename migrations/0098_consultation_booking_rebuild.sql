-- Consultation booking schema, rebuilt as one migration that is safe to run
-- against a database in any prior state.
--
-- 0094 through 0097 built this feature in four steps. Three of them were
-- already re-runnable, but 0097 was a bare
--   ALTER TABLE consultation_bookings ADD COLUMN meeting_format ...
-- and SQLite has no ADD COLUMN IF NOT EXISTS. That made the set order- and
-- state-dependent: apply the schema by hand in the D1 console (the only route
-- available without wrangler credentials) and the next `db:migrate` would hit
-- 0097 and abort on a duplicate column, leaving the run half-finished.
--
-- So the four steps are regressed to no-ops and restated here in their final
-- shape, using only statements that no-op when the object already exists. The
-- effect is that this file alone is the whole feature: it can be pasted into
-- the D1 console today, and a later `wrangler d1 migrations apply` still runs
-- 0094 through 0098 end to end without erroring on anything it finds already
-- in place.
--
-- Additive-only. Nothing here drops, renames, or retypes an existing object,
-- and no statement discards a row.
--
-- One state this cannot repair on its own: a database that applied 0095 but
-- never applied 0097, so consultation_bookings exists WITHOUT meeting_format.
-- CREATE TABLE IF NOT EXISTS below correctly leaves that table alone, and
-- SQLite offers no conditional column add to finish the job. Production never
-- reached that state (it was still at 0093 when this was written); a local
-- development database that did is fixed with either a reset or one statement:
--   ALTER TABLE consultation_bookings ADD COLUMN meeting_format TEXT
--     CHECK (meeting_format IS NULL OR meeting_format IN ('virtual','phone'));

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Availability (was 0094)
--
-- calendar_events records when a host is BUSY. Nothing in the schema declares
-- when a host is OPEN, so there is no way to render bookable times. These
-- tables supply that half: recurring weekly windows in the host's own
-- timezone, plus one-off exceptions.
--
-- The slot math lives in shared/availability.ts and is pure, so the stored
-- shape is deliberately dumb: minutes from local midnight, no precomputed
-- instants. Nothing needs regenerating when a schedule is edited or when
-- daylight saving changes.
-- ---------------------------------------------------------------------------

-- One bookable offering. The public consultation page reads the schedule with
-- slug = 'consultation'; more can be added later (intake call, STR walkthrough)
-- without a schema change.
CREATE TABLE IF NOT EXISTS availability_schedules (
  id                     TEXT PRIMARY KEY,
  slug                   TEXT NOT NULL UNIQUE,
  name                   TEXT NOT NULL,
  description            TEXT,

  -- Who the meeting is with. Null means "unassigned" — the booking still lands
  -- in the shared calendar and staff triage it.
  host_user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,

  -- IANA name. Windows below are wall-clock minutes in THIS zone; changing it
  -- moves every window, which is the intended behaviour when a host relocates.
  timezone               TEXT NOT NULL DEFAULT 'America/New_York',

  slot_minutes           INTEGER NOT NULL DEFAULT 60,
  -- Distance between slot start times. Equal to slot_minutes for back-to-back
  -- slots, smaller to offer overlapping start times.
  increment_minutes      INTEGER NOT NULL DEFAULT 30,
  buffer_before_minutes  INTEGER NOT NULL DEFAULT 0,
  buffer_after_minutes   INTEGER NOT NULL DEFAULT 15,
  -- Earliest and latest a visitor may book, relative to now.
  min_notice_minutes     INTEGER NOT NULL DEFAULT 1440,
  max_advance_days       INTEGER NOT NULL DEFAULT 60,

  -- calendar_events.event_type written when a booking is taken.
  event_type             TEXT NOT NULL DEFAULT 'consultation',
  -- calendar_events.location_type. 'virtual' is what makes a booking eligible
  -- for a generated meeting link.
  location_type          TEXT NOT NULL DEFAULT 'virtual',

  -- Whether the unauthenticated booking page may offer this schedule at all.
  -- Off by default so a half-configured schedule is never publicly bookable.
  public_bookable        INTEGER NOT NULL DEFAULT 0,
  active                 INTEGER NOT NULL DEFAULT 1,

  created_by_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_availability_schedules_host ON availability_schedules(host_user_id);
CREATE INDEX IF NOT EXISTS idx_availability_schedules_public ON availability_schedules(public_bookable, active);

-- Recurring weekly openings. Several rows per weekday are allowed (a morning
-- block and an afternoon block); the engine merges overlaps at read time so a
-- sloppy edit cannot produce duplicate slots.
CREATE TABLE IF NOT EXISTS availability_windows (
  id            TEXT PRIMARY KEY,
  schedule_id   TEXT NOT NULL REFERENCES availability_schedules(id) ON DELETE CASCADE,
  -- 0 = Sunday ... 6 = Saturday, in the schedule's timezone.
  weekday       INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  -- Minutes from local midnight. end_minute may be 1440 for a window that
  -- runs to midnight.
  start_minute  INTEGER NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute    INTEGER NOT NULL CHECK (end_minute > 0 AND end_minute <= 1440),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (end_minute > start_minute)
);

CREATE INDEX IF NOT EXISTS idx_availability_windows_schedule ON availability_windows(schedule_id, weekday);

-- One-off removals: holidays, vacation, a blocked afternoon. Stored as
-- absolute UTC instants rather than wall time, so an exception keeps meaning
-- the same span even if the schedule's timezone is edited afterwards.
CREATE TABLE IF NOT EXISTS availability_blackouts (
  id                 TEXT PRIMARY KEY,
  schedule_id        TEXT NOT NULL REFERENCES availability_schedules(id) ON DELETE CASCADE,
  starts_at          TEXT NOT NULL,
  ends_at            TEXT NOT NULL,
  reason             TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_availability_blackouts_schedule ON availability_blackouts(schedule_id, starts_at);

-- ---------------------------------------------------------------------------
-- Bookings (was 0095, plus the 0097 column folded in)
--
-- Three records are written per booking and each has a distinct job:
--   * calendar_events   -> the operational occurrence staff work from
--   * contact_inquiries -> the CRM lead, same as every other public funnel
--   * this table        -> the booking itself: who booked, which slot, which
--                          schedule, and the token that lets them manage it
--                          without an account
--
-- Keeping the booking separate from calendar_events means a visitor with no
-- account still has a durable record to cancel or reschedule against, and the
-- calendar row stays a plain calendar row.
-- ---------------------------------------------------------------------------

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

  -- How the consultation happens. Nullable with no default on purpose: rows
  -- written before the visitor was ever asked predate the choice, and writing
  -- 'virtual' into them would assert something that was never asked. Readers
  -- treat NULL as "whatever the schedule said at the time".
  meeting_format       TEXT
                         CHECK (meeting_format IS NULL OR meeting_format IN ('virtual','phone')),

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

-- ---------------------------------------------------------------------------
-- Client notification eyebrow (was 0096)
--
-- notify_* rows in hq_email_templates were seeded before those rows drove
-- anything client-facing, so every one of them carries the staff eyebrow
-- "Pinnacle HQ notification". Client notifications now read these rows, and a
-- client receiving mail labelled that way reads as internal mail leaking out.
--
-- Only rows still carrying the exact seeded default are touched, which is also
-- what makes the statement re-runnable: a second pass matches nothing. If
-- someone has already edited the eyebrow, theirs is left alone rather than
-- being overwritten by a migration they did not ask for.
-- ---------------------------------------------------------------------------

UPDATE hq_email_templates
   SET eyebrow = 'Your Pinnacle relationship',
       updated_at = datetime('now')
 WHERE slug LIKE 'notify\_%' ESCAPE '\'
   AND eyebrow = 'Pinnacle HQ notification'
   AND substr(slug, 8) IN (
     SELECT event_key FROM notification_event_catalog WHERE audience = 'client'
   );
