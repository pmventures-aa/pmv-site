PRAGMA foreign_keys = ON;

-- Polymorphic conversation model.
--
-- Replaces the client-only message_threads/thread_messages tables with a
-- graph that supports any relationship: staff<->staff, staff<->client,
-- staff<->vendor, group DMs, and (in a follow-up PR) email threads.
--
-- The legacy tables are backfilled here and then dropped in a later
-- migration once the new UI has been running clean. For now we keep them
-- for one release cycle so a fast rollback stays possible.

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('dm','group_dm','email_thread')) DEFAULT 'dm',
  subject TEXT NOT NULL,
  scope_client_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low','normal','high','urgent')) DEFAULT 'normal',
  status TEXT NOT NULL CHECK (status IN ('open','snoozed','closed')) DEFAULT 'open',
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);
CREATE INDEX idx_conversations_client ON conversations(scope_client_user_id) WHERE scope_client_user_id IS NOT NULL;
CREATE INDEX idx_conversations_assignee ON conversations(assignee_user_id) WHERE assignee_user_id IS NOT NULL;
CREATE INDEX idx_conversations_kind_status ON conversations(kind, status, last_message_at DESC);

CREATE TABLE conversation_participants (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_conv TEXT NOT NULL CHECK (role_in_conv IN ('participant','internal_observer')) DEFAULT 'participant',
  added_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  removed_at TEXT,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_conv_participants_user ON conversation_participants(user_id, removed_at);

CREATE TABLE conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body_md TEXT NOT NULL,
  body_html TEXT,
  is_internal_note INTEGER NOT NULL DEFAULT 0 CHECK (is_internal_note IN (0,1)),
  in_reply_to_message_id TEXT REFERENCES conversation_messages(id) ON DELETE SET NULL,
  external_message_id TEXT,
  edited_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_conv_messages_conv ON conversation_messages(conversation_id, created_at);
CREATE INDEX idx_conv_messages_external ON conversation_messages(external_message_id) WHERE external_message_id IS NOT NULL;

CREATE TABLE conversation_reads (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id TEXT REFERENCES conversation_messages(id) ON DELETE SET NULL,
  last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE conversation_pins (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
  pinned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  pinned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (conversation_id, message_id)
);

CREATE TABLE message_mentions (
  message_id TEXT NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
  mentioned_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notified_at TEXT,
  PRIMARY KEY (message_id, mentioned_user_id)
);
CREATE INDEX idx_mentions_user ON message_mentions(mentioned_user_id, notified_at);

CREATE TABLE conversation_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_conv_attachments_message ON conversation_attachments(message_id);

-- Backfill from legacy message_threads / thread_messages.
INSERT INTO conversations (id, kind, subject, scope_client_user_id, created_by_user_id, last_message_at, created_at)
SELECT id, 'dm', subject, client_user_id, created_by, last_message_at, created_at
FROM message_threads;

-- The client is always a participant; the creator is always a participant.
-- Any staff user already assigned to the client is added as an internal
-- observer so the new conversation surface preserves the visibility the
-- old scope helper granted.
INSERT INTO conversation_participants (conversation_id, user_id, role_in_conv, added_at)
SELECT t.id, t.client_user_id, 'participant', t.created_at
FROM message_threads t;

INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, role_in_conv, added_at)
SELECT t.id, t.created_by, 'participant', t.created_at
FROM message_threads t;

INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, role_in_conv, added_at)
SELECT DISTINCT t.id, sa.staff_user_id, 'participant', t.created_at
FROM message_threads t
JOIN staff_assignments sa ON sa.client_user_id = t.client_user_id
WHERE sa.staff_user_id != t.client_user_id AND sa.staff_user_id != t.created_by;

INSERT INTO conversation_messages (id, conversation_id, sender_user_id, body_md, body_html, created_at)
SELECT id, thread_id, sender_user_id, body, NULL, created_at
FROM thread_messages;

INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
SELECT thread_id, user_id, last_read_at
FROM thread_reads;

-- Move attachments across. r2_key stays valid because the R2 bucket key
-- shape is unchanged; the DB row just points at a new parent id.
INSERT INTO conversation_attachments (id, message_id, r2_key, file_name, content_type, size_bytes, created_at)
SELECT id, message_id, r2_key, file_name, content_type, size_bytes, created_at
FROM message_attachments;
