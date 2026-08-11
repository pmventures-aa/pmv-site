-- PMV self-hosted e-signature platform v2
-- Adds reusable envelope templates, multi-document packets, recipient replacement,
-- revocation, retention/legal hold, bulk operations, field validation, and automation rules.

CREATE TABLE IF NOT EXISTS envelope_templates_v2 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  source_envelope_id TEXT REFERENCES envelopes(id) ON DELETE SET NULL,
  title_template TEXT,
  message_template TEXT,
  signing_order_mode TEXT NOT NULL DEFAULT 'parallel' CHECK (signing_order_mode IN ('parallel','sequential')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  reminder_frequency TEXT NOT NULL DEFAULT 'none' CHECK (reminder_frequency IN ('none','daily','every_3_days','weekly')),
  expiration_days INTEGER,
  approval_status_default TEXT NOT NULL DEFAULT 'not_required' CHECK (approval_status_default IN ('not_required','pending')),
  branding_profile_id TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  recipient_blueprint_json TEXT NOT NULL DEFAULT '[]',
  field_blueprint_json TEXT NOT NULL DEFAULT '[]',
  settings_json TEXT NOT NULL DEFAULT '{}',
  version_number INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_envelope_templates_v2_status_name ON envelope_templates_v2(status,name);

CREATE TABLE IF NOT EXISTS envelope_template_versions_v2 (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES envelope_templates_v2(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  change_note TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(template_id,version_number)
);
CREATE INDEX IF NOT EXISTS idx_envelope_template_versions_v2_template ON envelope_template_versions_v2(template_id,version_number DESC);

CREATE TABLE IF NOT EXISTS envelope_documents (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  document_file_id TEXT NOT NULL REFERENCES document_files(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1,
  required INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(envelope_id,sort_order)
);
CREATE INDEX IF NOT EXISTS idx_envelope_documents_envelope ON envelope_documents(envelope_id,sort_order);

ALTER TABLE document_fields ADD COLUMN envelope_document_id TEXT REFERENCES envelope_documents(id) ON DELETE CASCADE;
ALTER TABLE document_fields ADD COLUMN condition_json TEXT;
ALTER TABLE document_fields ADD COLUMN validation_error_message TEXT;

CREATE TABLE IF NOT EXISTS recipient_replacements (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  original_recipient_id TEXT NOT NULL REFERENCES envelope_recipients(id) ON DELETE RESTRICT,
  replacement_recipient_id TEXT NOT NULL REFERENCES envelope_recipients(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  replaced_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_recipient_replacements_envelope ON recipient_replacements(envelope_id,created_at DESC);

ALTER TABLE envelope_recipients ADD COLUMN access_revoked_at TEXT;
ALTER TABLE envelope_recipients ADD COLUMN replacement_of_recipient_id TEXT;
ALTER TABLE envelope_recipients ADD COLUMN replacement_reason TEXT;

ALTER TABLE internal_document_shares ADD COLUMN revoked_reason TEXT;
ALTER TABLE internal_document_shares ADD COLUMN revoked_by_user_id TEXT;

CREATE TABLE IF NOT EXISTS retention_legal_holds (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('document','envelope','client','global')),
  scope_id TEXT,
  name TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','released')),
  created_by_user_id TEXT NOT NULL,
  released_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_retention_legal_holds_scope ON retention_legal_holds(scope_type,scope_id,status);

CREATE TABLE IF NOT EXISTS retention_assignments (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES document_retention_policies(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('document','envelope','client')),
  scope_id TEXT NOT NULL,
  effective_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disposition_at TEXT,
  disposed_at TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(policy_id,scope_type,scope_id)
);
CREATE INDEX IF NOT EXISTS idx_retention_assignments_disposition ON retention_assignments(disposition_at,disposed_at);

CREATE TABLE IF NOT EXISTS envelope_bulk_jobs (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL CHECK (operation IN ('send','void','remind','archive','download','status')),
  requested_count INTEGER NOT NULL DEFAULT 0,
  succeeded_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','partial','failed')),
  requested_by_user_id TEXT NOT NULL,
  request_json TEXT NOT NULL,
  result_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_envelope_bulk_jobs_created ON envelope_bulk_jobs(created_at DESC);

CREATE TABLE IF NOT EXISTS envelope_automation_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('reminder','expiration','retention')),
  enabled INTEGER NOT NULL DEFAULT 1,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_envelope_automation_rules_type ON envelope_automation_rules(rule_type,enabled);

CREATE TABLE IF NOT EXISTS document_version_comparisons (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('document','template')),
  subject_id TEXT NOT NULL,
  left_version INTEGER NOT NULL,
  right_version INTEGER NOT NULL,
  summary_json TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_document_version_comparisons_subject ON document_version_comparisons(subject_type,subject_id,created_at DESC);

-- Seed the default self-hosted document automation rules once.
INSERT OR IGNORE INTO envelope_automation_rules(id,name,rule_type,enabled,config_json)
VALUES
('default-reminders','Default envelope reminders','reminder',1,'{"respect_envelope_frequency":true,"max_reminders":20}'),
('default-expiration','Default envelope expiration','expiration',1,'{"expire_due_envelopes":true}'),
('default-retention','Default retention enforcement','retention',1,'{"enforce_due_disposition":true,"respect_legal_holds":true}');
