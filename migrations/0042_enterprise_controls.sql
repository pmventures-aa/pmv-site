-- Enterprise security, reporting, notification, deletion and conversion controls.

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_label TEXT,
  user_agent TEXT,
  ip_address TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoke_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active ON auth_sessions(user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_last_seen ON auth_sessions(last_seen_at);

ALTER TABLE notification_user_preferences ADD COLUMN desktop_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_user_preferences ADD COLUMN sound_enabled INTEGER NOT NULL DEFAULT 0;

ALTER TABLE report_templates ADD COLUMN schedule_kind TEXT;
ALTER TABLE report_templates ADD COLUMN schedule_time TEXT;
ALTER TABLE report_templates ADD COLUMN schedule_day INTEGER;
ALTER TABLE report_templates ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE report_templates ADD COLUMN next_run_at TEXT;
ALTER TABLE report_templates ADD COLUMN last_run_at TEXT;
ALTER TABLE report_templates ADD COLUMN last_status TEXT;
ALTER TABLE report_templates ADD COLUMN last_error TEXT;
CREATE INDEX IF NOT EXISTS idx_report_templates_due ON report_templates(enabled, next_run_at);

ALTER TABLE scheduled_report_runs ADD COLUMN recipients_json TEXT;
ALTER TABLE scheduled_report_runs ADD COLUMN rows_generated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_report_runs ADD COLUMN finished_at TEXT;

ALTER TABLE lead_conversions ADD COLUMN attribution_json TEXT;
ALTER TABLE lead_conversions ADD COLUMN preview_json TEXT;

ALTER TABLE permanent_deletions ADD COLUMN record_label TEXT;
ALTER TABLE permanent_deletions ADD COLUMN dependency_summary_json TEXT;

CREATE TABLE IF NOT EXISTS data_export_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  export_type TEXT NOT NULL,
  entity_type TEXT,
  filters_json TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_data_export_events_created ON data_export_events(created_at);
CREATE INDEX IF NOT EXISTS idx_data_export_events_actor ON data_export_events(actor_user_id, created_at);
