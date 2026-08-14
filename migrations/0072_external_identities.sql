-- External identities for Auth0 (and future providers).
-- Auth0 authenticates identity only; Pinnacle users + grants remain the
-- sole authorization source. Deleting an identity must never cascade-delete
-- the internal Pinnacle user.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS external_identities (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider          TEXT NOT NULL,                 -- auth0 | google | microsoft | ...
  connection_name   TEXT,                          -- Auth0 connection (google-oauth2, windowslive, ...)
  issuer            TEXT NOT NULL,                 -- Auth0 iss claim
  subject           TEXT NOT NULL,                 -- Auth0 sub claim
  provider_email    TEXT,
  email_verified    INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at     TEXT,
  UNIQUE (issuer, subject)
);

CREATE INDEX IF NOT EXISTS idx_external_identities_user
  ON external_identities(user_id);

CREATE INDEX IF NOT EXISTS idx_external_identities_provider_email
  ON external_identities(provider_email);
