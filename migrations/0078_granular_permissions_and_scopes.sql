-- Foundation for the role/permission overhaul (see shared/authorization.ts).
--
-- Extends the existing permission_catalog with the granular permissions the
-- new authorize() service checks against, and adds a per-role default data
-- scope so authorization does not have to fall back to "everything the role
-- can see" whenever a caller does not narrow the scope on a resource.
--
-- Nothing here removes or renames legacy permissions - the coarse keys in
-- capabilities.ts continue to authorize existing endpoints. New granular
-- entries carry a legacy_key pointer so a role that already has the coarse
-- grant still passes the new authorize() through the legacy shim.

PRAGMA foreign_keys = ON;

-- 1. Extend permission_catalog with metadata the granular service uses.
ALTER TABLE permission_catalog ADD COLUMN legacy_key TEXT;
ALTER TABLE permission_catalog ADD COLUMN owner_only INTEGER NOT NULL DEFAULT 0;
ALTER TABLE permission_catalog ADD COLUMN step_up INTEGER NOT NULL DEFAULT 0;

-- 2. Seed the granular permission catalog. Each entry maps to a legacy key
--    so existing role grants continue to imply the granular capability
--    (documents.view is implied by manage_documents, etc.).
--    INSERT OR IGNORE preserves any Owner-side customization already in D1.

INSERT OR IGNORE INTO permission_catalog(permission_key, label, description, category, legacy_key, owner_only, step_up) VALUES
  -- Clients & CRM
  ('clients.view', 'View clients', 'Open client records within the granted data scope.', 'Clients', 'manage_team', 0, 0),
  ('clients.create', 'Create clients', 'Add a new client record.', 'Clients', 'manage_users', 0, 0),
  ('clients.edit', 'Edit clients', 'Change client profile details in scope.', 'Clients', 'manage_users', 0, 0),
  ('clients.archive', 'Archive clients', 'Move a client to archived. Reversible by admin.', 'Clients', 'manage_users', 0, 0),
  ('clients.assign', 'Assign clients to staff', 'Assign or reassign a client to a team member.', 'Clients', 'manage_team', 0, 0),
  ('clients.view_sensitive', 'View sensitive client fields', 'View sensitive client fields such as government IDs.', 'Clients', 'reveal_payment_info', 0, 1),
  ('clients.export', 'Export client data', 'Export a client roster or profile snapshot.', 'Clients', 'view_reports', 0, 0),
  ('contacts.view', 'View contacts', 'Open contact records within scope.', 'Clients', 'manage_team', 0, 0),
  ('contacts.create', 'Create contacts', 'Add related contacts to a client, business, or property.', 'Clients', 'manage_users', 0, 0),
  ('contacts.edit', 'Edit contacts', 'Update contact info in scope.', 'Clients', 'manage_users', 0, 0),
  ('contacts.link_relationships', 'Link contact relationships', 'Create or edit relationships between contacts and other records.', 'Clients', 'manage_users', 0, 0),

  -- Communications
  ('communications.view', 'View communications', 'Read secure messages and email threads in scope.', 'Communications', 'manage_communications', 0, 0),
  ('communications.send', 'Send communications', 'Send secure messages and emails in scope.', 'Communications', 'manage_communications', 0, 0),
  ('communications.send_bulk', 'Send bulk communications', 'Send outbound campaigns to multiple recipients.', 'Communications', 'manage_communications', 0, 0),
  ('communications.manage_templates', 'Manage email templates', 'Edit HQ email templates and campaign content.', 'Communications', 'manage_communications', 0, 0),
  ('communications.export', 'Export communications', 'Export message history or campaign metrics.', 'Communications', 'view_reports', 0, 0),

  -- Documents & e-sign
  ('documents.view', 'View documents', 'Open documents within the granted scope.', 'Documents', 'manage_documents', 0, 0),
  ('documents.create', 'Create documents', 'Create new document records from templates or blank.', 'Documents', 'manage_documents', 0, 0),
  ('documents.edit_draft', 'Edit document drafts', 'Modify draft documents that are not yet finalized.', 'Documents', 'manage_documents', 0, 0),
  ('documents.upload', 'Upload documents', 'Attach files to client or matter records.', 'Documents', 'manage_documents', 0, 0),
  ('documents.export', 'Export documents', 'Download documents or export bundles.', 'Documents', 'manage_documents', 0, 0),
  ('documents.archive', 'Archive documents', 'Archive a document. Immutable evidence documents cannot be archived.', 'Documents', 'manage_documents', 0, 0),
  ('documents.delete_draft', 'Delete document drafts', 'Permanently remove a draft that has never been sent.', 'Documents', 'manage_documents', 0, 0),
  ('templates.view', 'View document templates', 'Open the document template library.', 'Documents', 'manage_documents', 0, 0),
  ('templates.create', 'Create document templates', 'Add a new template to the library.', 'Documents', 'manage_documents', 0, 0),
  ('templates.edit', 'Edit document templates', 'Update an existing template draft.', 'Documents', 'manage_documents', 0, 0),
  ('templates.publish', 'Publish document templates', 'Publish a template version so it becomes available.', 'Documents', 'manage_documents', 0, 0),
  ('templates.archive', 'Archive document templates', 'Archive a template. Prior signed evidence remains intact.', 'Documents', 'manage_documents', 0, 0),
  ('esign.view', 'View e-sign envelopes', 'Open e-sign envelopes in scope.', 'E-sign', 'manage_documents', 0, 0),
  ('esign.create', 'Create e-sign envelopes', 'Start a new e-sign envelope.', 'E-sign', 'manage_documents', 0, 0),
  ('esign.prepare', 'Prepare e-sign envelopes', 'Place fields, recipients, and instructions on an envelope.', 'E-sign', 'manage_documents', 0, 0),
  ('esign.send', 'Send e-sign envelopes', 'Send an envelope to signers.', 'E-sign', 'manage_documents', 0, 0),
  ('esign.resend', 'Resend e-sign envelopes', 'Resend a pending envelope reminder.', 'E-sign', 'manage_documents', 0, 0),
  ('esign.void', 'Void e-sign envelopes', 'Void an envelope. Evidence trail is preserved.', 'E-sign', 'manage_documents', 0, 0),
  ('esign.download_evidence', 'Download signed evidence', 'Download the completed evidence PDF and audit summary.', 'E-sign', 'manage_documents', 0, 0),
  ('esign.view_audit', 'View e-sign audit trail', 'Inspect the completed audit trail for any envelope.', 'E-sign', 'view_audit_log', 0, 0),
  ('ron.view', 'View RON sessions', 'Open Remote Online Notarization sessions in scope.', 'RON', 'manage_documents', 0, 0),
  ('ron.create', 'Create RON sessions', 'Schedule a RON session.', 'RON', 'manage_documents', 0, 0),
  ('ron.manage', 'Manage RON sessions', 'Change session details, reassign notary, adjust logistics.', 'RON', 'manage_documents', 0, 0),
  ('ron.cancel', 'Cancel RON sessions', 'Cancel a scheduled RON session.', 'RON', 'manage_documents', 0, 0),
  ('ron.refund', 'Refund RON sessions', 'Request or authorize a RON refund.', 'RON', 'manage_documents', 0, 1),
  ('ron.view_provider_evidence', 'View RON provider evidence', 'Open the notarial evidence attached to a RON session.', 'RON', 'view_audit_log', 0, 0),

  -- Invitations
  ('invitations.view', 'View invitations', 'See invitations sent to clients or providers.', 'Invitations', 'manage_invitations', 0, 0),
  ('invitations.create', 'Create invitations', 'Send new client or provider invitations.', 'Invitations', 'manage_invitations', 0, 0),
  ('invitations.resend', 'Resend invitations', 'Resend a pending invitation.', 'Invitations', 'manage_invitations', 0, 0),
  ('invitations.cancel', 'Cancel invitations', 'Cancel an unaccepted invitation.', 'Invitations', 'manage_invitations', 0, 0),
  ('invitations.manage_templates', 'Manage invitation templates', 'Edit the invitation copy and branding.', 'Invitations', 'manage_invitations', 0, 0),

  -- Team & vendors
  ('team.view', 'View team', 'See the internal team roster.', 'Team', 'manage_team', 0, 0),
  ('team.assign', 'Assign team to work', 'Assign or reassign work between team members.', 'Team', 'manage_team', 0, 0),
  ('team.manage', 'Manage team roster', 'Add, remove, and update team members.', 'Team', 'manage_users', 0, 0),
  ('vendors.view', 'View vendors', 'See the professional provider roster.', 'Vendors', 'manage_team', 0, 0),
  ('vendors.invite', 'Invite vendors', 'Invite a professional provider to the Pinnacle Network.', 'Vendors', 'manage_invitations', 0, 0),
  ('vendors.edit', 'Edit vendor profiles', 'Update provider service areas, categories, and profile fields.', 'Vendors', 'manage_team', 0, 0),
  ('vendors.assign', 'Assign vendors to work', 'Assign providers to jobs and RON sessions.', 'Vendors', 'manage_team', 0, 0),
  ('vendors.approve', 'Approve vendors', 'Move a vendor application from vetting to active.', 'Vendors', 'manage_users', 0, 0),
  ('vendors.suspend', 'Suspend vendors', 'Suspend or reactivate a provider account.', 'Vendors', 'manage_users', 0, 0),
  ('vendors.view_payment', 'View vendor payment info', 'View a provider''s masked payment method summary.', 'Vendors', 'reveal_payment_info', 0, 0),

  -- Reporting & audit
  ('reporting.view', 'View reports', 'Open the Reporting Center within the granted scope.', 'Reporting', 'view_reports', 0, 0),
  ('reporting.export', 'Export reports', 'Export report data or generate branded PDFs.', 'Reporting', 'view_reports', 0, 0),
  ('reporting.create_saved_view', 'Save personal report views', 'Save a personal filtered view on any queue.', 'Reporting', 'view_reports', 0, 0),
  ('reporting.share_saved_view', 'Share saved report views', 'Share a saved view with a team.', 'Reporting', 'view_reports', 0, 0),
  ('audit.view', 'View audit log', 'Open the compliance audit trail in scope.', 'Audit', 'view_audit_log', 0, 0),
  ('audit.export', 'Export audit log', 'Export audit entries. The export itself is audited.', 'Audit', 'view_audit_log', 0, 0),
  ('audit.view_security', 'View security audit', 'See privileged security events.', 'Audit', 'view_audit_log', 0, 0),
  ('audit.view_financial', 'View financial audit', 'See financial events such as banking reveals and refunds.', 'Audit', 'view_audit_log', 0, 0),

  -- Banking, billing, finance
  ('banking.view_masked', 'View masked banking', 'See the last four digits of assigned bank accounts.', 'Banking', 'reveal_payment_info', 0, 0),
  ('banking.reveal', 'Reveal banking information', 'Reveal full routing/account numbers. Step-up auth required.', 'Banking', 'reveal_payment_info', 0, 1),
  ('banking.manage_accounts', 'Manage bank accounts', 'Add or change firm bank account records.', 'Banking', 'manage_settings', 0, 1),
  ('billing.view', 'View billing', 'Open the billing workspace in scope.', 'Billing', 'view_reports', 0, 0),
  ('billing.create_invoice', 'Create invoices', 'Create new client invoices.', 'Billing', 'manage_communications', 0, 0),
  ('billing.edit_invoice', 'Edit invoices', 'Edit unpaid invoices.', 'Billing', 'manage_communications', 0, 0),
  ('billing.issue_credit', 'Issue credits', 'Apply a client account credit.', 'Billing', 'manage_settings', 0, 0),
  ('billing.request_refund', 'Request refunds', 'Request a refund on a paid invoice.', 'Billing', 'manage_settings', 0, 0),
  ('billing.process_refund', 'Process refunds', 'Approve and process a client refund.', 'Billing', 'manage_settings', 0, 1),
  ('billing.export', 'Export billing data', 'Export invoice or payment records.', 'Billing', 'view_reports', 0, 0),
  ('finance.reconcile', 'Reconcile finance', 'Match transactions to invoices and mark exceptions.', 'Finance', 'view_reports', 0, 0),
  ('finance.view_ledger', 'View general ledger', 'Open the general ledger view.', 'Finance', 'view_reports', 0, 0),
  ('finance.export', 'Export financial data', 'Export ledger or reconciliation reports.', 'Finance', 'view_reports', 0, 0),

  -- Users & security
  ('users.view', 'View users', 'Open the user administration list.', 'Users', 'manage_users', 0, 0),
  ('users.create', 'Create users', 'Add a new user account.', 'Users', 'manage_users', 0, 0),
  ('users.edit', 'Edit users', 'Update user profile settings.', 'Users', 'manage_users', 0, 0),
  ('users.suspend', 'Suspend users', 'Suspend or reactivate a user account.', 'Users', 'manage_users', 0, 0),
  ('users.assign_roles', 'Assign roles', 'Assign or change user roles. Owner escalation stays Owner-only.', 'Users', 'manage_users', 0, 1),
  ('roles.view', 'View roles', 'See the role catalog and per-role permissions.', 'Users', 'manage_settings', 0, 0),
  ('roles.manage', 'Manage roles', 'Create, edit, or archive role templates.', 'Users', 'manage_settings', 0, 1),
  ('firm_settings.view', 'View firm settings', 'Open the firm settings surface.', 'Settings', 'manage_settings', 0, 0),
  ('firm_settings.manage', 'Manage firm settings', 'Change firm-wide operational settings.', 'Settings', 'manage_settings', 0, 1),
  ('security.view', 'View security center', 'Open the Security Center.', 'Security', 'view_audit_log', 0, 0),
  ('security.manage', 'Manage security', 'Change security policies, MFA enforcement, and session controls.', 'Security', NULL, 1, 1);

-- 3. Per-role default data scope (see shared/authorization.ts DataScope).
--    New role templates default to ASSIGNED so nothing accidentally opens
--    firm-wide when the scope is not explicitly set.
CREATE TABLE IF NOT EXISTS role_data_scopes (
  role_id TEXT PRIMARY KEY REFERENCES role_definitions(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'ASSIGNED'
    CHECK (scope IN ('SELF','ASSIGNED','ASSIGNED_AND_COLLABORATING','TEAM','CLIENT_PORTFOLIO','PROPERTY_PORTFOLIO','REGION','ALL')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed default scopes for the system role templates from migration 0061.
INSERT OR IGNORE INTO role_data_scopes(role_id, scope) VALUES
  ('role-representative', 'CLIENT_PORTFOLIO'),
  ('role-billing-specialist', 'ALL'),
  ('role-funding-specialist', 'CLIENT_PORTFOLIO'),
  ('role-affiliate-paralegal', 'ASSIGNED'),
  ('role-accountant', 'CLIENT_PORTFOLIO'),
  ('role-enrolled-agent', 'CLIENT_PORTFOLIO'),
  ('role-property-manager', 'PROPERTY_PORTFOLIO'),
  ('role-support-specialist', 'ASSIGNED_AND_COLLABORATING'),
  ('role-auditor-readonly', 'ALL'),
  ('role-pinnacle-admin', 'ALL');
