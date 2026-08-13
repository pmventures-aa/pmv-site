PRAGMA foreign_keys = ON;

-- Named, branded signatures selectable at compose time. Shared rows
-- (owner_user_id IS NULL) are firm-wide: Pinnacle company mail and
-- PMV Support. Personal rows belong to one staff user.
CREATE TABLE email_signatures (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('company','personal','support','custom')),
  html TEXT NOT NULL,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_email_signatures_shared_slug
  ON email_signatures(slug) WHERE slug IS NOT NULL AND owner_user_id IS NULL;
CREATE INDEX idx_email_signatures_owner ON email_signatures(owner_user_id, kind);
CREATE INDEX idx_email_signatures_kind ON email_signatures(kind, sort_order);

-- Per-user last-read so inbound replies can badge Communications and the
-- mail bell without requiring a full page reload.
CREATE TABLE email_thread_reads (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_thread_id TEXT NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, email_thread_id)
);
CREATE INDEX idx_email_thread_reads_thread ON email_thread_reads(email_thread_id);
