-- Consultation availability: the "when are we open" model that the public
-- booking page needs and that calendar_events cannot answer on its own.
--
-- calendar_events records when a host is BUSY. Nothing in the schema declares
-- when a host is OPEN, so there is no way to render bookable times. These
-- tables supply that half: recurring weekly windows in the host's own
-- timezone, plus one-off exceptions.
--
-- The slot math itself lives in shared/availability.ts and is pure, so the
-- stored shape here is deliberately dumb: minutes from local midnight, no
-- precomputed instants. Nothing needs regenerating when a schedule is edited
-- or when daylight saving changes.
--
-- Additive-only: three new tables, nothing dropped, renamed, or retyped. The
-- Pages build and the D1 migration do not land atomically, so the schema has
-- to be readable by both the old and new worker during the deploy window.

PRAGMA foreign_keys = ON;

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
