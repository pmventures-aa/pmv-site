PRAGMA foreign_keys = ON;

-- Real email threading, distinct from on-platform DMs and from the
-- outbound-campaign (comms_messages) system.
--
-- Every email_thread hangs off a conversation row (kind='email_thread')
-- so the Communications Hub can show DMs and email threads side by side
-- while keeping the underlying delivery mechanics fully separated.

CREATE TABLE email_threads (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  root_external_message_id TEXT,          -- Message-ID header of the first message in the thread
  scope_client_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_email_threads_conv ON email_threads(conversation_id);
CREATE INDEX idx_email_threads_root ON email_threads(root_external_message_id) WHERE root_external_message_id IS NOT NULL;
CREATE INDEX idx_email_threads_activity ON email_threads(last_activity_at DESC);

CREATE TABLE email_messages (
  id TEXT PRIMARY KEY,
  email_thread_id TEXT NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_json TEXT NOT NULL DEFAULT '[]',     -- JSON array of {email, name?}
  cc_json TEXT NOT NULL DEFAULT '[]',
  bcc_json TEXT NOT NULL DEFAULT '[]',
  reply_to TEXT,
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  external_message_id TEXT,               -- Message-ID header (for our outbound: the one we generate; for inbound: the sender's)
  in_reply_to_external TEXT,              -- In-Reply-To header (external), used to thread inbound replies
  references_external TEXT,               -- References header (external chain)
  provider_id TEXT,                       -- Resend email id for outbound
  provider_status TEXT NOT NULL DEFAULT 'queued'
    CHECK (provider_status IN ('queued','sent','delivered','delayed','bounced','failed','complained','suppressed','received')),
  opened_at TEXT,
  clicked_at TEXT,
  bounced_at TEXT,
  error TEXT,
  sender_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,   -- our staff user for outbound
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_email_messages_thread ON email_messages(email_thread_id, created_at);
CREATE INDEX idx_email_messages_external ON email_messages(external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX idx_email_messages_in_reply ON email_messages(in_reply_to_external) WHERE in_reply_to_external IS NOT NULL;
CREATE INDEX idx_email_messages_provider ON email_messages(provider_id) WHERE provider_id IS NOT NULL;

CREATE TABLE email_attachments (
  id TEXT PRIMARY KEY,
  email_message_id TEXT NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_id TEXT,                        -- for inline images (cid:...)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_email_attachments_message ON email_attachments(email_message_id);
