-- Vendors/providers are staff accounts (users.role='staff'), not a
-- separate table — same login + capability model as employees, since the
-- owner wants to assign vendors similar roles/permissions based on what
-- they provide. party_type distinguishes them for nav/labeling/audience
-- targeting; vendor_category is freeform ("Eviction Attorney", "Funding
-- Partner", "Contractor", ...).
ALTER TABLE team_members ADD COLUMN party_type TEXT NOT NULL DEFAULT 'employee'; -- employee | vendor
ALTER TABLE team_members ADD COLUMN vendor_category TEXT;

-- New delegable capability, same pattern as the others on this table
-- (can_manage_settings etc.) — controls who can compose/send from the
-- Communications Center vs. just view its history.
ALTER TABLE team_members ADD COLUMN can_manage_communications INTEGER NOT NULL DEFAULT 0;

-- Per-sender saved signature (HTML), inserted into the composer on demand.
ALTER TABLE team_members ADD COLUMN signature_html TEXT;

-- Self-service vendor/provider signup (POST /auth/vendor-signup) creates
-- the users row with status='pending' — auth.ts already blocks login for
-- any status other than 'active' (see the `status !== 'active'` checks in
-- the login handlers), so a pending vendor simply can't sign in until an
-- admin/owner approves them from Team & Vendors. No CHECK constraint on
-- users.status exists to update — it's unconstrained TEXT.

-- Communications Center: one row per composed message/campaign.
CREATE TABLE comms_messages (
  id                  TEXT PRIMARY KEY,
  created_by_user_id  TEXT NOT NULL REFERENCES users(id),
  subject             TEXT NOT NULL,
  body_html           TEXT NOT NULL,
  send_mode           TEXT NOT NULL DEFAULT 'manual',  -- manual | scheduled
  status              TEXT NOT NULL DEFAULT 'draft',   -- draft | queued | sending | sent | canceled | failed
  audience_json       TEXT NOT NULL,                   -- { "segments": string[], "user_ids": string[] }
  scheduled_at        TEXT,                             -- one-time future send time (UTC ISO) or first occurrence for recurring
  recurrence          TEXT,                             -- NULL (one-time) | daily | weekly | monthly
  next_run_at         TEXT,                             -- due-check field for the cron flusher; NULL once a one-time send has gone out
  last_sent_at        TEXT,                             -- most recent firing, for recurring messages (sent_at is the one-time send timestamp)
  sent_at             TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_comms_messages_status ON comms_messages(status);
CREATE INDEX idx_comms_messages_next_run ON comms_messages(next_run_at);

-- One row per recipient per firing (a recurring campaign gets a fresh
-- batch of rows each time it fires, so history shows exactly who got
-- which occurrence — audience membership, e.g. "all vendors", can change
-- between firings).
CREATE TABLE comms_recipients (
  id                    TEXT PRIMARY KEY,
  message_id            TEXT NOT NULL REFERENCES comms_messages(id) ON DELETE CASCADE,
  user_id               TEXT REFERENCES users(id),
  email                 TEXT NOT NULL,
  full_name             TEXT,
  status                TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed
  provider_message_id   TEXT,
  error                 TEXT,
  sent_at               TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_comms_recipients_message ON comms_recipients(message_id);
CREATE INDEX idx_comms_recipients_status ON comms_recipients(status);
