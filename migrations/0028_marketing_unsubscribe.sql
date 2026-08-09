PRAGMA foreign_keys = ON;

-- One-click unsubscribe tokens for Communications Center marketing sends.
-- The token resolves by email rather than by CRM object so an opt-out remains
-- effective even when a lead later converts into a client account.
CREATE TABLE email_unsubscribe_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_at TEXT
);

CREATE INDEX idx_email_unsubscribe_email ON email_unsubscribe_tokens(email);
