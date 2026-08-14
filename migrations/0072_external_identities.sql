PRAGMA foreign_keys = ON;

-- External identities (Auth0 issuer + subject) linked to internal Pinnacle users.
-- Deleting an identity never deletes the Pinnacle user. Deleting a user removes
-- only that user's identity rows.
CREATE TABLE IF NOT EXISTS external_identities (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  issuer          TEXT NOT NULL,
  subject         TEXT NOT NULL,
  provider_email  TEXT,
  email_verified  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at   TEXT,
  UNIQUE (issuer, subject)
);

CREATE INDEX IF NOT EXISTS idx_external_identities_user
  ON external_identities(user_id);
