-- Field assignments become calendar events, so providers get real invites.
--
-- Why a link table instead of a column on calendar_events: SQLite has no
-- ADD COLUMN IF NOT EXISTS, so an ALTER makes the migration un-re-runnable -
-- the exact trap 0094-0097 fell into and 0098 had to rebuild. 0099 solved the
-- same problem the same way for consultation bookings; this follows it.
--
-- One event per assignment. The calendar event carries the schedule, the
-- assignment carries the work, and the invite machinery already knows how to
-- turn a calendar event into an .ics for a VENDOR recipient.

CREATE TABLE IF NOT EXISTS field_assignment_calendar_links (
  assignment_id TEXT PRIMARY KEY REFERENCES field_assignments(id) ON DELETE CASCADE,
  event_id      TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_field_assignment_calendar_links_event
  ON field_assignment_calendar_links(event_id);
