-- Client-visible matter ownership, next action, and milestones.
-- Does not replace matters.status. Staff keep operational status; clients see stage + responsibility.

PRAGMA foreign_keys = ON;

ALTER TABLE matters ADD COLUMN client_stage TEXT;
ALTER TABLE matters ADD COLUMN responsibility_state TEXT;
ALTER TABLE matters ADD COLUMN next_action_type TEXT;
ALTER TABLE matters ADD COLUMN next_action_label TEXT;
ALTER TABLE matters ADD COLUMN next_action_due_at TEXT;
ALTER TABLE matters ADD COLUMN target_date TEXT;
ALTER TABLE matters ADD COLUMN last_client_update_at TEXT;
ALTER TABLE matters ADD COLUMN blocked_reason_client_safe TEXT;
ALTER TABLE matters ADD COLUMN completion_summary TEXT;

CREATE TABLE IF NOT EXISTS matter_milestones (
  id TEXT PRIMARY KEY,
  matter_id TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'upcoming',
  started_at TEXT,
  completed_at TEXT,
  target_at TEXT,
  responsible_party TEXT,
  client_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_matter_milestones_matter ON matter_milestones(matter_id, sequence);

ALTER TABLE document_requests ADD COLUMN matter_id TEXT REFERENCES matters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_docreq_matter ON document_requests(matter_id);

UPDATE matters SET
  client_stage = CASE status
    WHEN 'closed' THEN 'complete'
    WHEN 'blocked' THEN 'waiting'
    WHEN 'in_progress' THEN 'in_progress'
    ELSE 'received'
  END,
  responsibility_state = CASE status
    WHEN 'closed' THEN 'none'
    WHEN 'blocked' THEN 'third_party'
    ELSE 'pinnacle'
  END,
  last_client_update_at = COALESCE(updated_at, created_at)
WHERE client_stage IS NULL;
