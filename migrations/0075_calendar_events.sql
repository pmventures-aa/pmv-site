-- Unified Pinnacle Calendar event store.
--
-- The existing `appointments` table stays authoritative for the legacy
-- client "request an appointment" flow, and `planned_calls` stays the
-- source for requested calls. This table is the canonical store for the
-- unified Calendar/Scheduling platform: any scheduled occurrence that is
-- not represented by a row in a domain table (task, invoice, envelope,
-- field assignment, milestone) lives here, carrying optional links back
-- to the domain records it belongs to.
--
-- Derived calendar entries (task due dates, invoice due dates, signature
-- deadlines, matter deadlines, field visits, milestone targets, planned
-- calls) are NOT stored here — they are computed at read time from their
-- authoritative tables by functions/_lib/calendarQuery.ts so state is
-- never duplicated.
--
-- Scoping model:
--   * visibility = 'client'  -> shown in a client's portal calendar when
--     client_user_id matches (client_visible mirror kept for fast queries).
--   * visibility = 'internal'-> staff/admin only; never exposed to clients.
--   * client_user_id is nullable because internal team events have no
--     client. Row-level access is enforced in code via calendarQuery's
--     role-aware WHERE builder, NOT by trusting any client-supplied id.

PRAGMA foreign_keys = ON;

CREATE TABLE calendar_events (
  id                   TEXT PRIMARY KEY,
  title                TEXT NOT NULL,
  description          TEXT,
  starts_at            TEXT NOT NULL,             -- ISO / UTC (matches appointments.starts_at convention)
  ends_at              TEXT,                      -- ISO / UTC; null -> default duration at read time
  all_day              INTEGER NOT NULL DEFAULT 0,
  timezone             TEXT,                      -- IANA name when known, else null (local wall time)
  event_type           TEXT NOT NULL DEFAULT 'appointment',
  status               TEXT NOT NULL DEFAULT 'proposed',  -- proposed | confirmed | completed | cancelled
  location_type        TEXT,                      -- virtual | phone | office | field | client_location | other
  location_name        TEXT,
  address              TEXT,
  meeting_url          TEXT,
  phone_number         TEXT,
  recurrence_rule      TEXT,                      -- RFC 5545 RRULE when recurring (not yet expanded)
  recurrence_parent_id TEXT,

  created_by_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  client_user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
  matter_id            TEXT REFERENCES matters(id) ON DELETE SET NULL,
  business_id          TEXT REFERENCES relationship_businesses(party_id) ON DELETE SET NULL,
  property_id          TEXT REFERENCES properties(id) ON DELETE SET NULL,
  vendor_user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  task_id              TEXT REFERENCES client_tasks(id) ON DELETE SET NULL,
  invoice_id           TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  envelope_id          TEXT REFERENCES envelopes(id) ON DELETE SET NULL,
  document_id          TEXT REFERENCES client_documents(id) ON DELETE SET NULL,

  visibility           TEXT NOT NULL DEFAULT 'client',  -- client | internal
  client_visible       INTEGER NOT NULL DEFAULT 1,

  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_calendar_events_client ON calendar_events(client_user_id, starts_at);
CREATE INDEX idx_calendar_events_assigned ON calendar_events(assigned_user_id, starts_at);
CREATE INDEX idx_calendar_events_matter ON calendar_events(matter_id);
CREATE INDEX idx_calendar_events_vendor ON calendar_events(vendor_user_id, starts_at);
CREATE INDEX idx_calendar_events_type ON calendar_events(event_type, starts_at);
