-- Connected client relationships, versioned HQ templates, and practical starter roles.

CREATE TABLE managed_templates (
  id TEXT PRIMARY KEY,
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'document' CHECK (category IN ('agreement','document','email','operations')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  draft_version INTEGER NOT NULL DEFAULT 1,
  published_version INTEGER,
  published_version_label TEXT,
  content_json TEXT NOT NULL DEFAULT '[]',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);

CREATE TABLE managed_template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES managed_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  version_label TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  content_json TEXT NOT NULL,
  change_note TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(template_id, version_number)
);
CREATE INDEX idx_managed_template_versions_template ON managed_template_versions(template_id, version_number DESC);

INSERT OR IGNORE INTO managed_templates
  (id, template_key, name, category, description, status, draft_version, published_version, published_version_label, content_json, published_at)
VALUES
  ('managed-provider-agreement', 'provider-agreement', 'Independent Provider Network Agreement', 'agreement',
   'The master agreement accepted by professionals and businesses applying to the Pinnacle Professional Network.',
   'published', 1, 1, '2026-08-11', '[]', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO managed_template_versions
  (id, template_id, version_number, version_label, name, description, content_json, change_note, published_at)
VALUES
  ('managed-provider-agreement-v1', 'managed-provider-agreement', 1, '2026-08-11',
   'Independent Provider Network Agreement',
   'The master agreement accepted by professionals and businesses applying to the Pinnacle Professional Network.',
   '[]', 'Initial published version', CURRENT_TIMESTAMP);

-- Every login account can represent one or more people or organizations. Work can
-- then be attached to any combination without merging spouses, principals, or businesses.
CREATE TABLE relationship_parties (
  id TEXT PRIMARY KEY,
  party_type TEXT NOT NULL CHECK (party_type IN ('person','business')),
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_relationship_parties_name ON relationship_parties(display_name);
CREATE INDEX idx_relationship_parties_email ON relationship_parties(email);

CREATE TABLE relationship_people (
  party_id TEXT PRIMARY KEY REFERENCES relationship_parties(id) ON DELETE CASCADE,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  title TEXT
);

CREATE TABLE relationship_businesses (
  party_id TEXT PRIMARY KEY REFERENCES relationship_parties(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  dba_name TEXT,
  entity_type TEXT,
  ein TEXT,
  state TEXT,
  primary_contact_party_id TEXT NOT NULL REFERENCES relationship_parties(id) ON DELETE RESTRICT,
  CHECK (party_id <> primary_contact_party_id)
);

CREATE TRIGGER relationship_business_contact_insert
BEFORE INSERT ON relationship_businesses
WHEN NOT EXISTS (SELECT 1 FROM relationship_parties WHERE id = NEW.primary_contact_party_id AND party_type = 'person' AND status = 'active')
BEGIN
  SELECT RAISE(ABORT, 'businesses require an active contact person');
END;

CREATE TRIGGER relationship_business_contact_update
BEFORE UPDATE OF primary_contact_party_id ON relationship_businesses
WHEN NOT EXISTS (SELECT 1 FROM relationship_parties WHERE id = NEW.primary_contact_party_id AND party_type = 'person' AND status = 'active')
BEGIN
  SELECT RAISE(ABORT, 'businesses require an active contact person');
END;

CREATE TABLE account_parties (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  party_id TEXT NOT NULL REFERENCES relationship_parties(id) ON DELETE CASCADE,
  access_role TEXT NOT NULL DEFAULT 'self' CHECK (access_role IN ('self','authorized_user','principal','contact')),
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, party_id)
);
CREATE UNIQUE INDEX idx_account_parties_primary ON account_parties(user_id) WHERE is_primary = 1;

CREATE TABLE party_relationships (
  id TEXT PRIMARY KEY,
  from_party_id TEXT NOT NULL REFERENCES relationship_parties(id) ON DELETE CASCADE,
  to_party_id TEXT NOT NULL REFERENCES relationship_parties(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('spouse','partner','household_member','business_partner','primary_contact','contact','principal','owner','authorized_representative','other')),
  label TEXT,
  notes TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (from_party_id <> to_party_id),
  UNIQUE(from_party_id, to_party_id, relationship_type)
);
CREATE INDEX idx_party_relationships_from ON party_relationships(from_party_id);
CREATE INDEX idx_party_relationships_to ON party_relationships(to_party_id);

CREATE TABLE matter_parties (
  matter_id TEXT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  party_id TEXT NOT NULL REFERENCES relationship_parties(id) ON DELETE CASCADE,
  matter_role TEXT NOT NULL DEFAULT 'client',
  is_primary INTEGER NOT NULL DEFAULT 0,
  added_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(matter_id, party_id, matter_role)
);
CREATE INDEX idx_matter_parties_party ON matter_parties(party_id, matter_id);

ALTER TABLE client_profiles ADD COLUMN primary_party_id TEXT REFERENCES relationship_parties(id) ON DELETE SET NULL;
ALTER TABLE client_profiles ADD COLUMN business_party_id TEXT REFERENCES relationship_parties(id) ON DELETE SET NULL;

-- Backfill one person for each current client account.
INSERT OR IGNORE INTO relationship_parties(id, party_type, display_name, email, phone)
SELECT 'person-' || u.id, 'person', COALESCE(NULLIF(TRIM(u.full_name), ''), u.email), u.email, u.phone
FROM users u WHERE u.role = 'client';

INSERT OR IGNORE INTO relationship_people(party_id, first_name, last_name)
SELECT 'person-' || u.id, u.first_name, u.last_name FROM users u WHERE u.role = 'client';

INSERT OR IGNORE INTO account_parties(user_id, party_id, access_role, is_primary)
SELECT u.id, 'person-' || u.id, 'self', 1 FROM users u WHERE u.role = 'client';

UPDATE client_profiles SET primary_party_id = 'person-' || user_id WHERE primary_party_id IS NULL;

-- Existing business profiles gain the client's person as their required contact.
INSERT OR IGNORE INTO relationship_parties(id, party_type, display_name)
SELECT 'business-' || cp.user_id, 'business', cp.business_name
FROM client_profiles cp WHERE NULLIF(TRIM(cp.business_name), '') IS NOT NULL;

INSERT OR IGNORE INTO relationship_businesses(party_id, legal_name, entity_type, ein, state, primary_contact_party_id)
SELECT 'business-' || cp.user_id, cp.business_name, cp.entity_type, cp.ein, cp.state, 'person-' || cp.user_id
FROM client_profiles cp WHERE NULLIF(TRIM(cp.business_name), '') IS NOT NULL;

INSERT OR IGNORE INTO party_relationships(id, from_party_id, to_party_id, relationship_type, label)
SELECT 'primary-contact-' || cp.user_id, 'person-' || cp.user_id, 'business-' || cp.user_id, 'primary_contact', 'Primary Contact'
FROM client_profiles cp WHERE NULLIF(TRIM(cp.business_name), '') IS NOT NULL;

UPDATE client_profiles SET business_party_id = 'business-' || user_id
WHERE business_party_id IS NULL AND NULLIF(TRIM(business_name), '') IS NOT NULL;

INSERT OR IGNORE INTO matter_parties(matter_id, party_id, matter_role, is_primary)
SELECT m.id, 'person-' || m.client_user_id, 'client', 1 FROM matters m;

-- Base permission sets for the common ways Pinnacle actually operates.
INSERT OR IGNORE INTO role_definitions(id, role_key, name, description, party_type, is_system) VALUES
  ('role-operations-coordinator', 'operations_coordinator', 'Operations Coordinator', 'Coordinates cases, client requests, assignments, documents, communications, and reporting without Owner-only controls.', 'employee', 1),
  ('role-client-relationship-manager', 'client_relationship_manager', 'Client Relationship Manager', 'Owns intake, client follow-up, communications, documents, and relationship continuity.', 'employee', 1),
  ('role-document-specialist', 'document_specialist', 'Document & E-Sign Specialist', 'Prepares and manages document workflows, signature transactions, client invitations, and related communications.', 'either', 1),
  ('role-field-dispatch', 'field_dispatch_coordinator', 'Field Dispatch Coordinator', 'Coordinates the provider network, assignments, case updates, documents, and field-service communications.', 'employee', 1),
  ('role-provider-standard', 'provider_standard', 'Professional Provider', 'Restricted provider access for assigned work, supporting documents, and approved team operations.', 'vendor', 1),
  ('role-reporting-auditor', 'reporting_auditor', 'Reporting & Audit Reviewer', 'Read-oriented access to management reporting and the audit trail.', 'either', 1);

INSERT OR IGNORE INTO role_permissions(role_id, permission_key, granted) VALUES
  ('role-operations-coordinator', 'manage_invitations', 1),
  ('role-operations-coordinator', 'manage_documents', 1),
  ('role-operations-coordinator', 'manage_communications', 1),
  ('role-operations-coordinator', 'manage_team', 1),
  ('role-operations-coordinator', 'view_reports', 1),
  ('role-client-relationship-manager', 'manage_invitations', 1),
  ('role-client-relationship-manager', 'manage_documents', 1),
  ('role-client-relationship-manager', 'manage_communications', 1),
  ('role-client-relationship-manager', 'view_reports', 1),
  ('role-document-specialist', 'manage_documents', 1),
  ('role-document-specialist', 'manage_invitations', 1),
  ('role-document-specialist', 'manage_communications', 1),
  ('role-field-dispatch', 'manage_team', 1),
  ('role-field-dispatch', 'manage_documents', 1),
  ('role-field-dispatch', 'manage_communications', 1),
  ('role-provider-standard', 'manage_documents', 1),
  ('role-reporting-auditor', 'view_reports', 1),
  ('role-reporting-auditor', 'view_audit_log', 1);

UPDATE role_definitions SET name = 'Support Administrator' WHERE role_key = 'support_admin';
UPDATE role_definitions SET name = 'Professional Provider - Limited' WHERE role_key = 'vendor_limited';
