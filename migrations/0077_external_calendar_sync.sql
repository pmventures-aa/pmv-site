-- External calendar OAuth connections + sync mapping.
--
-- This is the schema foundation for the two-way sync feature described in
-- the sprint spec. Google Calendar is the first provider; the adapter
-- interface in functions/_lib/externalCalendar.ts expects the same schema
-- to serve Microsoft/Graph later. Nothing here changes existing calendar
-- behavior when the provider tables are empty.
--
-- Design notes:
--   * calendar_provider_accounts holds one row per (user + provider). We
--     never send refresh_token to the frontend and store it encrypted at
--     rest by the application layer (see externalCalendar.ts).
--   * calendar_event_sync maps a Pinnacle event_id <-> external event_id
--     with etag/updated_at/sync_origin so we can prevent write echoes and
--     detect external modifications.
--   * calendar_sync_state tracks per-account channel/watch id + sync_token
--     for incremental sync and push notification lifecycle.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS calendar_provider_accounts (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL,               -- 'google' | 'microsoft'
  provider_account_id   TEXT NOT NULL,               -- provider's own user id (google sub)
  email                 TEXT,
  target_calendar_id    TEXT NOT NULL DEFAULT 'primary',
  target_calendar_name  TEXT,
  scopes                TEXT,                        -- space-separated granted scopes for audit
  access_token_enc      TEXT,                        -- encrypted at rest, never returned to client
  refresh_token_enc     TEXT,                        -- encrypted at rest, never returned to client
  access_token_expires  TEXT,                        -- ISO
  status                TEXT NOT NULL DEFAULT 'active',   -- active | disconnected | error
  last_error            TEXT,
  connected_at          TEXT NOT NULL DEFAULT (datetime('now')),
  disconnected_at       TEXT,
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_calendar_provider_accounts_user
  ON calendar_provider_accounts(user_id, provider);

CREATE TABLE IF NOT EXISTS calendar_sync_state (
  account_id            TEXT PRIMARY KEY REFERENCES calendar_provider_accounts(id) ON DELETE CASCADE,
  sync_token            TEXT,                        -- incremental token; NULL forces a bounded resync
  channel_id            TEXT,                        -- webhook subscription id
  channel_resource_id   TEXT,                        -- resource id returned by provider
  channel_expires_at    TEXT,                        -- ISO
  last_synced_at        TEXT,
  last_sync_status      TEXT NOT NULL DEFAULT 'idle',   -- idle | ok | error
  last_sync_error       TEXT
);

CREATE TABLE IF NOT EXISTS calendar_event_sync (
  pinnacle_event_id     TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  account_id            TEXT NOT NULL REFERENCES calendar_provider_accounts(id) ON DELETE CASCADE,
  external_event_id     TEXT NOT NULL,
  etag                  TEXT,
  external_updated_at   TEXT,
  last_sync_direction   TEXT,                        -- push_to_provider | pull_from_provider
  last_synced_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_synced_hash      TEXT,                        -- SHA of the canonical payload we last wrote
  PRIMARY KEY (account_id, external_event_id),
  UNIQUE (pinnacle_event_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_event_sync_pinnacle
  ON calendar_event_sync(pinnacle_event_id);
