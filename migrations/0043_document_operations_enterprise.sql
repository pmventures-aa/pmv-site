-- Enterprise document operations layer for PMV envelopes and document governance.
-- Extends the existing lifecycle without weakening evidentiary sealing.

ALTER TABLE envelopes ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent'));
ALTER TABLE envelopes ADD COLUMN owner_user_id TEXT;
ALTER TABLE envelopes ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'not_required' CHECK (approval_status IN ('not_required','pending','approved','rejected'));
ALTER TABLE envelopes ADD COLUMN approval_note TEXT;
ALTER TABLE envelopes ADD COLUMN reminder_frequency TEXT NOT NULL DEFAULT 'none' CHECK (reminder_frequency IN ('none','daily','every_3_days','weekly'));
ALTER TABLE envelopes ADD COLUMN next_reminder_at TEXT;
ALTER TABLE envelopes ADD COLUMN last_reminder_at TEXT;
ALTER TABLE envelopes ADD COLUMN void_reason TEXT;
ALTER TABLE envelopes ADD COLUMN last_activity_at TEXT;
ALTER TABLE envelopes ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE envelope_recipients ADD COLUMN last_invited_at TEXT;
ALTER TABLE envelope_recipients ADD COLUMN last_reminded_at TEXT;
ALTER TABLE envelope_recipients ADD COLUMN reminder_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE envelope_recipients ADD COLUMN delegated_to_email TEXT;

CREATE TABLE IF NOT EXISTS envelope_notes (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_envelope_notes_envelope ON envelope_notes(envelope_id, created_at DESC);

CREATE TABLE IF NOT EXISTS envelope_approvals (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  approver_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  note TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_envelope_approvals_envelope ON envelope_approvals(envelope_id, status);

CREATE TABLE IF NOT EXISTS document_retention_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  retention_days INTEGER,
  legal_hold_default INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS internal_document_tags (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES internal_documents(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_internal_document_tags_document ON internal_document_tags(document_id);
CREATE INDEX IF NOT EXISTS idx_envelopes_priority_status ON envelopes(priority, status);
CREATE INDEX IF NOT EXISTS idx_envelopes_owner_status ON envelopes(owner_user_id, status);
CREATE INDEX IF NOT EXISTS idx_envelopes_last_activity ON envelopes(last_activity_at DESC);
