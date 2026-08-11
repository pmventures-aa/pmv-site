CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  automation_key TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'scheduled',
  status TEXT NOT NULL DEFAULT 'running',
  items_processed INTEGER NOT NULL DEFAULT 0,
  items_succeeded INTEGER NOT NULL DEFAULT 0,
  items_failed INTEGER NOT NULL DEFAULT 0,
  detail_json TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  triggered_by_user_id TEXT,
  FOREIGN KEY (triggered_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_key_started
  ON automation_runs(automation_key, started_at DESC);
