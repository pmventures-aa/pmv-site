-- Pinnacle Management Ventures — initial schema (Cloudflare D1 / SQLite)
-- Access control is enforced in the API layer (see functions/): clients see only
-- their own rows; staff see rows for clients they are assigned to; admins see all.

PRAGMA foreign_keys = ON;

-- ---- Identity & auth ----
CREATE TABLE users (
  id            TEXT PRIMARY KEY,              -- uuid
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,                          -- nullable: OTP-only accounts allowed
  role          TEXT NOT NULL DEFAULT 'client',-- client | staff | admin
  full_name     TEXT,
  phone         TEXT,
  phone_verified INTEGER NOT NULL DEFAULT 0,
  two_factor_enabled INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'active',-- active | suspended
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,                -- opaque session token id
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  device_label TEXT,
  ip          TEXT,
  revoked     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE otp_codes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL,                   -- login | phone_verify | recovery
  code_hash   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  consumed    INTEGER NOT NULL DEFAULT 0,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_otp_user ON otp_codes(user_id, purpose);

-- ---- Client & staff domain ----
CREATE TABLE client_profiles (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT,
  entity_type   TEXT,
  ein           TEXT,
  state         TEXT,
  services_enrolled TEXT,                      -- JSON array of service keys
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE team_members (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  staff_role TEXT NOT NULL,                    -- representative | billing_specialist | funding_specialist | affiliate_paralegal | accountant | enrolled_agent | property_manager | support_specialist | auditor_readonly | pinnacle_admin
  title      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- assignment linkage: which staff can access which client
CREATE TABLE staff_assignments (
  id         TEXT PRIMARY KEY,
  staff_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope      TEXT,                             -- optional scope key
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(staff_user_id, client_user_id)
);
CREATE INDEX idx_assign_staff  ON staff_assignments(staff_user_id);
CREATE INDEX idx_assign_client ON staff_assignments(client_user_id);

CREATE TABLE matters (
  id          TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  type        TEXT,                            -- tax_resolution | business_registration | document_prep | ...
  status      TEXT NOT NULL DEFAULT 'open',
  due_date    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_matters_client ON matters(client_user_id);

CREATE TABLE client_tasks (
  id          TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  matter_id   TEXT REFERENCES matters(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  due_date    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tasks_client ON client_tasks(client_user_id);

CREATE TABLE document_requests (
  id          TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  signature_required INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'requested',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_docreq_client ON document_requests(client_user_id);

CREATE TABLE client_documents (
  id          TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    TEXT,                            -- tax | agreement | financial | ...
  tax_year    INTEGER,
  r2_key      TEXT,                            -- object key in R2
  review_status TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_docs_client ON client_documents(client_user_id);

CREATE TABLE invoices (
  id          TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'usd',
  status      TEXT NOT NULL DEFAULT 'open',    -- open | paid | void
  due_date    TEXT,
  stripe_session_id TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_invoices_client ON invoices(client_user_id);

CREATE TABLE funding_applications (
  id          TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_requested_cents INTEGER,
  use_of_funds TEXT,
  status      TEXT NOT NULL DEFAULT 'draft',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE secure_messages (
  id          TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  read_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_msgs_client ON secure_messages(client_user_id);

CREATE TABLE appointments (
  id          TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT,
  starts_at   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'proposed',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE support_tickets (
  id          TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  priority    TEXT NOT NULL DEFAULT 'normal',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE activity_events (
  id          TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  client_user_id TEXT REFERENCES users(id),
  kind        TEXT NOT NULL,
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_activity_client ON activity_events(client_user_id);

-- staff-only internal notes; never exposed to client API
CREATE TABLE internal_notes (
  id          TEXT PRIMARY KEY,
  client_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  matter_id   TEXT REFERENCES matters(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
INSERT INTO app_settings(key, value) VALUES
  ('firm_notify_email', 'support@pinnaclemanagementventures.com');
