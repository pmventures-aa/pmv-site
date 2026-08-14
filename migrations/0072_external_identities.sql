-- External identity providers (Auth0 / OIDC).
-- Auth0 authenticates identity only; Pinnacle users remain the authorization source.
-- Deleting an external identity must never cascade-delete the internal user.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS external_identities (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL,              -- e.g. auth0, google-oauth2, windowslive
  issuer                TEXT NOT NULL,              -- Auth0 iss claim (https://tenant.auth0.com/)
  subject               TEXT NOT NULL,              -- Auth0 sub claim
  provider_email        TEXT,
  email_verified        INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at         TEXT,
  UNIQUE (issuer, subject)
);

CREATE INDEX IF NOT EXISTS idx_external_identities_user
  ON external_identities(user_id);

CREATE INDEX IF NOT EXISTS idx_external_identities_provider_email
  ON external_identities(provider_email);
