-- Cleaning job documentation: a per-job checklist (materialized from a default
-- template at job creation) and vendor issue reporting. This is the "documented
-- work" differentiator for the cleaning line. Photos are captured against the
-- existing upload pipeline in a later slice; issues carry a description and
-- severity now.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cleaning_job_checklist_items (
  id                    TEXT PRIMARY KEY,
  job_id                TEXT NOT NULL REFERENCES cleaning_jobs(id) ON DELETE CASCADE,
  category              TEXT NOT NULL,
  item_key              TEXT NOT NULL,
  label                 TEXT NOT NULL,
  required              INTEGER NOT NULL DEFAULT 1,
  status                TEXT NOT NULL DEFAULT 'pending',   -- pending | complete | not_applicable
  na_reason             TEXT,
  completed_at          TEXT,
  completed_by_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  sort_order            INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cleaning_checklist_job ON cleaning_job_checklist_items(job_id);

CREATE TABLE IF NOT EXISTS cleaning_job_issues (
  id                    TEXT PRIMARY KEY,
  job_id                TEXT NOT NULL REFERENCES cleaning_jobs(id) ON DELETE CASCADE,
  reported_by_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  category              TEXT NOT NULL,
  severity              TEXT NOT NULL DEFAULT 'needs_attention',  -- low | needs_attention | urgent
  description           TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'open',              -- open | resolved
  resolved_at           TEXT,
  resolved_by_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cleaning_issues_job ON cleaning_job_issues(job_id, status);

INSERT OR IGNORE INTO notification_event_catalog(event_key,label,category,audience,description,default_in_app,default_email,client_configurable,sort_order) VALUES
('cleaning.issue_reported', 'Cleaning issue reported', 'Cleaning', 'staff', 'A cleaner flagged an issue during a job.', 1, 0, 0, 350);
