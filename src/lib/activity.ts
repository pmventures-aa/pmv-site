export interface ActivityEvent {
  id: string
  actor_user_id: string | null
  actor_name?: string | null
  actor_email?: string | null
  client_user_id: string | null
  client_name?: string | null
  client_email?: string | null
  kind: string
  detail: string | null
  created_at: string
}

export type ActivityCategory = 'security' | 'client' | 'money' | 'operations' | 'communications' | 'other'

// Kinds tagged 'security' render with red styling in HQ. Kept intentionally
// narrow to sign-in / access / permission / data-egress events so the color
// stays a real signal instead of visual noise.
const SECURITY_KINDS = new Set<string>([
  'login',
  'logout',
  'login_failed',
  'password_changed',
  'password_reset',
  'permission_changed',
  'staff_profile_updated',
  'user_status_changed',
  'user_created',
  'payment_info_revealed',
  'record_archived',
  'record_restored',
  'record_permanently_deleted',
])
const MONEY_KINDS = new Set<string>([
  'invoice_created',
  'invoice_sent',
  'invoice_status_changed',
  'invoice_reminder_sent',
  'funding_created',
  'funding_status_changed',
])
const CLIENT_KINDS = new Set<string>([
  'client_signed_up',
  'onboarding_completed',
  'inquiry_submitted',
  'inquiry_status_changed',
  'lead_profile_updated',
  'lead_note_added',
  'client_profile_updated',
  'crm_import_completed',
])
const COMMUNICATIONS_KINDS = new Set<string>([
  'message_received',
  'message_sent',
  'message_attachment_added',
  'comms_message_created',
  'comms_message_sent',
  'account_welcome_sent',
  'account_invite_sent',
  'portal_reminder_sent',
  'vendor_application_email_sent',
  'vendor_approval_email_sent',
  'account_email_failed',
  'email.inbound',
  'email.sent',
  'conversation.created',
  'conversation.message',
  'conversation.internal_note',
])

export function categorizeActivity(kind: string): ActivityCategory {
  if (SECURITY_KINDS.has(kind)) return 'security'
  if (MONEY_KINDS.has(kind)) return 'money'
  if (CLIENT_KINDS.has(kind)) return 'client'
  if (COMMUNICATIONS_KINDS.has(kind)) return 'communications'
  if (
    kind.startsWith('matter') ||
    kind.startsWith('task') ||
    kind.startsWith('ticket') ||
    kind.startsWith('call') ||
    kind.startsWith('appointment') ||
    kind.startsWith('property') ||
    kind.startsWith('tax') ||
    kind.startsWith('service') ||
    kind.startsWith('field_assignment') ||
    kind.startsWith('bulk_')
  ) {
    return 'operations'
  }
  return 'other'
}

export function isSecurityKind(kind: string): boolean {
  return categorizeActivity(kind) === 'security'
}

function fmtStatus(s?: string): string { return s ? s.replace(/_/g, ' ') : 'Not provided' }
function money(cents?: number | null): string { return typeof cents === 'number' ? `$${(cents / 100).toLocaleString()}` : 'an amount' }

export function describeActivity(e: ActivityEvent): string {
  let d: any = {}
  try { d = e.detail ? JSON.parse(e.detail) : {} } catch { d = {} }
  const actor = e.actor_name || e.actor_email || 'Someone'
  const client = e.client_name || e.client_email || 'a client'

  switch (e.kind) {
    case 'inquiry_submitted': return `New CRM lead: ${d.name || d.email || 'a new contact'}${d.service_key ? ` · ${fmtStatus(d.service_key)}` : ''}`
    case 'inquiry_status_changed': return `${actor} moved ${d.name || d.email || 'a lead'} to ${fmtStatus(d.to)}`
    case 'lead_profile_updated': return `${actor} updated a lead/prospect profile`
    case 'lead_note_added': return `${actor} added an internal note to a lead/prospect`
    case 'crm_import_completed': return `${actor} completed a CRM import · ${d.created ?? 0} new · ${d.updated ?? 0} updated · ${d.skipped ?? 0} skipped`
    case 'comms_message_created': return `${actor} created a ${fmtStatus(d.message_type)} communication “${d.subject || ''}”${typeof d.eligible_recipients === 'number' ? ` for ${d.eligible_recipients} eligible recipient${d.eligible_recipients === 1 ? '' : 's'}` : ''}`
    case 'comms_message_sent':
      if (typeof d.to === 'string' && d.to) return `${actor} sent “${d.subject || 'a communication'}” to ${e.client_name || e.client_email || d.to}`
      return `${actor} sent “${d.subject || 'a communication'}” to ${d.recipients ?? 'selected'} recipient${d.recipients === 1 ? '' : 's'}`
    case 'client_signed_up': return `${client} signed up${d.business_name ? ` (${d.business_name})` : ''}`
    case 'user_created': return `${actor} created a${d.role === 'admin' ? 'n' : ''} ${d.role} account for ${d.full_name || d.email}`
    case 'user_status_changed': return `${actor} updated ${d.name || 'a user'}: ${d.to?.status ?? ''} · ${d.to?.role ?? ''}`.trim()
    case 'account_welcome_sent': return `Welcome email sent to ${d.email || client}`
    case 'account_invite_sent': return `Account setup invitation sent to ${d.email || client}`
    case 'portal_reminder_sent': return `Portal access reminder sent to ${d.email || client}`
    case 'vendor_application_email_sent': return `Vendor application receipt sent to ${d.email || 'the applicant'}`
    case 'vendor_approval_email_sent': return `Vendor approval email sent to ${d.email || 'the vendor'}`
    case 'account_email_failed': return `Account email ${fmtStatus(d.status)} for ${d.email || client}${d.error ? ` · ${d.error}` : ''}`
    case 'onboarding_completed': return `${client} completed onboarding`
    case 'matter_created': return `${actor} opened matter “${d.title}” for ${client}`
    case 'matter_status_changed': return `${actor} moved “${d.title}” (${client}) to ${fmtStatus(d.to)}`
    case 'task_created': return `${actor} added task “${d.title}” for ${client}`
    case 'task_status_changed': return `${actor} marked “${d.title}” (${client}) as ${fmtStatus(d.to)}`
    case 'ticket_created': return `${actor} opened ticket “${d.subject}” for ${client}`
    case 'ticket_status_changed': return `${actor} set ticket “${d.subject}” (${client}) to ${fmtStatus(d.to)}`
    case 'call_created': return `${actor} requested a call: “${d.topic}” for ${client}`
    case 'call_status_changed': return `${actor} set call “${d.topic}” (${client}) to ${fmtStatus(d.to)}`
    case 'appointment_created': return `${actor} scheduled “${d.title}” for ${client}`
    case 'appointment_status_changed': return `${actor} set appointment “${d.title}” (${client}) to ${fmtStatus(d.to)}`
    case 'invoice_created': return `${actor} created an invoice for ${money(d.amount_cents)} for ${client}${d.invoice_number ? ` · ${d.invoice_number}` : ''}`
    case 'invoice_sent': return `${actor} sent ${d.invoice_number || 'an invoice'} to ${d.recipients ?? 1} recipient${d.recipients === 1 ? '' : 's'} for ${client}`
    case 'invoice_status_changed': return `${actor} marked ${client}’s invoice as ${fmtStatus(d.to)}`
    case 'invoice_reminder_sent': return `${actor} sent a payment reminder to ${client}${d.invoice_number ? ` for ${d.invoice_number}` : ''}`
    case 'service_assigned_by_staff': return `${actor} assigned ${d.service_name || fmtStatus(d.service_key)} to ${client}: awaiting their signature`
    case 'funding_created': return `${actor} opened a funding application for ${client}`
    case 'funding_status_changed': return `${actor} set ${client}’s funding application to ${fmtStatus(d.to)}`
    case 'property_created': return `${actor} added property “${d.address}” for ${client}`
    case 'property_status_changed': return `${actor} set “${d.address}” (${client}) to ${fmtStatus(d.to)}`
    case 'tax_filing_created': return `${actor} opened a ${d.tax_year ?? ''} tax filing for ${client}`
    case 'tax_filing_status_changed': return `${actor} set ${client}’s ${d.tax_year ?? ''} tax filing to ${fmtStatus(d.to)}`
    case 'login': return `${actor} signed in${d.location ? ` from ${d.location}` : ''}${d.ip ? ` · ${d.ip}` : ''}`
    case 'logout': return `${actor} signed out`
    case 'login_failed': return `Failed sign-in attempt for ${d.email || 'a user'}${d.ip ? ` from ${d.ip}` : ''}`
    case 'password_changed': return `${actor} changed their password`
    case 'password_reset': return `${actor} reset the password for ${d.email || 'a user'}`
    case 'permission_changed': return `${actor} changed permissions${d.target_name ? ` for ${d.target_name}` : ''}`
    case 'field_assignment_created': return `${actor} created a field assignment for ${client}${d.kind_value === 'ron' ? ' (RON)' : ''}`
    case 'field_assignment_completed': return `${actor} completed a field assignment for ${client}${typeof d.documents === 'number' ? `: ${d.documents} document${d.documents === 1 ? '' : 's'}` : ''}`
    case 'service_application_assigned': return `${actor} started ${client}’s ${d.service_name || fmtStatus(d.service_key)} application${typeof d.prefilled_answers === 'number' ? ` · ${d.prefilled_answers} answers prefilled` : ''}`
    case 'service_application_prefilled': return `${actor} updated a service application draft for ${client}`
    case 'service_application_signed': return `${client} electronically signed a service application`
    case 'service_application_submitted': return `${client} submitted an application for ${d.service_name || fmtStatus(d.service_key)}`
    case 'service_status_changed': return `${actor} set ${client}’s ${fmtStatus(d.service_key)} application to ${fmtStatus(d.to)}`
    case 'payment_info_revealed': return `${actor} viewed banking details for ${client} (account ending ${d.account_last4 ?? '····'})`
    case 'staff_profile_updated': return `${actor} updated ${d.name || 'a staff member'}’s role to ${fmtStatus(d.staff_role)}`
    case 'client_profile_updated': return `${actor} updated ${client}’s profile`
    case 'bulk_assignment_created': return `${actor} assigned ${d.client_count ?? 'several'} client${d.client_count === 1 ? '' : 's'} to a staff member`
    case 'message_received': return `${client} sent a message: “${d.subject}”`
    case 'message_sent': return `${actor} sent a message to ${client}: “${d.subject}”`
    case 'message_attachment_added': return `${actor} attached “${d.file_name}” to a message${d.subject ? `: “${d.subject}”` : ''}`
    case 'email.inbound': return `Email reply from ${d.from_name || d.from || 'a sender'}: “${d.subject || 'no subject'}”`
    case 'email.sent': return `${actor} sent an email${e.client_name || e.client_email ? ` to ${client}` : ''}: “${d.subject || 'no subject'}”`
    case 'conversation.created': return `${actor} started a conversation${d.subject ? `: “${d.subject}”` : ''}`
    case 'conversation.message': return `${actor} sent a staff message${d.subject ? ` in “${d.subject}”` : ''}${e.client_name || e.client_email ? ` for ${client}` : ''}`
    case 'conversation.internal_note': return `${actor} added an internal note${d.subject ? ` in “${d.subject}”` : ''}`
    default: return fmtStatus(e.kind)
  }
}

export function parseSqliteUtc(s: string): Date {
  if (!s) return new Date(NaN)
  const raw = s.includes('T') ? s : `${s.replace(' ', 'T')}Z`
  return new Date(raw)
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - parseSqliteUtc(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return parseSqliteUtc(iso).toLocaleDateString()
}
