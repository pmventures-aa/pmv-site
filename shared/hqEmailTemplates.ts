export type HqEmailCategory =
  | 'account'
  | 'invite'
  | 'billing'
  | 'nurture'
  | 'field'
  | 'notification'
  | 'custom'

export type HqEmailCatalogEntry = {
  slug: string
  name: string
  category: Exclude<HqEmailCategory, 'custom' | 'notification'>
  description: string
  sortOrder: number
  tokens: string[]
  subject: string
  preheader: string
  eyebrow: string
  title: string
  bodyHtml: string
  ctaLabel?: string
  ctaUrlToken?: string
  securityNote?: string
  wrapLetterhead?: number
}

const p = (...parts: string[]) => parts.map((text) => `<p style="margin:0 0 18px">${text}</p>`).join('')
const h = (text: string) => `<h2 style="margin:28px 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:500;line-height:28px;color:#0b1728">${text}</h2>`

export const HQ_EMAIL_SAMPLE_VARS: Record<string, string> = {
  first_name: 'Alex',
  full_name: 'Alex Morgan',
  email: 'alex@example.com',
  role_label: 'team member',
  workspace_label: 'your secure Client Portal',
  action_label: 'Open My Client Portal',
  action_url: 'https://www.pinnaclemanagementventures.com/portal',
  setup_note: 'Your secure setup link can be used once and expires in 24 hours. If it expires, contact Pinnacle and we can issue a new one.',
  invoice_label: 'INV-1042',
  amount: 'USD 480.00',
  due: 'August 20, 2026',
  invoice_message: 'Thank you for trusting Pinnacle with this work.',
  quote_number: 'Q-221',
  quote_title: 'Mobile notary and field support',
  quote_amount: '$640.00',
  quote_intro: 'Here is the scope we discussed, ready for your review.',
  valid_until: 'September 3, 2026',
  client_name: 'Northstar Group',
  event_subject: 'New lead from the public site',
  event_body: '<p>A new inquiry is waiting in HQ.</p>',
  assignment_title: 'Occupancy verification',
  site_address: '1200 Palm Trail, Delray Beach, FL',
}

export const HQ_EMAIL_CATALOG: HqEmailCatalogEntry[] = [
  {
    slug: 'account_welcome_client',
    name: 'Client welcome',
    category: 'account',
    description: 'Sent when a client account is created or invited.',
    sortOrder: 10,
    tokens: ['first_name', 'setup_note', 'action_label', 'action_url'],
    subject: 'Welcome to Pinnacle, {{first_name}}',
    preheader: 'Your Pinnacle client account is ready.',
    eyebrow: 'Client portal',
    title: 'Welcome to Pinnacle, {{first_name}}.',
    ctaLabel: '{{action_label}}',
    ctaUrlToken: 'action_url',
    securityNote: 'Pinnacle will never ask you to send your password by email. If you receive a message you are unsure about, contact us directly before providing information.',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Welcome to <strong>Pinnacle Management Ventures</strong>. Your account is ready, and we are glad you are here.',
      '<span style="font-family:Georgia,\'Times New Roman\',serif;font-size:19px;line-height:27px;color:#9a7838"><strong>Professional support. One call away.</strong></span>',
      'Pinnacle is here to help make complicated work easier to manage. You do not have to have everything mapped out before you start.',
    ) + h('Your Pinnacle Client Portal') + p(
      'Your secure portal gives you one place to stay connected with Pinnacle and keep your work organized.',
      'From your account, you can complete onboarding, request services, upload documents, send secure messages, and track billing.',
    ) + '{{#if setup_note}}<p style="margin:0 0 20px"><strong>{{setup_note}}</strong></p>{{/if}}' + h('Not sure where to begin?') + p(
      'Start with what is happening, what you are trying to accomplish, or what you need help getting done. We will help identify the right next step.',
      'Welcome to Pinnacle, {{first_name}}. We look forward to working with you.',
      'Warmly,<br><br><strong>The Pinnacle Management Ventures Team</strong><br>Professional Services &amp; Business Consulting<br>(561) 388-7879<br>pinnaclemanagementventures.com',
    ),
  },
  {
    slug: 'account_welcome_hq',
    name: 'HQ staff welcome',
    category: 'account',
    description: 'Sent when a staff or admin HQ account is created.',
    sortOrder: 11,
    tokens: ['first_name', 'role_label', 'action_label', 'action_url'],
    subject: 'You have been invited to Pinnacle HQ',
    preheader: 'Your Pinnacle HQ invitation is ready.',
    eyebrow: 'Pinnacle HQ',
    title: 'Welcome, {{first_name}}.',
    ctaLabel: '{{action_label}}',
    ctaUrlToken: 'action_url',
    securityNote: 'Pinnacle will never ask you to send your password by email. If you receive a message you are unsure about, contact us directly before providing information.',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Welcome to <strong>Pinnacle Management Ventures</strong>. An HQ account has been created for you as a Pinnacle {{role_label}}.',
      'Pinnacle HQ is the firm\'s internal workspace for client relationships, communications, assignments, and the work you are authorized to access.',
      '<strong>Use the secure button below to choose your password.</strong> The setup link can be used once and expires in 24 hours.',
      'If you were not expecting this invitation, reply to this email before setting up the account.',
    ),
  },
  {
    slug: 'vendor_application_received',
    name: 'Vendor application received',
    category: 'account',
    description: 'Confirms a vendor signup is pending review.',
    sortOrder: 12,
    tokens: ['first_name'],
    subject: 'We received your Pinnacle vendor application',
    preheader: 'Your Pinnacle vendor registration is pending review.',
    eyebrow: 'Vendor &amp; provider network',
    title: 'Application received.',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Thanks for registering with <strong>Pinnacle Management Ventures</strong>.',
      'Your vendor/provider profile has been received and is <strong>pending review</strong>. Your account will remain unavailable for sign-in until a Pinnacle administrator approves it.',
      'If you did not submit this registration, reply to this email and let us know.',
    ),
  },
  {
    slug: 'vendor_approved',
    name: 'Vendor approved',
    category: 'account',
    description: 'Sent when a vendor account is approved for HQ.',
    sortOrder: 13,
    tokens: ['first_name', 'action_url'],
    subject: 'Your Pinnacle vendor account has been approved',
    preheader: 'Your approved Pinnacle vendor account is ready to use.',
    eyebrow: 'Vendor &amp; provider network',
    title: 'You are approved, {{first_name}}.',
    ctaLabel: 'Open Pinnacle HQ',
    ctaUrlToken: 'action_url',
    securityNote: 'Pinnacle will never ask you to send your password by email.',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Your vendor/provider account with <strong>Pinnacle Management Ventures</strong> has been approved.',
      'You can now sign in to Pinnacle HQ using the email address and password you created when you registered.',
      'If you have trouble signing in, reply to this email and our team can help.',
    ),
  },
  {
    slug: 'portal_reminder',
    name: 'Portal or HQ reminder',
    category: 'account',
    description: 'A short reminder that the account is ready.',
    sortOrder: 14,
    tokens: ['first_name', 'workspace_label', 'action_label', 'action_url'],
    subject: 'Your Pinnacle account is ready',
    preheader: 'Your Pinnacle account is active and ready.',
    eyebrow: 'Pinnacle',
    title: 'Welcome back, {{first_name}}.',
    ctaLabel: '{{action_label}}',
    ctaUrlToken: 'action_url',
    securityNote: 'Pinnacle will never ask you to send your password by email.',
    bodyHtml: p(
      'Hi {{first_name}},',
      'This is a quick reminder that your Pinnacle account is active and ready whenever you need it.',
      'Use the button below to return to {{workspace_label}}.',
    ),
  },
  {
    slug: 'password_reset',
    name: 'Password reset',
    category: 'account',
    description: 'Secure one-time password reset. The button always uses the generated reset link.',
    sortOrder: 15,
    tokens: ['first_name', 'action_url'],
    subject: 'Reset your Pinnacle password',
    preheader: 'Reset your Pinnacle password',
    eyebrow: 'Pinnacle account security',
    title: 'Reset your password',
    ctaLabel: 'Reset My Password',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'We received a request to reset the password for your Pinnacle account. This secure link expires in 30 minutes and can be used only once.',
      'If you did not request this, you can ignore this email. Your current password will remain unchanged.',
    ),
  },
  {
    slug: 'invite_client',
    name: 'Client invitation',
    category: 'invite',
    description: 'Private client signup invitation.',
    sortOrder: 20,
    tokens: ['first_name', 'action_url'],
    subject: 'Your Pinnacle client invitation',
    preheader: 'Your private Pinnacle invitation expires in 24 hours.',
    eyebrow: 'Client portal',
    title: 'You are invited to Pinnacle',
    ctaLabel: 'Set Up Your Account',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'You have been invited to open a Pinnacle Management Ventures client account.',
      'Use your private setup link to create the account. This invitation expires in 24 hours. If you were not expecting it, you can ignore this message or contact Pinnacle before creating an account.',
    ),
  },
  {
    slug: 'invite_staff',
    name: 'HQ staff invitation',
    category: 'invite',
    description: 'Private HQ staff setup invitation.',
    sortOrder: 21,
    tokens: ['first_name', 'action_url'],
    subject: 'Your Pinnacle HQ invitation',
    preheader: 'Your private Pinnacle invitation expires in 24 hours.',
    eyebrow: 'Pinnacle HQ',
    title: 'Set up your Pinnacle team account',
    ctaLabel: 'Set Up HQ Access',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'You have been invited to Pinnacle Management Ventures with a defined role and permission set. HQ will show only the tools and client information your account is authorized to access.',
      'Use your private setup link to create your account. This invitation expires in 24 hours.',
    ),
  },
  {
    slug: 'invite_vendor',
    name: 'Vendor invitation',
    category: 'invite',
    description: 'Invitation to apply to the provider network.',
    sortOrder: 22,
    tokens: ['first_name', 'action_url'],
    subject: 'You are invited to Pinnacle\'s provider network',
    preheader: 'A personal invitation to apply to Pinnacle\'s professional provider network.',
    eyebrow: 'Vendor &amp; provider network',
    title: 'Apply to the Pinnacle network',
    ctaLabel: 'Continue Your Application',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Pinnacle Management Ventures invited you to apply to our professional provider network.',
      'Use your private link to continue the application. This invitation expires in 24 hours.',
    ),
  },
  {
    slug: 'invite_trusted_contact',
    name: 'Trusted contact invitation',
    category: 'invite',
    description: 'Invitation for a client-designated trusted contact.',
    sortOrder: 23,
    tokens: ['first_name', 'client_name', 'action_url'],
    subject: 'You have been added as a Pinnacle trusted contact',
    preheader: 'Your private Pinnacle invitation expires in 24 hours.',
    eyebrow: 'Trusted contact',
    title: '{{client_name}} invited you to Pinnacle',
    ctaLabel: 'Accept Invitation',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      '{{#if client_name}}{{client_name}} invited you{{/if}}{{#unless client_name}}A Pinnacle client invited you{{/unless}} to be a trusted contact on their Pinnacle account.',
      'You will only see what they choose to share. This invitation expires in 24 hours.',
    ),
  },
  {
    slug: 'invoice_send',
    name: 'Invoice',
    category: 'billing',
    description: 'Sent when HQ emails an invoice to a client.',
    sortOrder: 30,
    tokens: ['first_name', 'invoice_label', 'amount', 'due', 'invoice_message', 'action_url'],
    subject: '{{invoice_label}} - {{amount}}',
    preheader: 'Your Pinnacle invoice is ready in the Client Portal.',
    eyebrow: 'Billing',
    title: 'Invoice {{invoice_label}}',
    ctaLabel: 'View invoice in your Client Portal',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Pinnacle Management Ventures has prepared invoice <strong>{{invoice_label}}</strong> for <strong>{{amount}}</strong>, due {{due}}.',
      '{{#if invoice_message}}{{invoice_message}}{{/if}}',
      'This invoice records the amount and available payment methods. Online card/ACH charging is not enabled in Pinnacle at this time.',
    ),
  },
  {
    slug: 'quote_send',
    name: 'Quote',
    category: 'billing',
    description: 'Sent when HQ emails a branded quote.',
    sortOrder: 31,
    tokens: ['first_name', 'quote_number', 'quote_title', 'quote_amount', 'quote_intro', 'valid_until', 'action_url'],
    subject: 'Your Pinnacle quote {{quote_number}} - {{quote_amount}}',
    preheader: 'Review and accept your Pinnacle quote.',
    eyebrow: 'Quote',
    title: 'Quote {{quote_number}}',
    ctaLabel: 'Review and accept your quote',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Pinnacle Management Ventures has prepared quote <strong>{{quote_number}}</strong> - {{quote_title}} - for <strong>{{quote_amount}}</strong>.',
      '{{#if quote_intro}}{{quote_intro}}{{/if}}',
      '{{#if valid_until}}This quote is valid through {{valid_until}}.{{/if}}',
      'Reply to this email or call (561) 388-7879 with any questions.',
    ),
  },
  {
    slug: 'field_assignment_audit',
    name: 'Field assignment audit',
    category: 'field',
    description: 'Client-facing audit trail after a field or RON assignment is completed. Dynamic tables still append after this letter.',
    sortOrder: 40,
    tokens: ['first_name', 'assignment_title', 'site_address'],
    subject: 'Completed field assignment: {{assignment_title}}',
    preheader: 'Your Pinnacle field assignment is complete.',
    eyebrow: 'Field work',
    title: 'Assignment complete',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Pinnacle completed <strong>{{assignment_title}}</strong>{{#if site_address}} at {{site_address}}{{/if}}.',
      'The audit details for this visit follow this letter.',
    ),
  },
  {
    slug: 'nurture_day2_how_pinnacle_works',
    name: 'Nurture day 2: how Pinnacle works',
    category: 'nurture',
    description: 'Day 2 of the 14-day client discovery sequence.',
    sortOrder: 50,
    tokens: ['first_name', 'action_url'],
    subject: '{{first_name}}, here is how Pinnacle works around you',
    preheader: 'One relationship, clear next steps, and the right support when you need it.',
    eyebrow: 'Your Pinnacle journey',
    title: 'You do not need to know the answer before you ask.',
    ctaLabel: 'Explore My Portal',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Pinnacle is built around a simple idea: you should be able to start with the situation, not a service name. Tell us what you are trying to accomplish and we help define the scope, coordinate the right resources, and keep the next step visible.',
      'Your portal is the home base for that relationship: services, documents, messages, appointments, billing, and the people helping you move things forward.',
    ),
  },
  {
    slug: 'nurture_day4_explore_services',
    name: 'Nurture day 4: explore services',
    category: 'nurture',
    description: 'Day 4 of the 14-day client discovery sequence.',
    sortOrder: 51,
    tokens: ['first_name', 'action_url'],
    subject: 'A few ways Pinnacle can make the work easier',
    preheader: 'Explore business, property, document, and professional support at your own pace.',
    eyebrow: 'Discover support',
    title: 'Use what helps now. Discover the rest when it becomes useful.',
    ctaLabel: 'Explore Services',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Clients use Pinnacle for very different reasons. Some need a one-time property visit. Others need help changing a POS system, organizing a business project, preparing for funding, coordinating documents, or simply getting administrative work off their plate.',
      'You do not need to choose a package. Browse the service library and start with one practical need.',
    ),
  },
  {
    slug: 'nurture_day6_network',
    name: 'Nurture day 6: the network',
    category: 'nurture',
    description: 'Day 6 of the 14-day client discovery sequence.',
    sortOrder: 52,
    tokens: ['first_name', 'action_url'],
    subject: 'The right professional, without starting over',
    preheader: 'How Pinnacle\'s vetted professional network supports client work.',
    eyebrow: 'The Pinnacle network',
    title: 'Some problems need a specialist. You should not have to rebuild the relationship.',
    ctaLabel: 'See How the Network Works',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'When work calls for outside expertise, licensed support, local field work, or another specialty, Pinnacle can coordinate a vetted professional around the engagement.',
      'The goal is not to pretend one company does everything. The value is having one relationship that helps identify the right resource and keep the work coordinated.',
    ),
  },
  {
    slug: 'nurture_day8_use_case',
    name: 'Nurture day 8: one request',
    category: 'nurture',
    description: 'Day 8 of the 14-day client discovery sequence.',
    sortOrder: 53,
    tokens: ['first_name', 'action_url'],
    subject: 'One request can solve more than one part of the problem',
    preheader: 'A simple example of how Pinnacle coordinates work around a client need.',
    eyebrow: 'One relationship',
    title: 'The request may be simple. The coordination usually is not.',
    ctaLabel: 'Tell Us What You Need',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Imagine a property owner who needs an occupancy verification, current photos, a document delivered, and a notarized form. Those are four separate tasks, but they do not need to become four disconnected vendor relationships.',
      'Pinnacle can help organize the scope, coordinate the right people, keep documents together, and give the client one place to see what is happening next.',
    ),
  },
  {
    slug: 'nurture_day10_did_you_know',
    name: 'Nurture day 10: did you know',
    category: 'nurture',
    description: 'Day 10 of the 14-day client discovery sequence.',
    sortOrder: 54,
    tokens: ['first_name', 'action_url'],
    subject: 'Did you know Pinnacle can help with these too?',
    preheader: 'A few less-obvious services available through your Pinnacle relationship.',
    eyebrow: 'Did you know?',
    title: 'Pinnacle is broader than one service category.',
    ctaLabel: 'Browse the Service Library',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Beyond the obvious requests, clients can use Pinnacle for things like payment/POS transitions, vendor coordination, property photo verification, courier/document runs, funding-readiness support, and ongoing administrative projects.',
      'If you are spending time figuring out who should handle something, that is often a good reason to ask us first.',
    ),
  },
  {
    slug: 'nurture_day12_portal',
    name: 'Nurture day 12: portal',
    category: 'nurture',
    description: 'Day 12 of the 14-day client discovery sequence.',
    sortOrder: 55,
    tokens: ['first_name', 'action_url'],
    subject: 'Your Pinnacle portal is more useful as the relationship grows',
    preheader: 'Messages, documents, work, appointments, and billing stay connected.',
    eyebrow: 'Your workspace',
    title: 'Less chasing. More context in one place.',
    ctaLabel: 'Open My Portal',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Your Client Portal is designed to become more useful over time. Messages stay connected to the relationship. Documents live with the work. Applications and service requests have a status.',
      'You can also invite a Trusted Contact and choose exactly what that person can view or edit.',
    ),
  },
  {
    slug: 'nurture_day14_next',
    name: 'Nurture day 14: what is next',
    category: 'nurture',
    description: 'Day 14 of the 14-day client discovery sequence.',
    sortOrder: 56,
    tokens: ['first_name', 'action_url'],
    subject: '{{first_name}}, what would make the next two weeks easier?',
    preheader: 'Start the next request or simply tell Pinnacle what you are working through.',
    eyebrow: 'What is next',
    title: 'What can we help make easier next?',
    ctaLabel: 'Start a Service Request',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'You have had a little time to look around Pinnacle. There is no expectation that you use everything. The point is to have a professional relationship you can return to when something needs ownership, coordination, or a clearer next step.',
      'If there is something on your list, start there. We can help determine what happens next.',
    ),
  },
  {
    slug: 'staff_notification',
    name: 'Staff event notification',
    category: 'account',
    description: 'Fallback branded wrapper for HQ staff event emails. Per-event copy can override this from the notification list.',
    sortOrder: 90,
    tokens: ['event_subject', 'event_body'],
    subject: '{{event_subject}}',
    preheader: '{{event_subject}}',
    eyebrow: 'Pinnacle HQ notification',
    title: '{{event_subject}}',
    bodyHtml: '{{event_body}}',
  },
]

export const HQ_EMAIL_CATEGORY_LABEL: Record<HqEmailCategory, string> = {
  account: 'Accounts & access',
  invite: 'Invitations',
  billing: 'Invoices & quotes',
  nurture: 'Client discovery',
  field: 'Field work',
  notification: 'HQ notifications',
  custom: 'Custom',
}

export function hqEmailCatalogBySlug(slug: string): HqEmailCatalogEntry | undefined {
  return HQ_EMAIL_CATALOG.find((item) => item.slug === slug)
}

export function slugifyHqEmailName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60)
  return slug || `template_${Date.now().toString(36)}`
}

export function mergeHqTemplatePlain(value: string, vars: Record<string, string>): string {
  return applyHqTemplateBlocks(value, vars).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => vars[key] ?? '')
}

export function mergeHqTemplateHtml(value: string, vars: Record<string, string>): string {
  const escaped: Record<string, string> = {}
  for (const [key, raw] of Object.entries(vars)) escaped[key] = escapeHqEmailHtml(raw)
  return applyHqTemplateBlocks(value, vars).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    if (key === 'event_body') return vars[key] ?? ''
    return escaped[key] ?? ''
  })
}

function applyHqTemplateBlocks(value: string, vars: Record<string, string>): string {
  return value
    .replace(/\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key: string, body: string) => vars[key] ? body : '')
    .replace(/\{\{#unless\s+([\w.]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, key: string, body: string) => vars[key] ? '' : body)
}

export function escapeHqEmailHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function hqEmailTextFromHtml(html: string): string {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
