-- Calendar invites: iCalendar (.ics) invitations attached to the
-- notification emails Pinnacle already sends. No OAuth, no provider
-- APIs, no account linking. Pinnacle Calendar (calendar_events) stays
-- the operational source of truth; the invite is supplemental.
--
-- Additive-only: one new table + one nullable-with-default column.
-- Nothing dropped, renamed, or retyped — the Pages build and the DB
-- migration do not land atomically, so the schema must be forward- and
-- backward-compatible across the deploy window.

-- One row per (event, recipient). The deterministic UID lets the
-- recipient's calendar mutate the SAME event in place across the
-- request -> confirmed -> rescheduled -> cancelled lifecycle: same UID,
-- higher SEQUENCE, updated in place. Never a new UID for an event that
-- already has one.
CREATE TABLE calendar_invites (
  id                TEXT PRIMARY KEY,
  pmv_event_id      TEXT NOT NULL,                 -- calendar_events.id
  recipient_id      TEXT NOT NULL,                 -- users.id (client or vendor)
  recipient_type    TEXT NOT NULL                  -- CLIENT | VENDOR
                      CHECK (recipient_type IN ('CLIENT','VENDOR')),
  uid               TEXT NOT NULL,                 -- deterministic, immutable
  sequence          INTEGER NOT NULL DEFAULT 0,    -- monotonic; +1 only on material change
  last_method       TEXT                           -- REQUEST | CANCEL
                      CHECK (last_method IS NULL OR last_method IN ('REQUEST','CANCEL')),
  last_status       TEXT                           -- TENTATIVE | CONFIRMED | CANCELLED
                      CHECK (last_status IS NULL OR last_status IN ('TENTATIVE','CONFIRMED','CANCELLED')),
  -- Hash of the material fields (start, end, all-day, title, location,
  -- status) at last send. SEQUENCE increments only when this changes,
  -- so editing an internal note never emits an invite update.
  material_hash     TEXT,
  last_sent_at      TEXT,
  send_status       TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (send_status IN ('SENT','PENDING','FAILED')),
  last_error_code   TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Idempotency guard: a domain event processed twice must not create two
-- rows or double-increment SEQUENCE.
CREATE UNIQUE INDEX uniq_calendar_invites_event_recipient
  ON calendar_invites(pmv_event_id, recipient_id);
CREATE INDEX idx_calendar_invites_event ON calendar_invites(pmv_event_id);
CREATE INDEX idx_calendar_invites_recipient ON calendar_invites(recipient_id);
CREATE INDEX idx_calendar_invites_send_status ON calendar_invites(send_status);

-- Per-user opt-out (default ON). This is the entire settings surface:
-- one toggle in Client and Vendor portal settings. No connection flow,
-- no provider selection.
ALTER TABLE users ADD COLUMN calendar_invites_enabled INTEGER NOT NULL DEFAULT 1;
