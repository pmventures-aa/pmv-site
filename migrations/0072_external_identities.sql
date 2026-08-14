PRAGMA foreign_keys = ON;

-- External identities for Auth0 (and future providers). The internal users row
-- remains the sole authorization principal. Deleting an identity must never
-- delete the Pinnacle user; ON DELETE CASCADE only cleans identities when the
-- user account itself is removed.
CREATE TABLE IF NOT EXISTS external_identities (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  issuer          TEXT NOT NULL,
  subject         TEXT NOT NULL,
  email           TEXT,
  email_verified  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at   TEXT,
  UNIQUE(issuer, subject)
);

CREATE INDEX IF NOT EXISTS idx_external_identities_user
  ON external_identities(user_id);

CREATE INDEX IF NOT EXISTS idx_external_identities_email
  ON external_identities(email);
