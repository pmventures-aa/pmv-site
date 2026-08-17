// Central authorization vocabulary shared by the server enforcer
// (functions/_lib/authorize.ts) and any client-side surface that needs to
// know what a role is allowed to do (nav gating, dashboard widget
// visibility). Adding a new permission or role starts here.
//
// Design principles (see the master role/permissions spec):
//   * Deny by default. authorize() returns false unless a role or override
//     explicitly grants the requested (permission, scope) pair.
//   * Server-side enforcement is authoritative. Anything on the client is
//     only for hiding UI - never trusted for access.
//   * Legacy shim: the coarse permissions in functions/_lib/capabilities.ts
//     (manage_documents, manage_users, etc.) stay valid and each granular
//     permission below advertises its legacy equivalent so existing
//     requireNamedPermission() call sites do not need to change.

export const DATA_SCOPES = [
  'SELF',                       // only records owned by the acting user
  'ASSIGNED',                   // records the user is directly assigned to
  'ASSIGNED_AND_COLLABORATING', // assigned + explicitly shared collaboration
  'TEAM',                       // any record owned by the user's team
  'CLIENT_PORTFOLIO',           // any record whose client is in the user's book
  'PROPERTY_PORTFOLIO',         // any record whose property is in the user's book
  'REGION',                     // any record in the user's coverage region
  'ALL',                        // firm-wide
] as const

export type DataScope = typeof DATA_SCOPES[number]

// Rank scopes so we can compare "does this grant cover the required scope".
// SELF is the tightest; ALL is the widest. ASSIGNED_AND_COLLABORATING sits
// just above ASSIGNED to reflect that a shared collaboration extends the
// same operational reach without stepping up to team-wide visibility.
export const SCOPE_RANK: Record<DataScope, number> = {
  SELF: 0,
  ASSIGNED: 1,
  ASSIGNED_AND_COLLABORATING: 2,
  TEAM: 3,
  CLIENT_PORTFOLIO: 4,
  PROPERTY_PORTFOLIO: 4,
  REGION: 5,
  ALL: 9,
}

export function scopeCovers(granted: DataScope, required: DataScope): boolean {
  return SCOPE_RANK[granted] >= SCOPE_RANK[required]
}

// Granular permission catalog (see spec sections 3, 37). Each entry maps
// to a coarse legacy permission so existing servers stay authoritative
// while we roll granular permissions out gradually. When both are absent
// on the acting user, authorize() denies.
export type GranularPermission =
  // Clients & CRM
  | 'clients.view' | 'clients.create' | 'clients.edit' | 'clients.archive'
  | 'clients.assign' | 'clients.view_sensitive' | 'clients.export'
  | 'contacts.view' | 'contacts.create' | 'contacts.edit' | 'contacts.link_relationships'
  // Communications
  | 'communications.view' | 'communications.send' | 'communications.send_bulk'
  | 'communications.manage_templates' | 'communications.export'
  // Documents & e-sign
  | 'documents.view' | 'documents.create' | 'documents.edit_draft'
  | 'documents.upload' | 'documents.export' | 'documents.archive' | 'documents.delete_draft'
  | 'templates.view' | 'templates.create' | 'templates.edit' | 'templates.publish' | 'templates.archive'
  | 'esign.view' | 'esign.create' | 'esign.prepare' | 'esign.send'
  | 'esign.resend' | 'esign.void' | 'esign.download_evidence' | 'esign.view_audit'
  | 'ron.view' | 'ron.create' | 'ron.manage' | 'ron.cancel' | 'ron.refund' | 'ron.view_provider_evidence'
  // Invitations
  | 'invitations.view' | 'invitations.create' | 'invitations.resend'
  | 'invitations.cancel' | 'invitations.manage_templates'
  // Team & vendors
  | 'team.view' | 'team.assign' | 'team.manage'
  | 'vendors.view' | 'vendors.invite' | 'vendors.edit' | 'vendors.assign'
  | 'vendors.approve' | 'vendors.suspend' | 'vendors.view_payment'
  // Reporting & audit
  | 'reporting.view' | 'reporting.export' | 'reporting.create_saved_view' | 'reporting.share_saved_view'
  | 'audit.view' | 'audit.export' | 'audit.view_security' | 'audit.view_financial'
  // Banking, billing, finance
  | 'banking.view_masked' | 'banking.reveal' | 'banking.manage_accounts'
  | 'billing.view' | 'billing.create_invoice' | 'billing.edit_invoice'
  | 'billing.issue_credit' | 'billing.request_refund' | 'billing.process_refund' | 'billing.export'
  | 'finance.reconcile' | 'finance.view_ledger' | 'finance.export'
  // Users & security
  | 'users.view' | 'users.create' | 'users.edit' | 'users.suspend' | 'users.assign_roles'
  | 'roles.view' | 'roles.manage'
  | 'firm_settings.view' | 'firm_settings.manage'
  | 'security.view' | 'security.manage'
  // Field-work location tracking (see migration 0080)
  | 'field.location.view_live' | 'field.location.view_history'
  | 'field.location.export' | 'field.location.manage'

// Legacy names that already ship in functions/_lib/capabilities.ts.
export type LegacyPermission =
  | 'reveal_payment_info' | 'manage_users' | 'manage_settings' | 'view_reports'
  | 'view_audit_log' | 'manage_communications' | 'manage_invitations'
  | 'manage_documents' | 'manage_team'

export interface PermissionSpec {
  key: GranularPermission
  label: string
  description: string
  category:
    | 'clients' | 'communications' | 'documents' | 'esign' | 'ron' | 'invitations'
    | 'team' | 'vendors' | 'reporting' | 'audit' | 'banking' | 'billing' | 'finance'
    | 'users' | 'security' | 'settings' | 'field'
  // Which legacy permission from the existing capabilities system implies
  // this granular permission. When absent, only Owner/Admin or an explicit
  // grant on this granular key allows it.
  legacy?: LegacyPermission
  // Sensitive actions require a step-up auth confirmation before authorize()
  // returns true. Callers must supply { context.stepUp: true } to satisfy.
  stepUp?: boolean
  // Whether the acting user must be an Owner. Owner is never derivable from
  // a role template or per-user override.
  ownerOnly?: boolean
}

// Human labels and legacy-shim mapping. Keeping this in one place makes it
// easy for the eventual Admin role editor to render a real catalog.
export const PERMISSION_CATALOG: PermissionSpec[] = [
  // Clients & CRM
  { key: 'clients.view', label: 'View clients', description: 'Open client records within the granted data scope.', category: 'clients', legacy: 'manage_team' },
  { key: 'clients.create', label: 'Create clients', description: 'Add a new client record.', category: 'clients', legacy: 'manage_users' },
  { key: 'clients.edit', label: 'Edit clients', description: 'Change client profile details in scope.', category: 'clients', legacy: 'manage_users' },
  { key: 'clients.archive', label: 'Archive clients', description: 'Move a client to archived. Reversible by admin.', category: 'clients', legacy: 'manage_users' },
  { key: 'clients.assign', label: 'Assign clients to staff', description: 'Assign or reassign a client to a team member.', category: 'clients', legacy: 'manage_team' },
  { key: 'clients.view_sensitive', label: 'View sensitive client fields', description: 'View sensitive client fields such as government IDs (masked by default).', category: 'clients', legacy: 'reveal_payment_info', stepUp: true },
  { key: 'clients.export', label: 'Export client data', description: 'Export a client roster or profile snapshot.', category: 'clients', legacy: 'view_reports' },
  { key: 'contacts.view', label: 'View contacts', description: 'Open contact records within scope.', category: 'clients', legacy: 'manage_team' },
  { key: 'contacts.create', label: 'Create contacts', description: 'Add related contacts to a client, business, or property.', category: 'clients', legacy: 'manage_users' },
  { key: 'contacts.edit', label: 'Edit contacts', description: 'Update contact info in scope.', category: 'clients', legacy: 'manage_users' },
  { key: 'contacts.link_relationships', label: 'Link contact relationships', description: 'Create or edit relationships between contacts and other records.', category: 'clients', legacy: 'manage_users' },

  // Communications
  { key: 'communications.view', label: 'View communications', description: 'Read secure messages and email threads in scope.', category: 'communications', legacy: 'manage_communications' },
  { key: 'communications.send', label: 'Send communications', description: 'Send secure messages and emails in scope.', category: 'communications', legacy: 'manage_communications' },
  { key: 'communications.send_bulk', label: 'Send bulk communications', description: 'Send outbound campaigns to multiple recipients.', category: 'communications', legacy: 'manage_communications' },
  { key: 'communications.manage_templates', label: 'Manage email templates', description: 'Edit HQ email templates and campaign content.', category: 'communications', legacy: 'manage_communications' },
  { key: 'communications.export', label: 'Export communications', description: 'Export message history or campaign metrics.', category: 'communications', legacy: 'view_reports' },

  // Documents & e-sign
  { key: 'documents.view', label: 'View documents', description: 'Open documents within the granted scope.', category: 'documents', legacy: 'manage_documents' },
  { key: 'documents.create', label: 'Create documents', description: 'Create new document records from templates or blank.', category: 'documents', legacy: 'manage_documents' },
  { key: 'documents.edit_draft', label: 'Edit document drafts', description: 'Modify draft documents that are not yet finalized.', category: 'documents', legacy: 'manage_documents' },
  { key: 'documents.upload', label: 'Upload documents', description: 'Attach files to client or matter records.', category: 'documents', legacy: 'manage_documents' },
  { key: 'documents.export', label: 'Export documents', description: 'Download documents or export bundles.', category: 'documents', legacy: 'manage_documents' },
  { key: 'documents.archive', label: 'Archive documents', description: 'Archive a document. Immutable evidence documents cannot be archived.', category: 'documents', legacy: 'manage_documents' },
  { key: 'documents.delete_draft', label: 'Delete document drafts', description: 'Permanently remove a draft document that has never been sent.', category: 'documents', legacy: 'manage_documents' },
  { key: 'templates.view', label: 'View document templates', description: 'Open the document template library.', category: 'documents', legacy: 'manage_documents' },
  { key: 'templates.create', label: 'Create document templates', description: 'Add a new template to the library.', category: 'documents', legacy: 'manage_documents' },
  { key: 'templates.edit', label: 'Edit document templates', description: 'Update an existing template draft.', category: 'documents', legacy: 'manage_documents' },
  { key: 'templates.publish', label: 'Publish document templates', description: 'Publish a template version so it becomes available to staff.', category: 'documents', legacy: 'manage_documents' },
  { key: 'templates.archive', label: 'Archive document templates', description: 'Archive a template. Prior signed evidence remains intact.', category: 'documents', legacy: 'manage_documents' },
  { key: 'esign.view', label: 'View e-sign envelopes', description: 'Open e-sign envelopes in scope.', category: 'esign', legacy: 'manage_documents' },
  { key: 'esign.create', label: 'Create e-sign envelopes', description: 'Start a new e-sign envelope.', category: 'esign', legacy: 'manage_documents' },
  { key: 'esign.prepare', label: 'Prepare e-sign envelopes', description: 'Place fields, recipients, and instructions on an envelope.', category: 'esign', legacy: 'manage_documents' },
  { key: 'esign.send', label: 'Send e-sign envelopes', description: 'Send an envelope to signers.', category: 'esign', legacy: 'manage_documents' },
  { key: 'esign.resend', label: 'Resend e-sign envelopes', description: 'Resend a pending envelope reminder.', category: 'esign', legacy: 'manage_documents' },
  { key: 'esign.void', label: 'Void e-sign envelopes', description: 'Void an envelope. Evidence trail is preserved.', category: 'esign', legacy: 'manage_documents' },
  { key: 'esign.download_evidence', label: 'Download signed evidence', description: 'Download the completed evidence PDF and audit summary.', category: 'esign', legacy: 'manage_documents' },
  { key: 'esign.view_audit', label: 'View e-sign audit trail', description: 'Inspect the completed audit trail for any envelope.', category: 'esign', legacy: 'view_audit_log' },
  { key: 'ron.view', label: 'View RON sessions', description: 'Open Remote Online Notarization sessions in scope.', category: 'ron', legacy: 'manage_documents' },
  { key: 'ron.create', label: 'Create RON sessions', description: 'Schedule a RON session.', category: 'ron', legacy: 'manage_documents' },
  { key: 'ron.manage', label: 'Manage RON sessions', description: 'Change session details, reassign notary, adjust logistics.', category: 'ron', legacy: 'manage_documents' },
  { key: 'ron.cancel', label: 'Cancel RON sessions', description: 'Cancel a scheduled RON session.', category: 'ron', legacy: 'manage_documents' },
  { key: 'ron.refund', label: 'Refund RON sessions', description: 'Request or authorize a RON refund.', category: 'ron', legacy: 'manage_documents', stepUp: true },
  { key: 'ron.view_provider_evidence', label: 'View RON provider evidence', description: 'Open the notarial evidence attached to a RON session.', category: 'ron', legacy: 'view_audit_log' },

  // Invitations
  { key: 'invitations.view', label: 'View invitations', description: 'See invitations sent to clients or professional providers.', category: 'invitations', legacy: 'manage_invitations' },
  { key: 'invitations.create', label: 'Create invitations', description: 'Send new client or provider invitations.', category: 'invitations', legacy: 'manage_invitations' },
  { key: 'invitations.resend', label: 'Resend invitations', description: 'Resend a pending invitation.', category: 'invitations', legacy: 'manage_invitations' },
  { key: 'invitations.cancel', label: 'Cancel invitations', description: 'Cancel an unaccepted invitation.', category: 'invitations', legacy: 'manage_invitations' },
  { key: 'invitations.manage_templates', label: 'Manage invitation templates', description: 'Edit the invitation copy and branding.', category: 'invitations', legacy: 'manage_invitations' },

  // Team & vendors
  { key: 'team.view', label: 'View team', description: 'See the internal team roster.', category: 'team', legacy: 'manage_team' },
  { key: 'team.assign', label: 'Assign team to work', description: 'Assign or reassign work between team members.', category: 'team', legacy: 'manage_team' },
  { key: 'team.manage', label: 'Manage team roster', description: 'Add, remove, and update team members.', category: 'team', legacy: 'manage_users' },
  { key: 'vendors.view', label: 'View vendors', description: 'See the professional provider roster.', category: 'vendors', legacy: 'manage_team' },
  { key: 'vendors.invite', label: 'Invite vendors', description: 'Invite a professional provider to the Pinnacle Network.', category: 'vendors', legacy: 'manage_invitations' },
  { key: 'vendors.edit', label: 'Edit vendor profiles', description: 'Update provider service areas, categories, and profile fields.', category: 'vendors', legacy: 'manage_team' },
  { key: 'vendors.assign', label: 'Assign vendors to work', description: 'Assign providers to jobs and RON sessions.', category: 'vendors', legacy: 'manage_team' },
  { key: 'vendors.approve', label: 'Approve vendors', description: 'Move a vendor application from vetting to active.', category: 'vendors', legacy: 'manage_users' },
  { key: 'vendors.suspend', label: 'Suspend vendors', description: 'Suspend or reactivate a provider account.', category: 'vendors', legacy: 'manage_users' },
  { key: 'vendors.view_payment', label: 'View vendor payment info', description: 'View a provider\'s masked payment method summary.', category: 'vendors', legacy: 'reveal_payment_info' },

  // Reporting & audit
  { key: 'reporting.view', label: 'View reports', description: 'Open the Reporting Center within the granted scope.', category: 'reporting', legacy: 'view_reports' },
  { key: 'reporting.export', label: 'Export reports', description: 'Export report data or generate branded PDFs.', category: 'reporting', legacy: 'view_reports' },
  { key: 'reporting.create_saved_view', label: 'Save personal report views', description: 'Save a personal filtered view on any queue.', category: 'reporting', legacy: 'view_reports' },
  { key: 'reporting.share_saved_view', label: 'Share saved report views', description: 'Share a saved view with a team.', category: 'reporting', legacy: 'view_reports' },
  { key: 'audit.view', label: 'View audit log', description: 'Open the compliance audit trail in scope.', category: 'audit', legacy: 'view_audit_log' },
  { key: 'audit.export', label: 'Export audit log', description: 'Export audit entries. The export itself is audited.', category: 'audit', legacy: 'view_audit_log' },
  { key: 'audit.view_security', label: 'View security audit', description: 'See privileged security events (impersonation, permission changes, MFA changes).', category: 'audit', legacy: 'view_audit_log' },
  { key: 'audit.view_financial', label: 'View financial audit', description: 'See financial events (banking reveals, refunds, ledger exports).', category: 'audit', legacy: 'view_audit_log' },

  // Banking, billing, finance
  { key: 'banking.view_masked', label: 'View masked banking', description: 'See the last four digits of assigned bank accounts.', category: 'banking', legacy: 'reveal_payment_info' },
  { key: 'banking.reveal', label: 'Reveal banking information', description: 'Reveal full routing/account numbers. Requires step-up auth and is audited.', category: 'banking', legacy: 'reveal_payment_info', stepUp: true },
  { key: 'banking.manage_accounts', label: 'Manage bank accounts', description: 'Add or change firm bank account records.', category: 'banking', legacy: 'manage_settings', stepUp: true },
  { key: 'billing.view', label: 'View billing', description: 'Open the billing workspace in scope.', category: 'billing', legacy: 'view_reports' },
  { key: 'billing.create_invoice', label: 'Create invoices', description: 'Create new client invoices.', category: 'billing', legacy: 'manage_communications' },
  { key: 'billing.edit_invoice', label: 'Edit invoices', description: 'Edit unpaid invoices.', category: 'billing', legacy: 'manage_communications' },
  { key: 'billing.issue_credit', label: 'Issue credits', description: 'Apply a client account credit.', category: 'billing', legacy: 'manage_settings' },
  { key: 'billing.request_refund', label: 'Request refunds', description: 'Request a refund on a paid invoice.', category: 'billing', legacy: 'manage_settings' },
  { key: 'billing.process_refund', label: 'Process refunds', description: 'Approve and process a client refund.', category: 'billing', legacy: 'manage_settings', stepUp: true },
  { key: 'billing.export', label: 'Export billing data', description: 'Export invoice or payment records.', category: 'billing', legacy: 'view_reports' },
  { key: 'finance.reconcile', label: 'Reconcile finance', description: 'Match transactions to invoices and mark exceptions.', category: 'finance', legacy: 'view_reports' },
  { key: 'finance.view_ledger', label: 'View general ledger', description: 'Open the general ledger view.', category: 'finance', legacy: 'view_reports' },
  { key: 'finance.export', label: 'Export financial data', description: 'Export ledger or reconciliation reports.', category: 'finance', legacy: 'view_reports' },

  // Users & security
  { key: 'users.view', label: 'View users', description: 'Open the user administration list.', category: 'users', legacy: 'manage_users' },
  { key: 'users.create', label: 'Create users', description: 'Add a new user account.', category: 'users', legacy: 'manage_users' },
  { key: 'users.edit', label: 'Edit users', description: 'Update user profile settings.', category: 'users', legacy: 'manage_users' },
  { key: 'users.suspend', label: 'Suspend users', description: 'Suspend or reactivate a user account.', category: 'users', legacy: 'manage_users' },
  { key: 'users.assign_roles', label: 'Assign roles', description: 'Assign or change user roles. Owner-only for Owner or Admin escalation.', category: 'users', legacy: 'manage_users', stepUp: true },
  { key: 'roles.view', label: 'View roles', description: 'See the role catalog and per-role permissions.', category: 'users', legacy: 'manage_settings' },
  { key: 'roles.manage', label: 'Manage roles', description: 'Create, edit, or archive role templates.', category: 'users', legacy: 'manage_settings', stepUp: true },
  { key: 'firm_settings.view', label: 'View firm settings', description: 'Open the firm settings surface.', category: 'settings', legacy: 'manage_settings' },
  { key: 'firm_settings.manage', label: 'Manage firm settings', description: 'Change firm-wide operational settings.', category: 'settings', legacy: 'manage_settings', stepUp: true },
  { key: 'security.view', label: 'View security center', description: 'Open the Security Center.', category: 'security', legacy: 'view_audit_log' },
  { key: 'security.manage', label: 'Manage security', description: 'Change security policies, MFA enforcement, and session controls.', category: 'security', ownerOnly: true, stepUp: true },
  // Field-work location (see migration 0080). View-live and view-history
  // shim off the existing manage_field_work coarse key so any dispatch
  // role keeps its live-map view; export and manage require an explicit
  // grant because they expose historical location data in bulk.
  { key: 'field.location.view_live',    label: 'View live field locations', description: 'See the current or last-known field location for authorized assignments on the dispatch map.', category: 'field', legacy: 'manage_team' },
  { key: 'field.location.view_history', label: 'View field location history', description: 'Review the location trail associated with an assignment (arrival, on-site duration, completion location).', category: 'field', legacy: 'manage_team' },
  { key: 'field.location.export',       label: 'Export field location history', description: 'Export raw location trails as evidence. Requires step-up and is audited.', category: 'field', stepUp: true },
  { key: 'field.location.manage',       label: 'Manage location tracking policy', description: 'Configure geofence radii, retention windows, and tracking overrides for the firm.', category: 'field', stepUp: true },
]

const CATALOG_INDEX: Record<string, PermissionSpec> =
  PERMISSION_CATALOG.reduce((acc, spec) => { acc[spec.key] = spec; return acc }, {} as Record<string, PermissionSpec>)

export function permissionSpec(key: GranularPermission): PermissionSpec {
  return CATALOG_INDEX[key]
}

// The subject of an authorize() call. The concrete auth adapter server-side
// resolves this from the SessionUser; unit tests can construct it directly.
export interface AuthorizationSubject {
  userId: string
  accountRole: 'owner' | 'admin' | 'staff' | 'vendor' | 'client'
  // Granular permissions the role and per-user overrides explicitly grant.
  granularGrants: Set<GranularPermission>
  // Legacy coarse grants the user has (from role_permissions + user overrides).
  legacyGrants: Set<LegacyPermission>
  // How wide the user's grant reaches for the resource being checked. The
  // caller supplies a per-resource scope after the relationship graph resolves
  // (see resource.scope). The subject's own default scope is used when the
  // resource does not narrow it.
  defaultScope: DataScope
}

// Optional resource context handed to authorize(). For a resource query the
// server resolves the relationship graph and hands us the tightest scope the
// user actually has on THAT record. authorize() then checks scopeCovers().
export interface AuthorizationResource {
  // The scope at which the user actually reaches this resource (SELF if
  // owned personally, ASSIGNED if assigned to them, etc.). If the caller
  // doesn't know, they omit this and authorize() falls back to defaultScope.
  scope?: DataScope
  // Optional resource identifier for future audit context.
  id?: string
  type?: string
}

// Optional context signals authorize() honors (see spec section 40).
export interface AuthorizationContext {
  // True when the caller has completed a recent step-up auth confirmation.
  // Sensitive permissions require this even when granted by the role.
  stepUp?: boolean
  // Ordinary user actions carry no special context; sensitive callers set
  // reason so the eventual audit entry captures why the reveal happened.
  reason?: string
}

export interface AuthorizationDecision {
  allow: boolean
  reason:
    | 'owner'
    | 'admin'
    | 'granular_grant'
    | 'legacy_grant'
    | 'owner_only'
    | 'step_up_required'
    | 'unknown_permission'
    | 'scope_too_narrow'
    | 'no_grant'
}

// Central authorize service. Deny by default.
//
//   authorize({subject, action: 'documents.view', resource: {scope: 'ASSIGNED'}})
//
// The caller resolves subject + resource from the session and DB before
// invoking. This function only makes the deny/allow decision from the data
// it is given; it never touches D1 itself so it can be exercised by unit
// tests without a Cloudflare environment.
export function authorize(input: {
  subject: AuthorizationSubject
  action: GranularPermission
  resource?: AuthorizationResource
  context?: AuthorizationContext
}): AuthorizationDecision {
  const { subject, action, resource, context } = input

  // Owner always allowed. Admin allowed except for explicitly Owner-only
  // permissions (security.manage). This matches the spec's
  // "Owner authority remains non-delegable" line.
  if (subject.accountRole === 'owner') return decide(true, 'owner', input)
  const spec = permissionSpec(action)
  if (!spec) return decide(false, 'unknown_permission', input)
  // spec.ownerOnly rejects everyone below owner (owner short-circuited above).
  if (spec.ownerOnly) return decide(false, 'owner_only', input)
  if (subject.accountRole === 'admin') return afterStepUp('admin', input, spec)

  // Non-admin, non-owner: need an explicit grant.
  const granted =
    subject.granularGrants.has(action)
      ? 'granular_grant'
      : (spec.legacy && subject.legacyGrants.has(spec.legacy) ? 'legacy_grant' : null)
  if (!granted) return decide(false, 'no_grant', input)

  // Scope check: if the resource narrows to a scope the user's default does
  // not cover, deny. If the caller does not supply a resource scope, we trust
  // the default scope the subject already carries (the caller's data query
  // has already been narrowed to that scope).
  const requiredScope: DataScope = resource?.scope ?? subject.defaultScope
  if (!scopeCovers(subject.defaultScope, requiredScope)) return decide(false, 'scope_too_narrow', input)

  return afterStepUp(granted, input, spec)
}

function afterStepUp(
  reason: 'admin' | 'granular_grant' | 'legacy_grant',
  input: Parameters<typeof authorize>[0],
  spec: PermissionSpec,
): AuthorizationDecision {
  if (spec.stepUp && !input.context?.stepUp) return decide(false, 'step_up_required', input)
  return decide(true, reason, input)
}

function decide(
  allow: boolean,
  reason: AuthorizationDecision['reason'],
  _input: Parameters<typeof authorize>[0],
): AuthorizationDecision {
  return { allow, reason }
}
