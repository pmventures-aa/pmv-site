-- Recurring cleaning plans. A plan stores the standing service definition
-- (what to clean, where, how often) and generates cleaning_jobs occurrences
-- one at a time: when the current occurrence completes, the next is scheduled
-- (roll-forward) unless the plan is paused, the next visit was skipped, or the
-- plan is cancelled. Historical jobs are never deleted when a plan changes.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS recurring_cleaning_plans (
  id                     TEXT PRIMARY KEY,
  reference              TEXT NOT NULL UNIQUE,
  status                 TEXT NOT NULL DEFAULT 'active',   -- active | paused | cancelled
  frequency              TEXT NOT NULL,                    -- weekly | biweekly | monthly

  -- Standing service definition (mirrors the quote input).
  service_type           TEXT NOT NULL,
  service_label          TEXT NOT NULL,
  county                 TEXT NOT NULL,
  bedrooms               INTEGER NOT NULL DEFAULT 0,
  bathrooms              INTEGER NOT NULL DEFAULT 1,
  square_feet            INTEGER,
  condition              TEXT NOT NULL DEFAULT 'standard',
  supplies               TEXT NOT NULL DEFAULT 'pinnacle',
  addons_json            TEXT NOT NULL DEFAULT '{}',
  arrival_window         TEXT,

  -- Who + where.
  client_user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  contact_name           TEXT,
  contact_email          TEXT,
  contact_phone          TEXT,
  property_address       TEXT,
  property_unit          TEXT,

  -- Scheduling state.
  next_date              TEXT,                             -- YYYY-MM-DD of the next occurrence
  skip_next              INTEGER NOT NULL DEFAULT 0,
  last_generated_job_id  TEXT REFERENCES cleaning_jobs(id) ON DELETE SET NULL,
  visits_completed       INTEGER NOT NULL DEFAULT 0,

  created_from_job_id    TEXT REFERENCES cleaning_jobs(id) ON DELETE SET NULL,
  created_by_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recurring_plans_status ON recurring_cleaning_plans(status, next_date);
CREATE INDEX IF NOT EXISTS idx_recurring_plans_client ON recurring_cleaning_plans(client_user_id);

-- Link a cleaning job back to the plan that generated it.
ALTER TABLE cleaning_jobs ADD COLUMN recurring_plan_id TEXT REFERENCES recurring_cleaning_plans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cleaning_jobs_plan ON cleaning_jobs(recurring_plan_id);
