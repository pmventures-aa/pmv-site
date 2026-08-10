-- Persist structured provider onboarding answers separately from the staff/user record.
-- Sensitive identity documents remain in R2; this table only stores application answers.
CREATE TABLE IF NOT EXISTS vendor_application_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  application_json TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vendor_application_profiles_submitted_at
  ON vendor_application_profiles(submitted_at);
