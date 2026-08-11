-- SLA policies as data (previously hardcoded in POST /portal/support). Each
-- row is a priority tier and its response + resolution targets in minutes.
-- HQ owners edit these in Settings → SLA policies; POST /portal/support
-- reads the current values at submission time to stamp response_due_at and
-- resolution_due_at on the ticket, so a policy change only affects tickets
-- submitted after the change (existing due-times stay locked). Seeded to
-- match the previous hardcoded values so nothing shifts on migration.
CREATE TABLE IF NOT EXISTS sla_policies (
  priority           TEXT PRIMARY KEY,   -- 'low' | 'normal' | 'high' | 'urgent'
  response_minutes   INTEGER NOT NULL,
  resolution_minutes INTEGER NOT NULL,
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
INSERT OR IGNORE INTO sla_policies (priority, response_minutes, resolution_minutes) VALUES
  ('low',    480, 4320),
  ('normal', 240, 2880),
  ('high',   120, 1440),
  ('urgent',  30,  480);
