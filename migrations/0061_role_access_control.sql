-- Per-user permission overrides, archivable role templates, and job-title
-- roles that used to live only as a hardcoded staff_role list in HQ.

CREATE TABLE IF NOT EXISTS team_member_permission_overrides (
  team_member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permission_catalog(permission_key) ON DELETE CASCADE,
  granted INTEGER NOT NULL CHECK (granted IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(team_member_id, permission_key)
);
CREATE INDEX IF NOT EXISTS idx_tm_permission_overrides_member
  ON team_member_permission_overrides(team_member_id);

ALTER TABLE role_definitions ADD COLUMN is_archived INTEGER DEFAULT 0;

-- Former hardcoded coding roles become editable templates with defaults.
INSERT OR IGNORE INTO role_definitions(id, role_key, name, description, party_type, is_system) VALUES
  ('role-representative', 'representative', 'Representative', 'Default internal coordinator. Client follow-up, documents, invitations, and communications.', 'employee', 1),
  ('role-billing-specialist', 'billing_specialist', 'Billing Specialist', 'Invoices, reporting, and supporting documents without Owner-only controls.', 'employee', 1),
  ('role-funding-specialist', 'funding_specialist', 'Funding Specialist', 'Funding coordination with reporting and document access.', 'employee', 1),
  ('role-affiliate-paralegal', 'affiliate_paralegal', 'Affiliate Paralegal', 'Document preparation, invitations, and related client coordination.', 'either', 1),
  ('role-accountant', 'accountant', 'Accountant', 'Financial reporting, audit review, and decrypted banking access when assigned.', 'employee', 1),
  ('role-enrolled-agent', 'enrolled_agent', 'Enrolled Agent', 'Tax and filing support with documents and reporting.', 'employee', 1),
  ('role-property-manager', 'property_manager', 'Property Manager', 'Property operations, provider coordination, documents, and communications.', 'employee', 1),
  ('role-support-specialist', 'support_specialist', 'Support Specialist', 'Cases, invitations, documents, and client communications.', 'employee', 1),
  ('role-auditor-readonly', 'auditor_readonly', 'Auditor (Read Only)', 'Read-oriented reporting and audit-trail access.', 'either', 1),
  ('role-pinnacle-admin', 'pinnacle_admin', 'Pinnacle Administrator', 'Full operational grants except Owner authority, which cannot be delegated from a template.', 'employee', 1);

INSERT OR IGNORE INTO role_permissions(role_id, permission_key, granted) VALUES
  ('role-representative', 'manage_invitations', 1),
  ('role-representative', 'manage_documents', 1),
  ('role-representative', 'manage_communications', 1),
  ('role-billing-specialist', 'view_reports', 1),
  ('role-billing-specialist', 'manage_documents', 1),
  ('role-funding-specialist', 'view_reports', 1),
  ('role-funding-specialist', 'manage_documents', 1),
  ('role-affiliate-paralegal', 'manage_documents', 1),
  ('role-affiliate-paralegal', 'manage_invitations', 1),
  ('role-accountant', 'view_reports', 1),
  ('role-accountant', 'view_audit_log', 1),
  ('role-accountant', 'reveal_payment_info', 1),
  ('role-enrolled-agent', 'manage_documents', 1),
  ('role-enrolled-agent', 'view_reports', 1),
  ('role-property-manager', 'manage_team', 1),
  ('role-property-manager', 'manage_documents', 1),
  ('role-property-manager', 'manage_communications', 1),
  ('role-support-specialist', 'manage_documents', 1),
  ('role-support-specialist', 'manage_invitations', 1),
  ('role-support-specialist', 'manage_communications', 1),
  ('role-auditor-readonly', 'view_reports', 1),
  ('role-auditor-readonly', 'view_audit_log', 1),
  ('role-pinnacle-admin', 'reveal_payment_info', 1),
  ('role-pinnacle-admin', 'manage_users', 1),
  ('role-pinnacle-admin', 'manage_settings', 1),
  ('role-pinnacle-admin', 'view_reports', 1),
  ('role-pinnacle-admin', 'view_audit_log', 1),
  ('role-pinnacle-admin', 'manage_communications', 1),
  ('role-pinnacle-admin', 'manage_invitations', 1),
  ('role-pinnacle-admin', 'manage_documents', 1),
  ('role-pinnacle-admin', 'manage_team', 1);

-- Attach an existing job-title code to its matching template when no custom role is set.
UPDATE team_members
SET role_definition_id = (
  SELECT rd.id FROM role_definitions rd WHERE rd.role_key = team_members.staff_role
)
WHERE role_definition_id IS NULL
  AND staff_role IS NOT NULL
  AND EXISTS (SELECT 1 FROM role_definitions rd WHERE rd.role_key = team_members.staff_role);
