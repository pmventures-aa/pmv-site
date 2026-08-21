// Centralized registry of every template variable HQ email templates can
// reference. This is the single source of truth for:
//   - the Insert Variable picker in the HQ template editor
//   - the sample-data preview values used by the editor's live preview
//   - server-side resolvers that ensure no {{token}} ever leaks to a real
//     outgoing email
//
// Adding a new variable means adding a row here plus updating the resolver
// that actually populates it for the relevant trigger. Do NOT scatter new
// variable definitions across components.

export type EmailVariableCategory =
  | 'recipient'
  | 'client'
  | 'matter'
  | 'calendar'
  | 'document'
  | 'billing'
  | 'property'
  | 'network'
  | 'trusted_contact'
  | 'system'

export interface EmailVariable {
  key: string
  label: string
  description: string
  category: EmailVariableCategory
  example: string
  // Trigger/template slugs where this variable is expected to resolve.
  // undefined means "safe for any template". The editor uses this to warn
  // (not block) staff when they insert something the current template will
  // not carry.
  applicableTo?: string[]
  // Fallback the resolver should substitute when the source record has no
  // value. Empty string is the safest default and matches the renderer's
  // built-in behavior of replacing unresolved tokens with ''.
  fallback?: string
  // System variables are not user-editable and cannot be deleted from the
  // registry - staff picker hides destructive controls when this is true.
  system?: boolean
}

export const EMAIL_VARIABLE_CATEGORY_LABEL: Record<EmailVariableCategory, string> = {
  recipient: 'Recipient',
  client: 'Client / Account',
  matter: 'Matter / Service',
  calendar: 'Calendar / Appointment',
  document: 'Documents & e-sign',
  billing: 'Billing & quotes',
  property: 'Property / Field work',
  network: 'Network / Provider',
  trusted_contact: 'Trusted contact',
  system: 'System / Pinnacle',
}

export const EMAIL_VARIABLES: EmailVariable[] = [
  // Recipient
  { key: 'first_name', label: 'Recipient first name', description: 'The recipient\'s first name.', category: 'recipient', example: 'Cody', system: true },
  { key: 'last_name', label: 'Recipient last name', description: 'The recipient\'s last name.', category: 'recipient', example: 'Marshall', system: true },
  { key: 'full_name', label: 'Recipient full name', description: 'The recipient\'s full display name.', category: 'recipient', example: 'Cody Marshall', system: true },
  { key: 'email', label: 'Recipient email', description: 'The recipient\'s email address.', category: 'recipient', example: 'cody@example.com', system: true },
  { key: 'phone', label: 'Recipient phone', description: 'The recipient\'s phone number when known.', category: 'recipient', example: '(561) 555-0148' },

  // Client / Account
  { key: 'client_name', label: 'Client name', description: 'The name of the Pinnacle client this message is about.', category: 'client', example: 'Northstar Group' },
  { key: 'business_name', label: 'Business name', description: 'The client\'s registered business name if it differs from the personal name.', category: 'client', example: 'Northstar Holdings LLC' },
  { key: 'property_name', label: 'Property name', description: 'A friendly label for the relevant property.', category: 'property', example: 'Palm Trail Villa' },
  { key: 'portal_url', label: 'Client portal URL', description: 'Deep link into the client\'s portal home.', category: 'client', example: 'https://client.pinnaclemanagementventures.com/', system: true },
  { key: 'account_status', label: 'Account status', description: 'Current lifecycle state of the account (active, invited, paused, closed).', category: 'client', example: 'active' },

  // Matter / Service
  { key: 'matter_name', label: 'Matter name', description: 'The client-facing name of the Matter this email is about.', category: 'matter', example: 'Occupancy verification' },
  { key: 'matter_status', label: 'Matter status', description: 'Client-friendly Matter status label.', category: 'matter', example: 'Pinnacle is working' },
  { key: 'next_step', label: 'Next step', description: 'One-sentence description of the next action for the recipient.', category: 'matter', example: 'Upload the last two utility bills.' },
  { key: 'assigned_contact', label: 'Assigned contact', description: 'The Pinnacle team member assigned to this matter or service.', category: 'matter', example: 'Cody Marshall' },
  { key: 'service_name', label: 'Service name', description: 'The Pinnacle service this record relates to.', category: 'matter', example: 'Mobile notary' },
  { key: 'service_status', label: 'Service status', description: 'Current status of the service request.', category: 'matter', example: 'Assigned' },

  // Calendar / Appointment
  { key: 'appointment_title', label: 'Appointment title', description: 'Short title of the appointment.', category: 'calendar', example: 'Client kickoff call' },
  { key: 'event_title', label: 'Event title', description: 'Calendar event title.', category: 'calendar', example: 'Site walkthrough' },
  { key: 'event_date', label: 'Event date', description: 'Human-readable event date.', category: 'calendar', example: 'August 20, 2026' },
  { key: 'event_time', label: 'Event time', description: 'Human-readable event start time.', category: 'calendar', example: '10:30 AM' },
  { key: 'event_timezone', label: 'Event timezone', description: 'IANA-friendly timezone label.', category: 'calendar', example: 'US Eastern' },
  { key: 'event_location', label: 'Event location', description: 'Physical or virtual meeting location.', category: 'calendar', example: '1200 Palm Trail, Delray Beach FL' },
  { key: 'meeting_url', label: 'Meeting URL', description: 'Video conference or dial-in link.', category: 'calendar', example: 'https://meet.example.com/pmv-1234' },
  { key: 'scheduled_at', label: 'Scheduled at', description: 'Full scheduled date/time for a service or task.', category: 'calendar', example: 'August 20, 2026 at 10:30 AM ET' },

  // Documents & e-sign
  { key: 'document_name', label: 'Document name', description: 'The referenced document title.', category: 'document', example: '2025 W-9.pdf' },
  { key: 'document_status', label: 'Document status', description: 'Client-friendly document status.', category: 'document', example: 'Under review' },
  { key: 'agreement_name', label: 'Agreement name', description: 'Title of an e-sign agreement.', category: 'document', example: 'Pinnacle Service Agreement' },
  { key: 'signature_due_date', label: 'Signature due date', description: 'Deadline for completing signatures.', category: 'document', example: 'August 22, 2026' },

  // Billing & quotes
  { key: 'invoice_number', label: 'Invoice number', description: 'Human-readable invoice number.', category: 'billing', example: 'INV-1042' },
  { key: 'amount', label: 'Amount', description: 'Invoice or quote amount, formatted.', category: 'billing', example: '$549.00' },
  { key: 'balance_due', label: 'Balance due', description: 'Remaining balance on the invoice.', category: 'billing', example: '$549.00' },
  { key: 'due_date', label: 'Due date', description: 'When the invoice is due.', category: 'billing', example: 'August 20, 2026' },
  { key: 'invoice_description', label: 'Invoice description', description: 'Short description of what the invoice covers.', category: 'billing', example: 'Field service and travel for August visit.' },
  { key: 'quote_amount', label: 'Quote amount', description: 'The total quoted amount.', category: 'billing', example: '$640.00' },
  { key: 'quote_url', label: 'Quote URL', description: 'Deep link to the client-facing quote.', category: 'billing', example: 'https://client.pinnaclemanagementventures.com/quote/abc' },

  // Property / Field work
  { key: 'property_address', label: 'Property address', description: 'Full address of the relevant property.', category: 'property', example: '1200 Palm Trail, Delray Beach FL 33483' },
  { key: 'turnover_date', label: 'Turnover date', description: 'The date the turnover is scheduled for.', category: 'property', example: 'August 20, 2026' },
  { key: 'checkout_time', label: 'Checkout time', description: 'Guest checkout time.', category: 'property', example: '10:00 AM' },
  { key: 'check_in_time', label: 'Guest check-in time', description: 'Next guest check-in time.', category: 'property', example: '4:00 PM' },
  { key: 'turnover_window', label: 'Turnover window', description: 'The time window available to complete the turnover.', category: 'property', example: '10:00 AM - 3:00 PM' },
  { key: 'provider_name', label: 'Provider name', description: 'The network provider assigned to the work.', category: 'network', example: 'Mia Alvarez' },
  { key: 'provider_name_or_unassigned', label: 'Provider name (or Unassigned)', description: 'The provider name, or the word "Unassigned" if no one has picked it up.', category: 'network', example: 'Mia Alvarez' },
  { key: 'issue_type', label: 'Issue type', description: 'Category of a reported turnover issue.', category: 'property', example: 'Missing supplies' },
  { key: 'issue_summary', label: 'Issue summary', description: 'One-line summary of the reported issue.', category: 'property', example: 'Two extra bath towels needed for the primary bathroom.' },
  { key: 'supply_item', label: 'Supply item', description: 'A property supply item name.', category: 'property', example: 'Bath towels' },
  { key: 'supply_status', label: 'Supply status', description: 'Current stock status for the supply item.', category: 'property', example: 'Low' },
  { key: 'completed_at', label: 'Completed at', description: 'When the work was completed.', category: 'property', example: 'August 20, 2026 at 12:14 PM ET' },
  { key: 'risk_reason', label: 'Risk reason', description: 'Why a turnover is flagged as at risk.', category: 'property', example: 'Provider has not accepted the assignment.' },
  { key: 'severity', label: 'Severity', description: 'Severity of a reported issue.', category: 'property', example: 'High' },
  { key: 'can_continue', label: 'Can turnover continue?', description: 'Yes/No indicator on whether the turnover can proceed despite the issue.', category: 'property', example: 'Yes' },

  // Network / Provider
  { key: 'services', label: 'Services', description: 'List of services the provider offers.', category: 'network', example: 'Mobile notary, courier, occupancy verification' },
  { key: 'service_area', label: 'Service area', description: 'Coverage area for a provider.', category: 'network', example: 'Palm Beach & Broward Counties, FL' },
  { key: 'assignment_name', label: 'Assignment name', description: 'Name of a field assignment.', category: 'network', example: 'Occupancy verification - 1200 Palm Trail' },
  { key: 'assignment_payout', label: 'Assignment payout', description: 'Provider payout amount for the assignment.', category: 'network', example: '$85.00' },
  { key: 'status', label: 'Status', description: 'Current status of the referenced record.', category: 'network', example: 'In progress' },
  { key: 'location', label: 'Location', description: 'Property or site the work is at.', category: 'network', example: '1200 Palm Trail, Delray Beach FL' },

  // Trusted contact
  { key: 'trusted_contact_name', label: 'Trusted contact name', description: 'Name of the invited trusted contact.', category: 'trusted_contact', example: 'Jamie Ellis' },
  { key: 'contact_name', label: 'Contact name', description: 'Name of the trusted contact being referenced.', category: 'trusted_contact', example: 'Jamie Ellis' },
  { key: 'access_summary', label: 'Access summary', description: 'Short summary of what the trusted contact can see or do.', category: 'trusted_contact', example: 'View documents and appointments' },

  // System
  { key: 'today', label: 'Today', description: 'Today\'s date, rendered friendly.', category: 'system', example: 'August 16, 2026', system: true },
  { key: 'current_year', label: 'Current year', description: 'Four-digit current year.', category: 'system', example: '2026', system: true },
  { key: 'pinnacle_phone', label: 'Pinnacle phone', description: 'The firm phone number.', category: 'system', example: '(561) 388-7879', system: true },
  { key: 'pinnacle_email', label: 'Pinnacle email', description: 'The firm reply-to email.', category: 'system', example: 'hello@pinnaclemanagementventures.com', system: true },
  { key: 'company_name', label: 'Company name', description: 'The firm display name.', category: 'system', example: 'Pinnacle Management Ventures', system: true },
  { key: 'sender_name', label: 'Sender name', description: 'The name of the HQ staff member who triggered this email.', category: 'system', example: 'Alex Morgan' },
  { key: 'sender_title', label: 'Sender title', description: 'The sender\'s role or title at Pinnacle.', category: 'system', example: 'Client Services Lead' },
  { key: 'platform_name', label: 'Platform name', description: '"Pinnacle HQ" or "your Pinnacle Client Portal" depending on the recipient.', category: 'system', example: 'your Pinnacle Client Portal', system: true },
  { key: 'reminder_message', label: 'Reminder message', description: 'Short reminder body inserted into portal reminder emails.', category: 'system', example: 'You have a document waiting for review.', applicableTo: ['portal_reminder'] },
  { key: 'setup_note', label: 'Setup link note', description: 'Short note explaining the one-time secure setup link and how long it lasts.', category: 'system', example: 'Your secure setup link can be used once and expires in 24 hours.', system: true },
  { key: 'action_label', label: 'Button label', description: 'Text shown on the email\'s call to action button.', category: 'system', example: 'Open My Client Portal', system: true },
  { key: 'action_url', label: 'Button URL', description: 'Where the email\'s call to action button goes.', category: 'system', example: 'https://client.pinnaclemanagementventures.com/', system: true },
  { key: 'registered_at', label: 'Registered at', description: 'When the record was created.', category: 'system', example: 'August 16, 2026 at 9:04 AM ET' },
  { key: 'submitted_at', label: 'Submitted at', description: 'When the record was submitted.', category: 'system', example: 'August 16, 2026 at 9:04 AM ET' },
  { key: 'uploaded_at', label: 'Uploaded at', description: 'When a file was uploaded.', category: 'system', example: 'August 16, 2026 at 9:04 AM ET' },
  { key: 'last_activity_date', label: 'Last activity date', description: 'When the client last did anything with Pinnacle.', category: 'system', example: 'July 16, 2026' },
  { key: 'waiting_since', label: 'Waiting since', description: 'How long a message or request has been waiting.', category: 'system', example: '2 business days' },
  { key: 'source', label: 'Source', description: 'Where the lead or record originated.', category: 'system', example: 'Website contact form' },
  { key: 'urgency', label: 'Urgency', description: 'Client-stated timing or urgency.', category: 'system', example: 'Within 48 hours' },
  { key: 'context', label: 'Context', description: 'Additional short context added to the notification.', category: 'system', example: 'Client requested a same-day call.' },
  { key: 'message_preview', label: 'Message preview', description: 'Short preview of the referenced message body.', category: 'system', example: 'Just following up on the quote you sent last week.' },
]

const EMAIL_VARIABLE_INDEX: Record<string, EmailVariable> =
  EMAIL_VARIABLES.reduce((acc, v) => { acc[v.key] = v; return acc }, {} as Record<string, EmailVariable>)

export function emailVariable(key: string): EmailVariable | undefined {
  return EMAIL_VARIABLE_INDEX[key]
}

export function isKnownEmailVariable(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(EMAIL_VARIABLE_INDEX, key)
}

export function emailVariablesByCategory(): Array<{ category: EmailVariableCategory; label: string; items: EmailVariable[] }> {
  const order: EmailVariableCategory[] = [
    'recipient', 'client', 'matter', 'calendar', 'document', 'billing',
    'property', 'network', 'trusted_contact', 'system',
  ]
  return order.map((category) => ({
    category,
    label: EMAIL_VARIABLE_CATEGORY_LABEL[category],
    items: EMAIL_VARIABLES.filter((v) => v.category === category),
  }))
}

// Extract every {{token}} referenced in a template string, ignoring block
// markers ({{#if ...}} / {{/if}} / {{#unless ...}} / {{/unless}}).
export function extractTemplateTokens(source: string | null | undefined): string[] {
  if (!source) return []
  const found = new Set<string>()
  const re = /\{\{\s*([\w.]+)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) found.add(m[1])
  return Array.from(found)
}

// Extract tokens *and* block-referenced tokens (used for validation - a
// template may include {{#if invoice_number}}...{{/if}} without ever rendering
// the raw value; that still counts as a referenced variable).
export function extractAllReferencedTokens(source: string | null | undefined): string[] {
  if (!source) return []
  const found = new Set<string>(extractTemplateTokens(source))
  const blockRe = /\{\{\s*#(?:if|unless)\s+([\w.]+)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(source)) !== null) found.add(m[1])
  return Array.from(found)
}

// Given a merged, ready-to-send string, return the tokens that remain
// unresolved. Real sends should never call the renderer with these left
// over - the renderer's default is to replace unknowns with '', but this
// helper lets us verify explicitly in tests + validation.
export function findUnresolvedTokens(rendered: string): string[] {
  return extractTemplateTokens(rendered)
}

// Substitute every {{token}} in a template string with a resolved value.
// Unknown or unprovided tokens become '' by default (matching the email
// renderer, so no raw {{token}} ever reaches a reader); pass keepUnknown to
// leave them intact for an in-editor preview that wants to show what is missing.
export function resolveTemplateTokens(
  source: string | null | undefined,
  vars: Record<string, string>,
  opts?: { keepUnknown?: boolean },
): string {
  if (!source) return ''
  return source.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key]
    return opts?.keepUnknown ? whole : ''
  })
}

// Sample data for the preview panel. Anything not in this map falls back to
// the per-variable example on the EmailVariable definition.
export function buildEmailPreviewVars(overrides?: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {}
  for (const v of EMAIL_VARIABLES) base[v.key] = v.example
  return overrides ? { ...base, ...overrides } : base
}
