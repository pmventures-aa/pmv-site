PRAGMA foreign_keys = ON;

-- Owner impersonation.
--
-- Only accounts that are role='admin' AND team_members.is_owner=1 can start
-- an impersonation session. Every subsequent request under the impersonated
-- session is executed AS the target user, but the session cookie remains
-- issued to the owner - authorization treats the owner as the executor
-- for audit purposes even as the app treats the caller as the target.

CREATE TABLE impersonation_sessions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  ended_at TEXT,
  ended_reason TEXT             -- 'manual' | 'timeout' | 'target_logout' | 'owner_logout' | 'security'
);
CREATE INDEX idx_impersonation_owner ON impersonation_sessions(owner_user_id, ended_at);
CREATE INDEX idx_impersonation_target ON impersonation_sessions(target_user_id, ended_at);
CREATE INDEX idx_impersonation_active ON impersonation_sessions(ended_at, expires_at) WHERE ended_at IS NULL;

CREATE TABLE impersonation_events (
  id TEXT PRIMARY KEY,
  impersonation_session_id TEXT NOT NULL REFERENCES impersonation_sessions(id) ON DELETE CASCADE,
  action TEXT NOT NULL,        -- 'request' | 'blocked' | 'started' | 'ended'
  path TEXT,
  method TEXT,
  status_code INTEGER,
  detail TEXT,                 -- JSON: request summary or reason for a block
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_impersonation_events_session ON impersonation_events(impersonation_session_id, created_at DESC);

-- Session flag: an active impersonation session is bound to a specific
-- auth_sessions.id so the target-user swap only applies to requests
-- coming through that exact cookie. Prevents accidentally impersonating
-- on a second browser or a stale tab. (The runtime KV
-- `impersonate:<token>` key is the actual gate; this column is for
-- server-side reporting joins.)
ALTER TABLE auth_sessions ADD COLUMN impersonation_session_id TEXT REFERENCES impersonation_sessions(id) ON DELETE SET NULL;
CREATE INDEX idx_auth_sessions_impersonation ON auth_sessions(impersonation_session_id) WHERE impersonation_session_id IS NOT NULL;
