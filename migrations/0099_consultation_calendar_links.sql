-- Where a consultation ended up on an external calendar.
--
-- Bookings write to calendar_events, which is Pinnacle's own calendar. Nothing
-- recorded which event a booking became on the HOST's Google calendar, so a
-- cancellation had no way to take it back off again. This is that mapping.
--
-- A separate table rather than a column on consultation_bookings, and that is
-- deliberate: a new table can be created with CREATE TABLE IF NOT EXISTS, so
-- this migration is re-runnable, while ALTER TABLE ADD COLUMN is not. That is
-- the same trap 0098 was written to clear, and adding a column here would put
-- it straight back.
--
-- One row per booking per provider. external_event_id goes NULL when the event
-- is removed, while the row stays as evidence that a push happened at all;
-- last_error keeps the reason a push did not land, so a host asking "why isn't
-- this on my phone" has an answer that is not a log search.

CREATE TABLE IF NOT EXISTS consultation_calendar_links (
  booking_id        TEXT NOT NULL REFERENCES consultation_bookings(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL DEFAULT 'google',
  external_event_id TEXT,
  calendar_id       TEXT,
  last_error        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (booking_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_consultation_calendar_links_event
  ON consultation_calendar_links(provider, external_event_id);
