PRAGMA foreign_keys = ON;

-- Unique (issuer, subject) is the stable external identity key. Email is not.
-- ON DELETE CASCADE removes identity rows when a user is deleted; deleting an
-- identity row never deletes the internal users row. D1 has no down migration;
-- rollback is DROP TABLE external_identities (users are left intact).
CREATE TABLE external_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  UNIQUE (issuer, subject)
);

CREATE INDEX idx_external_identities_user ON external_identities(user_id);
CREATE INDEX idx_external_identities_email ON external_identities(email);
