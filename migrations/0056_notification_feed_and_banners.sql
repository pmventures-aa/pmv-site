PRAGMA foreign_keys = ON;

-- Central in-app notification feed (v2) - aggregates every actionable
-- system event into one queryable stream per user, keyed by kind and
-- deep-linked back to the source. Complements notification_user_preferences
-- which controls which kinds actually generate feed rows for a user.
CREATE TABLE notification_feed (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                       -- eg 'conversation.mention', 'email.inbound', 'document.shared', 'care_plan.lead'
  subject_type TEXT,                        -- 'conversation' | 'email_thread' | 'document' | 'care_plan_lead' | ...
  subject_id TEXT,
  title TEXT NOT NULL,
  body TEXT,
  deep_link_path TEXT,                      -- eg '/hq/communications?tab=threads&conv=abc' or '/portal/documents/xyz'
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  read_at TEXT,
  dismissed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notif_feed_user_unread ON notification_feed(user_id, read_at, created_at DESC);
CREATE INDEX idx_notif_feed_user_active ON notification_feed(user_id, dismissed_at, created_at DESC);
CREATE INDEX idx_notif_feed_subject ON notification_feed(subject_type, subject_id) WHERE subject_id IS NOT NULL;

-- Per-conversation opt-out / priority tweak. Mute the noisy thread,
-- promote the important one. Absence of a row = defaults.
CREATE TABLE conversation_notification_prefs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  muted_until TEXT,                         -- NULL = not muted; datetime = muted until then; '9999-12-31' = muted indefinitely
  priority_override TEXT CHECK (priority_override IN ('low','normal','high','urgent')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, conversation_id)
);

-- Per-client login banner + optional one-time forced redirect on next
-- successful sign-in. Rich HTML content is admin-authored, so it goes
-- through the same sanitizer the email templates use before storage.
CREATE TABLE client_login_notices (
  id TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('info','warning','critical')) DEFAULT 'info',
  force_redirect_path TEXT,
  expires_at TEXT,
  acknowledged_at TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_client_login_notices_active ON client_login_notices(client_user_id, acknowledged_at, expires_at);
