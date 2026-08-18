-- Cleaning job completion photos. Stored in R2 (env.UPLOADS); metadata here.
-- A photo may be tied to a checklist item or an issue, and carries a type
-- label (arrival / before / after / damage / completed / final_guest_ready).
-- client_visible marks a photo for the curated client completion report;
-- internal/vendor-only shots stay off the client surface.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cleaning_job_photos (
  id                    TEXT PRIMARY KEY,
  job_id                TEXT NOT NULL REFERENCES cleaning_jobs(id) ON DELETE CASCADE,
  checklist_item_id     TEXT REFERENCES cleaning_job_checklist_items(id) ON DELETE SET NULL,
  issue_id              TEXT REFERENCES cleaning_job_issues(id) ON DELETE SET NULL,
  object_key            TEXT NOT NULL,
  file_name             TEXT NOT NULL,
  content_type          TEXT,
  size_bytes            INTEGER,
  label                 TEXT NOT NULL DEFAULT 'after',
  client_visible        INTEGER NOT NULL DEFAULT 1,
  captured_at           TEXT,
  uploaded_by_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cleaning_photos_job ON cleaning_job_photos(job_id, created_at);
