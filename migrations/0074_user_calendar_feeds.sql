-- Opaque, revocable calendar subscriptions. Each signed-in user owns one feed;
-- appointments are still resolved through the user's normal access scope.
CREATE TABLE IF NOT EXISTS calendar_feed_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  rotated_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_feed_tokens_token
  ON calendar_feed_tokens(token);
