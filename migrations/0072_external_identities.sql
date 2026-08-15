-- External identity providers (Auth0) linked to internal Pinnacle users.
-- Authorization remains on users/relationships; this table is identity-only.

CREATE TABLE IF NOT EXISTS external_identities (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL DEFAULT 'auth0',
  connection      TEXT NOT NULL,
  issuer          TEXT NOT NULL,
  subject         TEXT NOT NULL,
  email           TEXT,
  email_verified  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at   TEXT,
  UNIQUE (issuer, subject)
);

CREATE INDEX IF NOT EXISTS idx_external_identities_user ON external_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_external_identities_provider ON external_identities(provider, connection);
