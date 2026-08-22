-- Subscribe-once calendar feeds for providers.
--
-- A provider subscribes to one URL in whatever calendar they already use, and
-- every PMV assignment appears there from then on without another click. This
-- complements the per-assignment invites rather than replacing them: an invite
-- is a decision to make, a feed is the standing picture.
--
-- The token is the whole authorization. The feed exposes client names and site
-- addresses, so it must be unguessable and revocable - which is why it is a
-- stored random value that can be regenerated, rather than something derived
-- from the user id.
--
-- Re-runnable: IF NOT EXISTS throughout, no ALTER, following 0099 and 0101.

CREATE TABLE IF NOT EXISTS provider_calendar_feeds (
  vendor_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token          TEXT NOT NULL UNIQUE,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  -- Rotating the token invalidates every subscription the provider had, which
  -- is exactly what "revoke" has to mean when the URL is the credential.
  rotated_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_provider_calendar_feeds_token ON provider_calendar_feeds(token);
