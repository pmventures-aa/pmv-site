-- Lead conversion system (see docs/crm-expansion-design.md #3).
--
-- contact_inquiries stays the single pipeline record for a lead (matches
-- the Pipelines board already shipped). client_user_id is populated only
-- at the moment of conversion, so "converted" leads are trivially excluded
-- from the active pipeline (WHERE client_user_id IS NULL AND archived_at
-- IS NULL) without a status-string convention to keep in sync everywhere.
ALTER TABLE contact_inquiries ADD COLUMN client_user_id TEXT REFERENCES users(id);
ALTER TABLE contact_inquiries ADD COLUMN converted_at TEXT;

-- Lets a note or activity event exist against a lead before that lead is a
-- client (a users row) — both columns are nullable additions to tables
-- that already exist, so no data migration or NOT NULL relaxation needed.
-- client_user_id on both tables is already nullable and gets backfilled by
-- the conversion transaction (see design doc), which is how "transfer
-- notes ... and activity history to the client record" is satisfied
-- without physically copying rows.
ALTER TABLE internal_notes ADD COLUMN inquiry_id TEXT REFERENCES contact_inquiries(id);
ALTER TABLE activity_events ADD COLUMN inquiry_id TEXT REFERENCES contact_inquiries(id);

-- client_tasks, client_documents, and secure_messages are NOT included here
-- on purpose: client_user_id is NOT NULL on all three, and SQLite can only
-- relax a NOT NULL constraint by rebuilding the table (copy/drop/rename) —
-- too invasive to bundle into this migration. In practice this is also the
-- right behavior: secure_messages requires a logged-in client account to
-- send at all, and formal tasks/deliverable documents don't really exist
-- before someone is a client. If staff-assigned pre-conversion tasks turn
-- out to be a real need, that's a follow-up migration, not this one.

-- No inbound-email parsing exists (or is in scope) — this logs outbound
-- notification/reply emails sent through Resend so they show up in a
-- lead's or client's communication history and survive conversion the same
-- way notes/activity do.
CREATE TABLE email_log (
  id                  TEXT PRIMARY KEY,
  direction           TEXT NOT NULL DEFAULT 'outbound',
  inquiry_id          TEXT REFERENCES contact_inquiries(id),
  client_user_id      TEXT REFERENCES users(id),
  sent_by_user_id     TEXT REFERENCES users(id),
  to_address          TEXT NOT NULL,
  subject             TEXT NOT NULL,
  body                TEXT NOT NULL,
  provider_message_id TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_email_inquiry ON email_log(inquiry_id);
CREATE INDEX idx_email_client ON email_log(client_user_id);

-- One row per conversion — the "conversion history log" the spec asks for,
-- distinct from the general activity feed so it survives even if activity
-- events are ever pruned, and so "how many leads did staff X convert this
-- quarter" is a single indexed query instead of an activity_events scan.
CREATE TABLE lead_conversions (
  id                  TEXT PRIMARY KEY,
  inquiry_id          TEXT NOT NULL REFERENCES contact_inquiries(id),
  client_user_id      TEXT NOT NULL REFERENCES users(id),
  converted_by        TEXT NOT NULL REFERENCES users(id),
  notes_transferred   INTEGER NOT NULL DEFAULT 0,
  emails_transferred  INTEGER NOT NULL DEFAULT 0,
  activity_transferred INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_conversions_inquiry ON lead_conversions(inquiry_id);
CREATE INDEX idx_conversions_client ON lead_conversions(client_user_id);
CREATE INDEX idx_conversions_by ON lead_conversions(converted_by);
