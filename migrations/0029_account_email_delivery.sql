PRAGMA foreign_keys = ON;

-- Durable account-onboarding email state. Resend idempotency protects retries
-- for 24 hours; these rows are PMV's permanent record of what was attempted,
-- where it went, and what the provider later reported through webhooks.
ALTER TABLE users ADD COLUMN welcome_email_sent_at TEXT;
ALTER TABLE users ADD COLUMN welcome_email_provider_id TEXT;
ALTER TABLE users ADD COLUMN welcome_email_status TEXT;
ALTER TABLE users ADD COLUMN welcome_email_last_event_at TEXT;

CREATE TABLE account_email_deliveries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  kind TEXT NOT NULL,
  creation_type TEXT,
  subject TEXT NOT NULL,
  action_url TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  provider_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued',
  last_event_type TEXT,
  last_error TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  delivered_at TEXT,
  failed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_account_email_deliveries_user ON account_email_deliveries(user_id, created_at DESC);
CREATE INDEX idx_account_email_deliveries_email ON account_email_deliveries(email, created_at DESC);
CREATE INDEX idx_account_email_deliveries_status ON account_email_deliveries(status, updated_at DESC);

-- Svix/Resend can retry webhook deliveries. Keeping the webhook message ID as
-- the primary key makes processing idempotent even if the same signed callback
-- is delivered more than once.
CREATE TABLE email_webhook_events (
  svix_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  provider_id TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_email_webhook_provider ON email_webhook_events(provider_id, received_at DESC);
