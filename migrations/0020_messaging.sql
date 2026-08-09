-- Two-way staff <-> client messaging (see docs/crm-expansion-design.md and
-- the messaging feature request).
--
-- Fresh tables rather than extending secure_messages: that table has no
-- subject line and a single read_at column, which only works for one
-- reader. Threads here are visible to multiple staff (anyone assigned to
-- the client, plus admin/owner), so read state has to be tracked per user,
-- not per message. secure_messages is left as-is (unused going forward,
-- not dropped -- no data migration needed, it never had a working
-- staff-facing UI to generate real usage).

CREATE TABLE message_threads (
  id             TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject        TEXT NOT NULL,
  created_by     TEXT NOT NULL REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_message_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_threads_client ON message_threads(client_user_id);
CREATE INDEX idx_threads_last_message ON message_threads(last_message_at);

CREATE TABLE thread_messages (
  id             TEXT PRIMARY KEY,
  thread_id      TEXT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES users(id),
  body           TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_thread_messages_thread ON thread_messages(thread_id);

CREATE TABLE message_attachments (
  id            TEXT PRIMARY KEY,
  message_id    TEXT NOT NULL REFERENCES thread_messages(id) ON DELETE CASCADE,
  r2_key        TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_attachments_message ON message_attachments(message_id);

-- Per-user read state -- a thread has one client and potentially several
-- staff (plus admin/owner) as readers, so "read" can't be a single column
-- on the thread or message the way secure_messages.read_at was.
CREATE TABLE thread_reads (
  thread_id     TEXT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (thread_id, user_id)
);
