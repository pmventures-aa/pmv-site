-- Invitations, delegated client access, database-defined staff roles, and generated report storage.

-- Human-readable permission catalog. Permission names/descriptions live in D1 so
-- the Owner can understand exactly what a grant allows without reading code.
CREATE TABLE permission_catalog (
  permission_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO permission_catalog(permission_key, label, description, category) VALUES
  ('reveal_payment_info', 'Reveal banking information', 'View decrypted ACH routing/account details for assigned clients.', 'Sensitive data'),
  ('manage_users', 'Manage users', 'Create, suspend, reactivate, and manage account access for clients, employees, and vendors within existing privilege limits.', 'Administration'),
  ('manage_settings', 'Manage firm settings', 'Change firm-wide settings, service catalog configuration, and operational defaults.', 'Administration'),
  ('view_reports', 'View reporting', 'Open the Reporting Center, run reports, and create branded report PDF exports.', 'Insights'),
  ('view_audit_log', 'View audit log', 'View the compliance-grade audit trail and security history.', 'Security'),
  ('manage_communications', 'Manage communications', 'Create, schedule, and send firm communications and campaigns.', 'Communication'),
  ('manage_invitations', 'Manage invitations', 'Create, resend, revoke, and track client and professional-provider invitations. Staff invitations remain Owner-only.', 'Administration'),
  ('manage_documents', 'Manage document center', 'Open the HQ Document Center and organize generated applications and report-export records.', 'Documents'),
  ('manage_team', 'View team & vendor operations', 'Open Team & Vendors, review provider status, workload, performance, and operational profile information. Privilege grants remain Owner-only.', 'Administration');

CREATE TABLE role_definitions (
  id TEXT PRIMARY KEY,
  role_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  party_type TEXT NOT NULL DEFAULT 'employee', -- employee | vendor | either
  is_system INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE role_permissions (
  role_id TEXT NOT NULL REFERENCES role_definitions(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permission_catalog(permission_key) ON DELETE CASCADE,
  granted INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(role_id, permission_key)
);

ALTER TABLE team_members ADD COLUMN role_definition_id TEXT REFERENCES role_definitions(id) ON DELETE SET NULL;

-- Starter roles are editable templates rather than hard-coded authorization roles.
INSERT INTO role_definitions(id, role_key, name, description, party_type, is_system) VALUES
  ('role-support-admin', 'support_admin', 'Support Admin', 'Handles client support, invitations, documents, reporting, communications, and team operations without Owner-only authority.', 'employee', 1),
  ('role-client-services', 'client_services', 'Client Services', 'Day-to-day client coordination with access to the shared document workspace but no security-sensitive administrative powers by default.', 'employee', 1),
  ('role-vendor-limited', 'vendor_limited', 'Vendor - Limited', 'Restricted provider role intended for assigned client work only.', 'vendor', 1);

INSERT INTO role_permissions(role_id, permission_key, granted) VALUES
  ('role-support-admin', 'manage_users', 1),
  ('role-support-admin', 'view_reports', 1),
  ('role-support-admin', 'manage_communications', 1),
  ('role-support-admin', 'manage_invitations', 1),
  ('role-support-admin', 'manage_documents', 1),
  ('role-support-admin', 'manage_team', 1),
  ('role-client-services', 'manage_documents', 1);

-- Generic invitation ledger used for vendor recruitment, future client/staff
-- invitations, and client-owned Trusted Contact invitations. Only a hash of
-- the secret token is stored in D1.
CREATE TABLE access_invites (
  id TEXT PRIMARY KEY,
  invite_type TEXT NOT NULL, -- vendor | client | staff | trusted_contact
  email TEXT NOT NULL,
  full_name TEXT,
  client_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role_definition_id TEXT REFERENCES role_definitions(id) ON DELETE SET NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | expired | revoked
  invited_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  accepted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_access_invites_email ON access_invites(email);
CREATE INDEX idx_access_invites_status ON access_invites(status, expires_at);
CREATE INDEX idx_access_invites_client ON access_invites(client_user_id);

-- One trusted-contact account can be delegated to more than one client, with
-- separate permissions for each client relationship.
CREATE TABLE trusted_contacts (
  id TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  invite_id TEXT REFERENCES access_invites(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  relationship_label TEXT,
  status TEXT NOT NULL DEFAULT 'invited', -- invited | active | revoked
  permissions_json TEXT NOT NULL DEFAULT '{}',
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(client_user_id, email)
);
CREATE INDEX idx_trusted_contacts_client ON trusted_contacts(client_user_id, status);
CREATE INDEX idx_trusted_contacts_user ON trusted_contacts(contact_user_id, status);

-- Durable report/PDF export library for HQ. Client-specific generated files may
-- also be mirrored into client_documents so they appear directly in the client record.
CREATE TABLE report_exports (
  id TEXT PRIMARY KEY,
  report_key TEXT NOT NULL,
  report_label TEXT NOT NULL,
  file_name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/pdf',
  size_bytes INTEGER,
  client_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  filters_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_report_exports_created ON report_exports(created_at DESC);
CREATE INDEX idx_report_exports_client ON report_exports(client_user_id, created_at DESC);
