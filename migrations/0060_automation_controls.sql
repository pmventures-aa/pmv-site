-- Per-job pause/resume and operator notes for HQ Automation Center.
-- Also re-seeds envelope lifecycle rules so a missed 0044 apply cannot
-- keep the document-envelope cron in a hard-fail loop.

CREATE TABLE IF NOT EXISTS automation_controls (
  automation_key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO automation_controls(automation_key, enabled, notes) VALUES
  ('client_notifications', 1, NULL),
  ('client_nurture', 1, NULL),
  ('scheduled_reports', 1, NULL),
  ('scope_followup', 1, NULL),
  ('document_envelopes', 1, NULL);

INSERT OR IGNORE INTO envelope_automation_rules(id, name, rule_type, enabled, config_json)
VALUES
  ('default-reminders', 'Default envelope reminders', 'reminder', 1, '{"respect_envelope_frequency":true,"max_reminders":20}'),
  ('default-expiration', 'Default envelope expiration', 'expiration', 1, '{"expire_due_envelopes":true}'),
  ('default-retention', 'Default retention enforcement', 'retention', 1, '{"enforce_due_disposition":true,"respect_legal_holds":true}');
