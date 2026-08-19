-- Provider (vendor) review journey + follow-up ("pend") requests.
--
-- review_stage tracks where a provider sits in onboarding review, independent
-- of the coarse network_status (vetting/active). follow_up_requests is a
-- generic "we need something from you" record, usable for any subject user
-- (vendor now, client later), so the same UI/API serves every journey.

ALTER TABLE team_members ADD COLUMN review_stage TEXT NOT NULL DEFAULT 'submitted';

CREATE TABLE IF NOT EXISTS follow_up_requests (
  id TEXT PRIMARY KEY,
  subject_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'info',          -- info | document
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'open',         -- open | answered | resolved
  response_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  answered_at TEXT,
  resolved_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_follow_up_subject ON follow_up_requests(subject_user_id, status);
