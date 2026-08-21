import { buildEmailPreviewVars } from './emailVariables'

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
  category: Exclude<HqEmailCategory, 'custom' | 'notification'> | 'notification'
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

// Paragraph and heading helpers keep the letterhead-friendly HTML compact.
const p = (...parts: string[]) => parts.map((text) => `<p style="margin:0 0 18px">${text}</p>`).join('')
const h = (text: string) => `<h2 style="margin:28px 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:500;line-height:28px;color:#0b1728">${text}</h2>`
const kv = (label: string, value: string) => `<p style="margin:0 0 6px"><strong>${label}:</strong> ${value}</p>`
const signature = `<p style="margin:24px 0 0">Warmly,<br><br><strong>Pinnacle Management Ventures</strong><br>Professional Support. One Call Away.<br>{{pinnacle_phone}}<br>{{pinnacle_email}}</p>`
const brief = (blocks: string[]) => blocks.map((b) => `<p style="margin:0 0 10px">${b}</p>`).join('')

// Sample values used by the editor preview when the template is inspected
// out-of-context. Sourced from the centralized emailVariables registry so
// there is one authoritative example per variable.
export const HQ_EMAIL_SAMPLE_VARS: Record<string, string> = buildEmailPreviewVars({
  // Fill some slugs that used older naming so the preview never shows blanks.
  role_label: 'team member',
  workspace_label: 'your secure Client Portal',
  invoice_label: 'INV-1042',
  due: 'August 20, 2026',
  invoice_message: 'Thank you for trusting Pinnacle with this work.',
  quote_number: 'Q-221',
  quote_title: 'Mobile notary and field support',
  quote_intro: 'Here is the scope we discussed, ready for your review.',
  valid_until: 'September 3, 2026',
  event_subject: 'New lead from the public site',
  event_body: '<p>A new inquiry is waiting in HQ.</p>',
  assignment_title: 'Occupancy verification',
  site_address: '1200 Palm Trail, Delray Beach, FL',
  setup_note: 'Your secure setup link can be used once and expires in 24 hours.',
})

export const HQ_EMAIL_CATALOG: HqEmailCatalogEntry[] = [
  // -----------------------------------------------------------------
  // CLIENT ACCOUNT + PORTAL LIFECYCLE
  // -----------------------------------------------------------------
  {
    slug: 'account_welcome_client',
    name: 'Client welcome',
    category: 'account',
    description: 'Sent when a client account is created.',
    sortOrder: 10,
    tokens: ['first_name', 'portal_url', 'action_label', 'action_url'],
    subject: 'Welcome to Pinnacle, {{first_name}}',
    preheader: 'Your Pinnacle Client Portal is ready when you are.',
    eyebrow: 'Client portal',
    title: 'Welcome to Pinnacle, {{first_name}}.',
    ctaLabel: 'Go to My Portal',
    ctaUrlToken: 'portal_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Welcome to Pinnacle. Your account is ready, and you can now use your Client Portal to keep up with requests, documents, appointments, invoices, and anything else we are handling together.',
      'The goal is simple: less chasing things down, fewer loose ends, and one place to see what is happening.',
      'If you need anything along the way, just reach out. We are glad to have you with us.',
    ) + signature,
  },
  {
    slug: 'account_welcome_hq',
    name: 'HQ staff welcome',
    category: 'account',
    description: 'Sent when a staff or admin HQ account is created.',
    sortOrder: 11,
    tokens: ['first_name', 'action_label', 'action_url'],
    subject: 'Welcome to Pinnacle HQ',
    preheader: 'Your Pinnacle HQ account is active.',
    eyebrow: 'Pinnacle HQ',
    title: 'Welcome, {{first_name}}.',
    ctaLabel: 'Open Pinnacle HQ',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Welcome aboard. Your Pinnacle HQ account is active and ready to go.',
      'HQ is where we manage clients, Matters, assignments, documents, scheduling, communication, and the day-to-day work moving through Pinnacle.',
      'Take a few minutes to get familiar with your dashboard and profile before jumping in.',
      'Glad to have you on the team.',
    ),
  },
  {
    slug: 'vendor_application_received',
    name: 'Vendor application received',
    category: 'account',
    description: 'Confirms a Network application is under review.',
    sortOrder: 12,
    tokens: ['first_name', 'action_url'],
    subject: 'We received your Pinnacle Network application',
    preheader: 'Your Network application is being reviewed.',
    eyebrow: 'Pinnacle Network',
    title: 'Application received.',
    ctaLabel: 'View Application',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Thanks for your interest in working with Pinnacle.',
      'We have received your Network application and will review your service areas, experience, availability, and any credentials you provided.',
      'There is nothing else you need to do right now. If we need anything additional, we will reach out.',
      'We appreciate your interest in becoming part of the Pinnacle Network.',
    ),
  },
  {
    slug: 'vendor_approved',
    name: 'Vendor approved',
    category: 'account',
    description: 'Sent when a Network vendor/provider is approved.',
    sortOrder: 13,
    tokens: ['first_name', 'action_url'],
    subject: "You're approved for the Pinnacle Network",
    preheader: 'Your Pinnacle Network account is active.',
    eyebrow: 'Pinnacle Network',
    title: 'You are approved, {{first_name}}.',
    ctaLabel: 'Open My Network Portal',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Good news. Your Pinnacle Network application has been approved.',
      'You are now eligible to receive assignments that match your services, location, availability, and qualifications.',
      'You will always be able to review the assignment details before deciding whether to accept available work.',
      'Welcome to the Network. We are looking forward to working together.',
    ),
  },
  {
    slug: 'portal_reminder',
    name: 'Portal or HQ reminder',
    category: 'account',
    description: 'Short reminder that something is waiting in the portal or HQ.',
    sortOrder: 14,
    tokens: ['first_name', 'platform_name', 'reminder_message', 'action_label', 'action_url'],
    subject: 'A quick reminder from Pinnacle',
    preheader: 'Something is waiting for you in Pinnacle.',
    eyebrow: 'Pinnacle',
    title: 'Just a quick reminder',
    ctaLabel: '{{action_label}}',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Just a quick reminder that you have something waiting for you in {{platform_name}}.',
      '{{reminder_message}}',
      "If you've already taken care of it, you're all set.",
    ),
  },
  {
    slug: 'password_reset',
    name: 'Password reset',
    category: 'account',
    description: 'Secure one-time password reset link.',
    sortOrder: 15,
    tokens: ['first_name', 'action_url'],
    subject: 'Reset your Pinnacle password',
    preheader: 'A one-time link to reset your Pinnacle password.',
    eyebrow: 'Pinnacle account security',
    title: 'Reset your password',
    ctaLabel: 'Reset Password',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'We received a request to reset the password for your Pinnacle account.',
      'Use the button below to choose a new password.',
      'This link will expire for security purposes.',
      "If you didn't request a password reset, you can ignore this email. Your current password will remain unchanged.",
    ),
  },
  {
    slug: 'staff_event_notification',
    name: 'Staff event notification',
    category: 'account',
    description: 'Notifies a staff member that they have been added to a Pinnacle calendar event.',
    sortOrder: 16,
    tokens: ['first_name', 'event_title', 'event_date', 'event_time', 'event_location', 'context', 'action_url'],
    subject: '{{event_title}} | {{event_date}}',
    preheader: 'You have been added to a Pinnacle event.',
    eyebrow: 'Pinnacle calendar',
    title: '{{event_title}}',
    ctaLabel: 'View Event',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      "You've been added to a Pinnacle event.",
      '<strong>{{event_title}}</strong><br>{{event_date}} at {{event_time}}<br>{{event_location}}',
    ) + '{{#if context}}' + p('{{context}}') + '{{/if}}' + p(
      'Any updates to the schedule will appear in your Pinnacle calendar.',
    ),
  },

  // -----------------------------------------------------------------
  // INVITATIONS
  // -----------------------------------------------------------------
  {
    slug: 'invite_client',
    name: 'Client invitation',
    category: 'invite',
    description: 'Invites a new client to create their Pinnacle account.',
    sortOrder: 20,
    tokens: ['first_name', 'action_url'],
    subject: "You've been invited to Pinnacle",
    preheader: 'Set up your Pinnacle Client Portal.',
    eyebrow: 'Client portal',
    title: 'You are invited to Pinnacle',
    ctaLabel: 'Accept Invitation',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      "You've been invited to create your Pinnacle Client Portal account.",
      'Your portal gives you one place to follow the work we are handling together, share documents, review agreements and invoices, see upcoming appointments, and stay up to date without having to chase down an update.',
      'We look forward to working with you.',
    ),
  },
  {
    slug: 'invite_staff',
    name: 'HQ staff invitation',
    category: 'invite',
    description: 'Invites a new staff member to set up an HQ account.',
    sortOrder: 21,
    tokens: ['first_name', 'action_url'],
    subject: 'Your Pinnacle HQ invitation',
    preheader: 'Set up your Pinnacle HQ account.',
    eyebrow: 'Pinnacle HQ',
    title: 'Set up your Pinnacle HQ account',
    ctaLabel: 'Set Up My Account',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      "You've been invited to join Pinnacle HQ.",
      'Use the link below to set up your account and access the tools and areas assigned to your role.',
      "Once you're in, take a minute to complete your profile and review your dashboard.",
      'Welcome to Pinnacle.',
    ),
  },
  {
    slug: 'invite_vendor',
    name: 'Vendor invitation',
    category: 'invite',
    description: 'Invites a professional to apply to the Pinnacle Network.',
    sortOrder: 22,
    tokens: ['first_name', 'action_url'],
    subject: 'Join the Pinnacle Network',
    preheader: 'A personal invitation to apply to the Pinnacle Network.',
    eyebrow: 'Pinnacle Network',
    title: 'Join the Pinnacle Network',
    ctaLabel: 'Join the Pinnacle Network',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      "I'd like to invite you to join the Pinnacle Network.",
      'We work with independent professionals across a growing range of field, property, document, administrative, and professional services. Approved Network members may receive assignments based on service type, location, qualifications, and availability.',
      "There's no obligation to accept every opportunity. You'll be able to review available assignment details before accepting work.",
      "I'd be glad to have you connected with us.",
    ),
  },
  {
    slug: 'invite_trusted_contact',
    name: 'Trusted contact invitation',
    category: 'invite',
    description: 'Invites a client-designated trusted contact to Pinnacle.',
    sortOrder: 23,
    tokens: ['first_name', 'client_name', 'action_url'],
    subject: '{{client_name}} invited you to connect with Pinnacle',
    preheader: 'A client has added you as a Trusted Contact.',
    eyebrow: 'Trusted contact',
    title: '{{client_name}} invited you to Pinnacle',
    ctaLabel: 'Review Invitation',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      '{{client_name}} has invited you to become a Trusted Contact on their Pinnacle account.',
      "Depending on the access they've authorized, this may allow you to assist with certain Matters, documents, appointments, communication, or other account activity.",
      "Your access will remain separate from the client's own login and will be limited to what has been authorized.",
    ),
  },

  // -----------------------------------------------------------------
  // BILLING (client-facing)
  // -----------------------------------------------------------------
  {
    slug: 'invoice_send',
    name: 'Invoice (client)',
    category: 'billing',
    description: 'Sent to a client when HQ issues an invoice.',
    sortOrder: 30,
    tokens: ['first_name', 'invoice_number', 'amount', 'due_date', 'invoice_description', 'action_url'],
    subject: 'Pinnacle Invoice {{invoice_number}} | {{amount}}',
    preheader: 'Your Pinnacle invoice is ready.',
    eyebrow: 'Billing',
    title: 'Invoice {{invoice_number}}',
    ctaLabel: 'View Invoice',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'A new invoice is available from Pinnacle.',
      kv('Invoice', '{{invoice_number}}') + kv('Amount', '{{amount}}') + kv('Due', '{{due_date}}'),
    ) + '{{#if invoice_description}}' + p('{{invoice_description}}') + '{{/if}}' + p(
      'You can review the invoice and available payment options through your portal.',
      'Questions about the invoice? Just let us know.',
    ),
  },
  {
    slug: 'quote_send',
    name: 'Quote (client)',
    category: 'billing',
    description: 'Sent to a client when HQ issues a quote.',
    sortOrder: 31,
    tokens: ['first_name', 'quote_amount', 'quote_url'],
    subject: 'Your Pinnacle quote is ready',
    preheader: 'Review and accept your Pinnacle quote.',
    eyebrow: 'Quote',
    title: 'Your quote is ready',
    ctaLabel: 'Review Quote',
    ctaUrlToken: 'quote_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      "We've finished reviewing your request and your quote is ready.",
      "It includes the work Pinnacle is proposing to handle, pricing, and the next steps if you'd like to move forward.",
      "Take a look when you have a chance. If something needs to be adjusted or you have questions before approving it, reach out and we'll work through it with you.",
    ),
  },

  // -----------------------------------------------------------------
  // FIELD (client-facing)
  // -----------------------------------------------------------------
  {
    slug: 'field_assignment_audit',
    name: 'Field assignment audit',
    category: 'field',
    description: 'Client-facing audit-trail letter after a field or RON assignment completes. Dynamic tables append after this letter.',
    sortOrder: 40,
    tokens: ['first_name', 'assignment_name', 'location', 'provider_name', 'status', 'context', 'action_url'],
    subject: 'Field assignment requires review | {{assignment_name}}',
    preheader: 'A completed field assignment is ready for your review.',
    eyebrow: 'Field work',
    title: 'Assignment complete',
    ctaLabel: 'Review Assignment',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'A field assignment needs review before it can be closed.',
      kv('Assignment', '{{assignment_name}}') + kv('Property/Location', '{{location}}') + kv('Provider', '{{provider_name}}') + kv('Status', '{{status}}'),
    ) + '{{#if context}}' + p('{{context}}') + '{{/if}}' + p(
      'Please review the submitted work, photos, checklist, and any reported issues before completing the assignment.',
    ),
  },

  // -----------------------------------------------------------------
  // NURTURE — 14-day client discovery sequence
  // -----------------------------------------------------------------
  {
    slug: 'nurture_day2_how_pinnacle_works',
    name: 'Nurture day 2: how Pinnacle works',
    category: 'nurture',
    description: 'Day 2 of the 14-day client discovery sequence.',
    sortOrder: 50,
    tokens: ['first_name', 'action_url'],
    subject: "You don't have to know who handles it",
    preheader: 'Start with what you are trying to get done.',
    eyebrow: 'Your Pinnacle journey',
    title: 'One request. One relationship. Less runaround.',
    ctaLabel: 'Tell Us What You Need Help With',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      "One thing worth knowing about Pinnacle: you don't need to figure out the exact service you need before reaching out.",
      "Start with what you're trying to get done.",
      "We'll look at the situation, determine how Pinnacle may be able to help, and make the next step clear.",
      'Sometimes we handle the work directly. Other times we coordinate the right people and moving pieces around it.',
      'Either way, the idea is the same: <strong>one request, one relationship, less runaround.</strong>',
    ),
  },
  {
    slug: 'nurture_day4_explore_services',
    name: 'Nurture day 4: explore services',
    category: 'nurture',
    description: 'Day 4 of the 14-day client discovery sequence.',
    sortOrder: 51,
    tokens: ['first_name', 'action_url'],
    subject: "There's probably more Pinnacle can handle than you think",
    preheader: 'Business, property, documents, field, admin - all in one relationship.',
    eyebrow: 'Discover support',
    title: 'One relationship. Somewhere to start.',
    ctaLabel: 'Explore Pinnacle Services',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Pinnacle was built to be useful across more than one kind of problem.',
      'We support clients with business operations, property needs, documents, field work, administrative projects, payments and systems, and other matters that simply need someone to take ownership and follow through.',
      "You don't need to use everything we offer.",
      "But when something else comes up, it's good to know you already have somewhere to start.",
    ),
  },
  {
    slug: 'nurture_day6_network',
    name: 'Nurture day 6: the network',
    category: 'nurture',
    description: 'Day 6 of the 14-day client discovery sequence.',
    sortOrder: 52,
    tokens: ['first_name', 'action_url'],
    subject: 'What we mean by the Pinnacle Network',
    preheader: 'One relationship. The right professionals coordinated around it.',
    eyebrow: 'The Pinnacle network',
    title: 'You start with Pinnacle. We coordinate the rest.',
    ctaLabel: 'See How Pinnacle Works',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'Not every Matter requires the same kind of person.',
      "That's why Pinnacle is building a Network of professionals and providers we can coordinate with based on the work, location, and qualifications required.",
      'For you, that means fewer calls to five different companies trying to figure out who can actually help.',
      'You start with Pinnacle. We help coordinate the rest.',
    ),
  },
  {
    slug: 'nurture_day8_use_case',
    name: 'Nurture day 8: one request',
    category: 'nurture',
    description: 'Day 8 of the 14-day client discovery sequence.',
    sortOrder: 53,
    tokens: ['first_name', 'action_url'],
    subject: 'Sometimes it really can start with one request',
    preheader: 'Tell us what is happening. We help figure out what belongs next.',
    eyebrow: 'One relationship',
    title: 'One request. Several moving pieces.',
    ctaLabel: 'Start a Request',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'A lot of professional services make you choose from a long menu before anyone understands what you actually need.',
      'We try to do it differently.',
      "Tell us what's happening. Give us the basics. We'll help figure out what belongs next.",
      'Whether it is one simple task or something with several moving pieces, you can start in the same place.',
    ),
  },
  {
    slug: 'nurture_day10_did_you_know',
    name: 'Nurture day 10: did you know',
    category: 'nurture',
    description: 'Day 10 of the 14-day client discovery sequence.',
    sortOrder: 54,
    tokens: ['first_name', 'action_url'],
    subject: 'Did you know Pinnacle can help with this too?',
    preheader: 'A quick look at what else Pinnacle can coordinate.',
    eyebrow: 'Did you know?',
    title: 'A quick one today.',
    ctaLabel: 'Ask Pinnacle',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'A quick one today.',
      "Pinnacle isn't limited to one-time consulting or administrative work.",
      'Depending on the Matter, we can also help coordinate field visits, property support, document work, vendors, business systems, recurring services, and other projects that need someone keeping the pieces organized.',
      "If something has been sitting on your list because you're not sure who handles it, send it our way.",
    ),
  },
  {
    slug: 'nurture_day12_portal',
    name: 'Nurture day 12: portal',
    category: 'nurture',
    description: 'Day 12 of the 14-day client discovery sequence.',
    sortOrder: 55,
    tokens: ['first_name', 'action_url'],
    subject: "Everything shouldn't live in your inbox",
    preheader: 'Your Matters, docs, appointments, and invoices in one place.',
    eyebrow: 'Your workspace',
    title: 'Less inbox. More context in one place.',
    ctaLabel: 'Open My Portal',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      'One reason we built the Pinnacle Client Portal was pretty simple:',
      "You shouldn't have to search through three weeks of emails just to figure out what's happening.",
      'Your portal keeps your Matters, documents, appointments, invoices, agreements, requests, and updates together in one place.',
      "When Pinnacle needs something from you, you'll know. When we're handling it, you'll know that too.",
    ),
  },
  {
    slug: 'nurture_day14_next',
    name: 'Nurture day 14: what is next',
    category: 'nurture',
    description: 'Day 14 of the 14-day client discovery sequence.',
    sortOrder: 56,
    tokens: ['first_name', 'action_url'],
    subject: 'What can Pinnacle help you get handled next?',
    preheader: 'Tell us what is on your list. We take it from there.',
    eyebrow: 'What is next',
    title: 'What do you need to get handled?',
    ctaLabel: 'Start a Request',
    ctaUrlToken: 'action_url',
    bodyHtml: p(
      'Hi {{first_name}},',
      "Over the last couple of weeks, we've given you a better look at how Pinnacle works and the kinds of things we can help coordinate.",
      'Now the important question is much simpler:',
      '<strong>What do you need to get handled?</strong>',
      "It doesn't have to fit perfectly into a service category. Tell us what's going on and we'll take it from there.",
      "We're here when you need us.",
    ),
  },

  // -----------------------------------------------------------------
  // HQ OPERATIONAL NOTIFICATIONS - short, action-oriented
  // -----------------------------------------------------------------
  {
    slug: 'notify_application_followup',
    name: 'HQ: application needs follow-up',
    category: 'notification',
    description: 'Alerts HQ when an application requires attention.',
    sortOrder: 100,
    tokens: ['full_name', 'service_name', 'status', 'context', 'action_url'],
    subject: 'Follow-up needed | {{full_name}}',
    preheader: 'An application needs HQ attention.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'Application follow-up',
    ctaLabel: 'Review Application',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      "{{full_name}}'s application needs attention.",
      kv('Application', '{{service_name}}'),
      kv('Status', '{{status}}'),
      '{{#if context}}' + kv('Reason', '{{context}}') + '{{/if}}',
    ]),
  },
  {
    slug: 'notify_appointment_scheduled',
    name: 'HQ: appointment scheduled',
    category: 'notification',
    description: 'Alerts HQ when a new appointment is booked.',
    sortOrder: 101,
    tokens: ['appointment_title', 'event_date', 'event_time', 'client_name', 'matter_name', 'action_url'],
    subject: 'New appointment | {{appointment_title}}',
    preheader: 'A new Pinnacle appointment is on the calendar.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'New appointment',
    ctaLabel: 'View Appointment',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      'A new appointment has been scheduled.',
      '<strong>{{appointment_title}}</strong>',
      '{{event_date}} at {{event_time}}',
      kv('With', '{{client_name}}'),
      '{{#if matter_name}}' + kv('Matter', '{{matter_name}}') + '{{/if}}',
    ]),
  },
  {
    slug: 'notify_client_inactive_30d',
    name: 'HQ: client inactive 30 days',
    category: 'notification',
    description: 'Alerts HQ when a client has been inactive for 30 days.',
    sortOrder: 102,
    tokens: ['client_name', 'last_activity_date', 'action_url'],
    subject: 'Client inactive 30 days | {{client_name}}',
    preheader: 'A client has had no activity for 30 days.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'Client inactive',
    ctaLabel: 'Review Client',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      '{{client_name}} has had no recorded activity with Pinnacle for 30 days.',
      kv('Last activity', '{{last_activity_date}}'),
      'Consider whether a follow-up, service check-in, or relationship update is appropriate.',
    ]),
  },
  {
    slug: 'notify_invoice_due',
    name: 'HQ: invoice due reminder',
    category: 'notification',
    description: 'Alerts HQ when a client invoice is coming due or is overdue.',
    sortOrder: 103,
    tokens: ['invoice_number', 'client_name', 'amount', 'balance_due', 'due_date', 'action_url'],
    subject: 'Invoice due | {{client_name}} | {{amount}}',
    preheader: 'A client invoice is due soon.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'Invoice due',
    ctaLabel: 'View Invoice',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      'Invoice {{invoice_number}} for {{client_name}} is due {{due_date}}.',
      kv('Balance', '{{balance_due}}'),
    ]),
  },
  {
    slug: 'notify_message_awaiting_response',
    name: 'HQ: message awaiting response',
    category: 'notification',
    description: 'Alerts HQ when a message has been waiting for a Pinnacle reply.',
    sortOrder: 104,
    tokens: ['sender_name', 'waiting_since', 'context', 'action_url'],
    subject: 'Response needed | {{sender_name}}',
    preheader: 'A message is waiting for a Pinnacle response.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'Response needed',
    ctaLabel: 'Respond',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      'A message has been waiting for a Pinnacle response since {{waiting_since}}.',
      kv('From', '{{sender_name}}'),
      '{{#if context}}' + kv('Regarding', '{{context}}') + '{{/if}}',
    ]),
  },
  {
    slug: 'notify_new_client_registration',
    name: 'HQ: new client registration',
    category: 'notification',
    description: 'Alerts HQ when a client creates a portal account.',
    sortOrder: 105,
    tokens: ['client_name', 'source', 'registered_at', 'action_url'],
    subject: 'New client registered | {{client_name}}',
    preheader: 'A new client has joined Pinnacle.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'New client',
    ctaLabel: 'Open Client',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      '{{client_name}} has created a Pinnacle Client Portal account.',
      kv('Source', '{{source}}'),
      kv('Registered', '{{registered_at}}'),
    ]),
  },
  {
    slug: 'notify_new_document_uploaded',
    name: 'HQ: new document uploaded',
    category: 'notification',
    description: 'Alerts HQ when a client uploads a document.',
    sortOrder: 106,
    tokens: ['client_name', 'document_name', 'matter_name', 'uploaded_at', 'action_url'],
    subject: 'New document | {{client_name}}',
    preheader: 'A client has uploaded a document.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'New document',
    ctaLabel: 'Review Document',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      '{{client_name}} uploaded a document.',
      kv('Document', '{{document_name}}'),
      '{{#if matter_name}}' + kv('Matter', '{{matter_name}}') + '{{/if}}',
      kv('Uploaded', '{{uploaded_at}}'),
    ]),
  },
  {
    slug: 'notify_new_invoice',
    name: 'HQ: new invoice created',
    category: 'notification',
    description: 'Alerts HQ when a new invoice is created.',
    sortOrder: 107,
    tokens: ['client_name', 'invoice_number', 'amount', 'due_date', 'action_url'],
    subject: 'Invoice created | {{client_name}} | {{amount}}',
    preheader: 'A new invoice is ready to send.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'New invoice',
    ctaLabel: 'View Invoice',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      'A new invoice has been created.',
      kv('Client', '{{client_name}}'),
      kv('Invoice', '{{invoice_number}}'),
      kv('Amount', '{{amount}}'),
      kv('Due', '{{due_date}}'),
    ]),
  },
  {
    slug: 'notify_new_lead',
    name: 'HQ: new lead or prospect',
    category: 'notification',
    description: 'Alerts HQ when a new lead enters Pinnacle.',
    sortOrder: 108,
    tokens: ['full_name', 'service_name', 'source', 'urgency', 'action_url'],
    subject: 'New Pinnacle lead | {{full_name}}',
    preheader: 'A new lead is waiting in HQ.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'New lead',
    ctaLabel: 'Review Lead',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      'A new lead has entered Pinnacle.',
      kv('Name', '{{full_name}}'),
      '{{#if service_name}}' + kv('Service', '{{service_name}}') + '{{/if}}',
      '{{#if source}}' + kv('Source', '{{source}}') + '{{/if}}',
      '{{#if urgency}}' + kv('Timing', '{{urgency}}') + '{{/if}}',
    ]),
  },
  {
    slug: 'notify_new_message',
    name: 'HQ: new message received',
    category: 'notification',
    description: 'Alerts HQ when a new inbound message arrives.',
    sortOrder: 109,
    tokens: ['sender_name', 'context', 'message_preview', 'action_url'],
    subject: 'New message from {{sender_name}}',
    preheader: 'A new message is waiting in HQ.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'New message',
    ctaLabel: 'Open Message',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      'You have a new message from {{sender_name}}.',
      '{{#if context}}' + kv('Regarding', '{{context}}') + '{{/if}}',
      '{{#if message_preview}}<em>"{{message_preview}}"</em>{{/if}}',
    ]),
  },
  {
    slug: 'notify_new_provider_application',
    name: 'HQ: new provider application',
    category: 'notification',
    description: 'Alerts HQ when a new Network application arrives.',
    sortOrder: 110,
    tokens: ['provider_name', 'services', 'service_area', 'action_url'],
    subject: 'New Network application | {{provider_name}}',
    preheader: 'A new Pinnacle Network application is ready for review.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'New Network application',
    ctaLabel: 'Review Application',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      'A new Pinnacle Network application is ready for review.',
      kv('Provider', '{{provider_name}}'),
      '{{#if services}}' + kv('Services', '{{services}}') + '{{/if}}',
      '{{#if service_area}}' + kv('Area', '{{service_area}}') + '{{/if}}',
    ]),
  },
  {
    slug: 'notify_property_guest_ready',
    name: 'HQ: property guest ready',
    category: 'notification',
    description: 'Alerts HQ when a property has been marked Guest Ready after a turnover.',
    sortOrder: 111,
    tokens: ['property_name', 'turnover_date', 'completed_at', 'provider_name', 'issue_summary', 'action_url'],
    subject: 'Guest Ready | {{property_name}}',
    preheader: 'A property has been marked Guest Ready.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'Guest Ready',
    ctaLabel: 'View Turnover Report',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      '{{property_name}} has been marked Guest Ready.',
      kv('Turnover', '{{turnover_date}}'),
      kv('Completed', '{{completed_at}}'),
      kv('Provider', '{{provider_name}}'),
      '{{#if issue_summary}}' + kv('Notes', '{{issue_summary}}') + '{{/if}}',
    ]),
  },
  {
    slug: 'notify_property_supply_low',
    name: 'HQ: property supply low',
    category: 'notification',
    description: 'Alerts HQ when a property supply item is running low.',
    sortOrder: 112,
    tokens: ['property_name', 'supply_item', 'supply_status', 'action_url'],
    subject: 'Supply low | {{property_name}}',
    preheader: 'A property supply is running low.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'Supply low',
    ctaLabel: 'Review Property',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      'A supply item was marked low during the latest property service.',
      kv('Property', '{{property_name}}'),
      kv('Item', '{{supply_item}}'),
      kv('Status', '{{supply_status}}'),
    ]),
  },
  {
    slug: 'notify_provider_approved',
    name: 'HQ: provider approved',
    category: 'notification',
    description: 'Alerts HQ when a Network provider is approved. Client-facing template is vendor_approved.',
    sortOrder: 113,
    tokens: ['provider_name', 'services', 'service_area', 'action_url'],
    subject: 'Provider approved | {{provider_name}}',
    preheader: 'A Network provider has been approved.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'Provider approved',
    ctaLabel: 'Open Provider',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      '{{provider_name}} has been approved for the Pinnacle Network.',
      '{{#if services}}' + kv('Services', '{{services}}') + '{{/if}}',
      '{{#if service_area}}' + kv('Coverage', '{{service_area}}') + '{{/if}}',
    ]),
  },
  {
    slug: 'notify_service_application_approved',
    name: 'HQ: service application approved',
    category: 'notification',
    description: 'Alerts HQ when a service application is approved.',
    sortOrder: 114,
    tokens: ['client_name', 'service_name', 'next_step', 'action_url'],
    subject: 'Service application approved | {{client_name}}',
    preheader: 'A service application has been approved.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'Application approved',
    ctaLabel: 'Open Application',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      'The service application for {{client_name}} has been approved.',
      kv('Service', '{{service_name}}'),
      '{{#if next_step}}' + kv('Next Step', '{{next_step}}') + '{{/if}}',
    ]),
  },
  {
    slug: 'notify_service_application_submitted',
    name: 'HQ: service application submitted',
    category: 'notification',
    description: 'Alerts HQ when a client submits a service application.',
    sortOrder: 115,
    tokens: ['client_name', 'service_name', 'submitted_at', 'action_url'],
    subject: 'New service application | {{client_name}}',
    preheader: 'A new service application is ready for review.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'New service application',
    ctaLabel: 'Review Application',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      '{{client_name}} submitted a service application.',
      kv('Service', '{{service_name}}'),
      kv('Submitted', '{{submitted_at}}'),
    ]),
  },
  {
    slug: 'notify_service_assigned',
    name: 'HQ: service assigned',
    category: 'notification',
    description: 'Alerts HQ when a service request is assigned to a person.',
    sortOrder: 116,
    tokens: ['service_name', 'client_name', 'assigned_contact', 'scheduled_at', 'action_url'],
    subject: 'Service assigned | {{service_name}}',
    preheader: 'A Pinnacle service has been assigned.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'Service assigned',
    ctaLabel: 'Open Assignment',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      'A service request has been assigned.',
      kv('Client', '{{client_name}}'),
      kv('Service', '{{service_name}}'),
      kv('Assigned To', '{{assigned_contact}}'),
      '{{#if scheduled_at}}' + kv('Scheduled', '{{scheduled_at}}') + '{{/if}}',
    ]),
  },
  {
    slug: 'notify_service_completed',
    name: 'HQ: service completed',
    category: 'notification',
    description: 'Alerts HQ when a service has been completed.',
    sortOrder: 117,
    tokens: ['service_name', 'client_name', 'completed_at', 'action_url'],
    subject: 'Service completed | {{client_name}}',
    preheader: 'A Pinnacle service has been completed.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'Service completed',
    ctaLabel: 'Review Completion',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      'A Pinnacle service has been completed.',
      kv('Client', '{{client_name}}'),
      kv('Service', '{{service_name}}'),
      kv('Completed', '{{completed_at}}'),
    ]),
  },
  {
    slug: 'notify_trusted_contact_accepted',
    name: 'HQ: trusted contact accepted',
    category: 'notification',
    description: 'Alerts HQ when a trusted contact accepts an invitation.',
    sortOrder: 118,
    tokens: ['contact_name', 'client_name', 'access_summary', 'action_url'],
    subject: 'Trusted Contact accepted | {{contact_name}}',
    preheader: 'A trusted contact has accepted an invitation.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'Trusted contact accepted',
    ctaLabel: 'Review Access',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      "{{contact_name}} accepted {{client_name}}'s Trusted Contact invitation.",
      '{{#if access_summary}}' + kv('Access', '{{access_summary}}') + '{{/if}}',
    ]),
  },
  {
    slug: 'notify_trusted_contact_invitation_expired',
    name: 'HQ: trusted contact invitation expired',
    category: 'notification',
    description: 'Alerts HQ when a trusted contact invitation expires unaccepted.',
    sortOrder: 119,
    tokens: ['contact_name', 'client_name', 'action_url'],
    subject: 'Trusted Contact invitation expired | {{contact_name}}',
    preheader: 'A trusted contact invitation expired.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'Invitation expired',
    ctaLabel: 'Review Invitation',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      'The Trusted Contact invitation sent to {{contact_name}} has expired without being accepted.',
      kv('Client', '{{client_name}}'),
    ]),
  },
  {
    slug: 'notify_trusted_contact_invited',
    name: 'HQ: trusted contact invited',
    category: 'notification',
    description: 'Alerts HQ when a trusted contact invitation is sent.',
    sortOrder: 120,
    tokens: ['contact_name', 'client_name', 'access_summary', 'action_url'],
    subject: 'Trusted Contact invited | {{contact_name}}',
    preheader: 'A trusted contact invitation has been sent.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'Trusted contact invited',
    ctaLabel: 'Review Invitation',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      'A Trusted Contact invitation was sent.',
      kv('Client', '{{client_name}}'),
      kv('Contact', '{{contact_name}}'),
      '{{#if access_summary}}' + kv('Access', '{{access_summary}}') + '{{/if}}',
    ]),
  },
  {
    slug: 'notify_turnover_at_risk',
    name: 'HQ: turnover at risk',
    category: 'notification',
    description: 'Alerts HQ when a scheduled turnover may miss its guest-ready window.',
    sortOrder: 121,
    tokens: ['property_name', 'check_in_time', 'status', 'risk_reason', 'action_url'],
    subject: 'ACTION NEEDED: Turnover at risk | {{property_name}}',
    preheader: 'A turnover may miss its guest-ready window.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'Turnover at risk',
    ctaLabel: 'Review Turnover',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      'A scheduled turnover may not be completed within the required window.',
      kv('Property', '{{property_name}}'),
      kv('Guest Check-In', '{{check_in_time}}'),
      kv('Current Status', '{{status}}'),
      '{{#if risk_reason}}' + kv('Reason', '{{risk_reason}}') + '{{/if}}',
    ]),
  },
  {
    slug: 'notify_turnover_issue_reported',
    name: 'HQ: turnover issue reported',
    category: 'notification',
    description: 'Alerts HQ when a provider reports an issue during a turnover.',
    sortOrder: 122,
    tokens: ['property_name', 'issue_type', 'severity', 'provider_name', 'issue_summary', 'can_continue', 'action_url'],
    subject: 'Turnover issue | {{property_name}}',
    preheader: 'A turnover issue has been reported.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'Turnover issue',
    ctaLabel: 'Review Issue',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      'An issue was reported during the turnover at {{property_name}}.',
      kv('Issue', '{{issue_type}}'),
      kv('Severity', '{{severity}}'),
      kv('Reported By', '{{provider_name}}'),
      '{{#if issue_summary}}' + kv('Notes', '{{issue_summary}}') + '{{/if}}',
      kv('Can Turnover Continue?', '{{can_continue}}'),
    ]),
  },
  {
    slug: 'notify_turnover_scheduled',
    name: 'HQ: turnover scheduled',
    category: 'notification',
    description: 'Alerts HQ when a turnover is scheduled.',
    sortOrder: 123,
    tokens: ['property_name', 'turnover_date', 'checkout_time', 'check_in_time', 'turnover_window', 'provider_name_or_unassigned', 'action_url'],
    subject: 'Turnover scheduled | {{property_name}} | {{turnover_date}}',
    preheader: 'A property turnover has been added to the schedule.',
    eyebrow: 'Pinnacle HQ notification',
    title: 'Turnover scheduled',
    ctaLabel: 'Open Turnover',
    ctaUrlToken: 'action_url',
    bodyHtml: brief([
      'A turnover has been scheduled.',
      kv('Property', '{{property_name}}'),
      kv('Checkout', '{{checkout_time}}'),
      kv('Guest Check-In', '{{check_in_time}}'),
      kv('Turnover Window', '{{turnover_window}}'),
      kv('Assigned', '{{provider_name_or_unassigned}}'),
    ]),
  },

  // -----------------------------------------------------------------
  // CLEANING + TURNOVER SERVICE LIFECYCLE
  // -----------------------------------------------------------------
  {
    slug: 'staff_event_reminder',
    name: 'Staff event reminder or update',
    category: 'account',
    description: 'Reminder before an internal event, or notice that its details changed.',
    sortOrder: 12,
    tokens: ['first_name', 'event_title', 'event_date', 'event_time', 'event_location', 'action_label', 'action_url'],
    subject: 'Reminder: {{event_title}} on {{event_date}}',
    preheader: 'Current details and your RSVP.',
    eyebrow: 'Team event',
    title: 'Reminder: {{event_title}}',
    ctaLabel: 'Update RSVP',
    ctaUrlToken: 'action_url',
    bodyHtml: p('Hi {{first_name}},', 'A quick update on {{event_title}}.')
      + kv('When', '{{event_date}} at {{event_time}}')
      + kv('Where', '{{event_location}}')
      + p('If your plans have changed either way, please update your RSVP so the headcount stays accurate.'),
  },
  {
    slug: 'cleaning_booking_received',
    name: 'Cleaning booking received',
    category: 'notification',
    description: 'Confirms a cleaning request arrived. Explicitly not a scheduling confirmation.',
    sortOrder: 124,
    tokens: ['first_name', 'property_name', 'service_type', 'action_label', 'action_url'],
    subject: 'We received your cleaning request',
    preheader: 'Received and in scheduling. Confirmation to follow.',
    eyebrow: 'Cleaning',
    title: 'Request received',
    ctaLabel: 'View Request',
    ctaUrlToken: 'action_url',
    bodyHtml: p('Hi {{first_name}},', 'Your cleaning request for {{property_name}} is in.')
      + p('To set expectations: this confirms we received the request, and scheduling comes next. We will match coverage and send a separate confirmation with the final date, window, and assigned professional.')
      + signature,
  },
  {
    slug: 'cleaning_scheduled',
    name: 'Cleaning scheduled',
    category: 'notification',
    description: 'Confirms the property, date, window, and preparation notes once cleaning is scheduled.',
    sortOrder: 125,
    tokens: ['first_name', 'property_name', 'service_date', 'service_window', 'service_type', 'action_label', 'action_url'],
    subject: 'Cleaning scheduled for {{service_date}}',
    preheader: 'Date, window, and how to prepare.',
    eyebrow: 'Cleaning',
    title: 'You are on the schedule',
    ctaLabel: 'View Booking',
    ctaUrlToken: 'action_url',
    bodyHtml: p('Hi {{first_name}},', 'Your cleaning is scheduled.')
      + kv('Property', '{{property_name}}')
      + kv('Date', '{{service_date}}')
      + kv('Window', '{{service_window}}')
      + kv('Service', '{{service_type}}')
      + p('If the date stops working for you, let us know as early as you can and we will adjust coverage.')
      + signature,
  },
  {
    slug: 'cleaner_assigned',
    name: 'Cleaner assigned',
    category: 'notification',
    description: 'Tells the client which independent professional will handle the cleaning.',
    sortOrder: 126,
    tokens: ['first_name', 'property_name', 'service_date', 'assigned_provider_name', 'action_label', 'action_url'],
    subject: 'Cleaning coverage confirmed for {{property_name}}',
    preheader: 'Your assigned professional and visit details.',
    eyebrow: 'Cleaning',
    title: 'Coverage is set',
    ctaLabel: 'View Booking',
    ctaUrlToken: 'action_url',
    bodyHtml: p('Hi {{first_name}},', 'Cleaning coverage for your upcoming service is confirmed.')
      + kv('Property', '{{property_name}}')
      + kv('Date', '{{service_date}}')
      + kv('Assigned', '{{assigned_provider_name}}, an independent professional from the Pinnacle network')
      + p('We have briefed them on the property and scope, and we track the job from arrival through completion. You do not need to coordinate anything directly.')
      + signature,
  },
  {
    slug: 'cleaning_completed',
    name: 'Cleaning completed',
    category: 'notification',
    description: 'Reports completion and points to documentation and the way to raise a concern.',
    sortOrder: 127,
    tokens: ['first_name', 'property_name', 'completed_at', 'completion_notes', 'action_label', 'action_url'],
    subject: 'Cleaning complete at {{property_name}}',
    preheader: 'Completion details and documentation are ready.',
    eyebrow: 'Cleaning',
    title: 'All done',
    ctaLabel: 'View Completion Details',
    ctaUrlToken: 'action_url',
    bodyHtml: p('Hi {{first_name}},', 'The cleaning at {{property_name}} has been reported complete as of {{completed_at}}.')
      + '{{#if completion_notes}}' + kv('Notes from the visit', '{{completion_notes}}') + '{{/if}}'
      + p('Where documentation was captured, you will find photos, checklist, and timestamps with the job record. If anything does not meet your expectations, tell us within a day or two while the details are fresh.')
      + signature,
  },
  {
    slug: 'cleaning_issue_reported',
    name: 'Cleaning issue reported',
    category: 'notification',
    description: 'Acknowledges a reported cleaning issue without promising a resolution time.',
    sortOrder: 128,
    tokens: ['first_name', 'property_name', 'issue_summary', 'action_label', 'action_url'],
    subject: 'An issue was reported at {{property_name}}',
    preheader: 'What was reported and how we are handling it.',
    eyebrow: 'Cleaning',
    title: 'We are on it',
    ctaLabel: 'View Issue',
    ctaUrlToken: 'action_url',
    bodyHtml: p('Hi {{first_name}},', 'An issue was reported in connection with the cleaning at {{property_name}}, and we want you to hear it from us first.')
      + kv('Reported', '{{issue_summary}}')
      + p('Pinnacle is coordinating the review. We are gathering the details and will come back to you with what we find and the proposed next step. If you have photos or context that would help, adding them now speeds everything up.')
      + signature,
  },
  // -----------------------------------------------------------------
  // PAYMENTS, QUOTES, AND E-SIGN LIFECYCLE
  // -----------------------------------------------------------------
  {
    slug: 'payment_received',
    name: 'Payment received',
    category: 'billing',
    description: 'Receipt confirming a payment posted to an invoice.',
    sortOrder: 129,
    tokens: ['first_name', 'invoice_number', 'amount', 'balance_due', 'action_label', 'action_url'],
    subject: 'Payment received, thank you',
    preheader: 'Your receipt for invoice {{invoice_number}}.',
    eyebrow: 'Billing',
    title: 'Payment confirmed',
    ctaLabel: 'View Receipt',
    ctaUrlToken: 'action_url',
    bodyHtml: p('Hi {{first_name}},', 'Thank you. Your payment has been received and applied.')
      + kv('Invoice', '{{invoice_number}}')
      + kv('Amount received', '{{amount}}')
      + '{{#if balance_due}}' + kv('Remaining balance', '{{balance_due}}') + '{{/if}}'
      + p('This email is your receipt, and a copy also lives with the invoice in your portal.')
      + signature,
  },
  {
    slug: 'invoice_past_due',
    name: 'Invoice past due',
    category: 'billing',
    description: 'Firm but non-threatening notice once an invoice passes its due date.',
    sortOrder: 130,
    tokens: ['first_name', 'invoice_number', 'balance_due', 'due_date', 'support_email', 'action_label', 'action_url'],
    subject: 'Invoice {{invoice_number}} is past due',
    preheader: 'Outstanding balance and the fastest way to resolve it.',
    eyebrow: 'Billing',
    title: 'Let us get this settled',
    ctaLabel: 'Pay Invoice',
    ctaUrlToken: 'action_url',
    bodyHtml: p('Hi {{first_name}},', 'Our records show an invoice on your account has passed its due date.')
      + kv('Invoice', '{{invoice_number}}')
      + kv('Balance', '{{balance_due}}')
      + kv('Was due', '{{due_date}}')
      + p('If payment is already on its way, thank you. It can take a short while to reflect.', 'If something is making payment difficult, or you believe this is in error, please tell us at {{support_email}}. Talking to us early always beats letting it sit.')
      + signature,
  },
  {
    slug: 'quote_accepted',
    name: 'Quote accepted',
    category: 'billing',
    description: 'Confirms a quote acceptance and explains what happens next.',
    sortOrder: 131,
    tokens: ['first_name', 'quote_number', 'quote_amount', 'action_label', 'action_url'],
    subject: 'Quote {{quote_number}} accepted',
    preheader: 'Your acceptance is recorded and planning begins.',
    eyebrow: 'Quotes',
    title: 'Thank you, we are on it',
    ctaLabel: 'Track Your Request',
    ctaUrlToken: 'action_url',
    bodyHtml: p('Hi {{first_name}},', 'Your acceptance of quote {{quote_number}} ({{quote_amount}}) is recorded. Thank you for the go-ahead.')
      + p('Next we turn the quote into a working plan: confirming scope, lining up scheduling and the right people, and opening the request in your portal so you can follow progress. If anything needs a decision from you along the way, we will ask directly.')
      + signature,
  },
  {
    slug: 'quote_expiring',
    name: 'Quote expiring soon',
    category: 'billing',
    description: 'Heads-up before quoted pricing lapses. Sent once, never after expiry.',
    sortOrder: 132,
    tokens: ['first_name', 'quote_number', 'quote_amount', 'quote_expiration_date', 'action_label', 'action_url'],
    subject: 'Your quote expires {{quote_expiration_date}}',
    preheader: 'A heads-up before the pricing window closes.',
    eyebrow: 'Quotes',
    title: 'Before this quote lapses',
    ctaLabel: 'Review Quote',
    ctaUrlToken: 'action_url',
    bodyHtml: p('Hi {{first_name}},', 'A quick heads-up rather than a push: quote {{quote_number}} ({{quote_amount}}) is set to expire on {{quote_expiration_date}}.')
      + p('Quotes carry an expiration so pricing stays accurate, not to pressure a decision. If you need more time, want to adjust the scope, or have questions holding you back, reply and we will refresh or rework it.')
      + signature,
  },
  {
    slug: 'signature_requested',
    name: 'Signature requested',
    category: 'notification',
    description: 'Sent when an e-sign envelope goes out to a signer.',
    sortOrder: 133,
    tokens: ['first_name', 'document_name', 'signature_due_date', 'action_label', 'action_url'],
    subject: 'Signature requested: {{document_name}}',
    preheader: 'Review and sign securely. The link is unique to you.',
    eyebrow: 'Documents',
    title: 'A document needs your signature',
    ctaLabel: 'Review and Sign',
    ctaUrlToken: 'action_url',
    bodyHtml: p('Hi {{first_name}},', 'Pinnacle Management Ventures has sent you a document for review and signature.')
      + kv('Document', '{{document_name}}')
      + '{{#if signature_due_date}}' + kv('Please complete by', '{{signature_due_date}}') + '{{/if}}'
      + p('The signing page walks you through it: verify your identity, review each page, and sign where indicated. It works on a phone or a computer, and your progress saves as you go.', 'Take the time you need to read before signing. If anything is unclear, reply to this email before you sign rather than after.'),
  },
  {
    slug: 'signature_reminder',
    name: 'Signature reminder',
    category: 'notification',
    description: 'Reminder to a signer who has not completed the envelope.',
    sortOrder: 134,
    tokens: ['first_name', 'document_name', 'action_label', 'action_url'],
    subject: 'Still waiting: {{document_name}} needs your signature',
    preheader: 'A few minutes finishes it.',
    eyebrow: 'Documents',
    title: 'A gentle nudge',
    ctaLabel: 'Review and Sign',
    ctaUrlToken: 'action_url',
    bodyHtml: p('Hi {{first_name}},', 'Just a reminder that {{document_name}} is still waiting for your signature.')
      + p('Signing takes only a few minutes, and anything you already filled in has been saved. If something is stopping you from signing, reply to this email and we will help.', 'If you have already signed, thank you, and you can disregard this.'),
  },
  {
    slug: 'signature_completed',
    name: 'Signature completed',
    category: 'notification',
    description: 'Sent to all parties once an envelope is fully signed.',
    sortOrder: 135,
    tokens: ['first_name', 'document_name', 'completed_at', 'action_label', 'action_url'],
    subject: 'Fully signed: {{document_name}}',
    preheader: 'Your completed copy and signing record are ready.',
    eyebrow: 'Documents',
    title: 'All signatures are in',
    ctaLabel: 'View Signed Document',
    ctaUrlToken: 'action_url',
    bodyHtml: p('Hi {{first_name}},', 'Good news. {{document_name}} is now fully signed by all parties as of {{completed_at}}.')
      + p('The finalized document, together with its signing record of who signed and when, is stored securely and available from your portal. It is worth saving a copy for your own files.', 'Nothing further is needed. This completes the signing process.')
      + signature,
  },
  // -----------------------------------------------------------------
  // APPOINTMENT LIFECYCLE + ACCOUNT SECURITY
  // -----------------------------------------------------------------
  {
    slug: 'appointment_reminder',
    name: 'Appointment reminder',
    category: 'notification',
    description: 'Reminder sent a set interval before a confirmed appointment.',
    sortOrder: 136,
    tokens: ['first_name', 'appointment_title', 'appointment_date', 'appointment_time', 'appointment_location', 'action_label', 'action_url'],
    subject: 'Reminder: {{appointment_title}} on {{appointment_date}}',
    preheader: 'Time, location, and anything to bring.',
    eyebrow: 'Appointments',
    title: 'See you soon',
    ctaLabel: 'View Appointment',
    ctaUrlToken: 'action_url',
    bodyHtml: p('Hi {{first_name}},', 'A reminder about your upcoming appointment.')
      + kv('What', '{{appointment_title}}')
      + kv('When', '{{appointment_date}} at {{appointment_time}}')
      + kv('Where', '{{appointment_location}}')
      + p('If the time no longer works, rescheduling now is easy and keeps the slot useful for someone else.')
      + signature,
  },
  {
    slug: 'appointment_updated',
    name: 'Appointment updated or canceled',
    category: 'notification',
    description: 'Sent when an appointment is rescheduled or canceled. Empty date renders the cancellation form.',
    sortOrder: 137,
    tokens: ['first_name', 'appointment_title', 'appointment_date', 'appointment_time', 'appointment_location', 'action_label', 'action_url'],
    subject: 'Change to your {{appointment_title}} appointment',
    preheader: 'The updated details, clearly marked.',
    eyebrow: 'Appointments',
    title: 'Your appointment changed',
    ctaLabel: 'View Appointment',
    ctaUrlToken: 'action_url',
    bodyHtml: p('Hi {{first_name}},', 'There has been a change to your {{appointment_title}} appointment.')
      + '{{#if appointment_date}}' + kv('Now scheduled', '{{appointment_date}} at {{appointment_time}}') + kv('Where', '{{appointment_location}}') + '{{/if}}'
      + '{{#unless appointment_date}}' + p('This appointment has been canceled. If this was unexpected or you would like to rebook, we are glad to help you find a new time.') + '{{/unless}}'
      + p('We apologize for any inconvenience. The appointment page always shows the current details.')
      + signature,
  },
  {
    slug: 'password_changed',
    name: 'Password changed',
    category: 'account',
    description: 'Security alarm sent whenever an account password changes. Never suppressible.',
    sortOrder: 138,
    tokens: ['first_name', 'support_email', 'action_label', 'action_url'],
    subject: 'Your Pinnacle password was changed',
    preheader: 'If this was you, no action is needed.',
    eyebrow: 'Account security',
    title: 'Password updated',
    ctaLabel: 'Secure My Account',
    ctaUrlToken: 'action_url',
    securityNote: 'If you did not make this change, reset your password immediately and contact us.',
    bodyHtml: p('Hi {{first_name}},', 'The password for your Pinnacle account was just changed.')
      + p('<strong>If this was you:</strong> no action is needed. This note is simply the record.')
      + p('<strong>If this was not you:</strong> treat it as urgent. Reset your password using the button below and contact us at {{support_email}} so we can review the account with you.'),
  },
  {
    slug: 'provider_application_declined',
    name: 'Provider application declined',
    category: 'account',
    description: 'Respectful decline. No CTA, since no action is required.',
    sortOrder: 139,
    tokens: ['first_name'],
    subject: 'An update on your Pinnacle application',
    preheader: 'The outcome of your network application.',
    eyebrow: 'Provider network',
    title: 'Thank you for applying',
    bodyHtml: p('Hi {{first_name}},', 'Thank you for taking the time to apply to the Pinnacle Management Ventures professional network. After review, we are not able to move your application forward at this time.')
      + p('Decisions reflect our current needs, coverage, and fit. They are not a judgment of your work overall, and our needs change as the network grows. You are welcome to apply again in the future if your services or coverage change.')
      + p('We appreciate your interest and wish you well.'),
  },
  // -----------------------------------------------------------------
  // Fallback wrapper (used by legacy notification pipeline)
  // -----------------------------------------------------------------
  {
    slug: 'staff_notification',
    name: 'Staff event notification (legacy wrapper)',
    category: 'account',
    description: 'Fallback branded wrapper for HQ staff event emails from the legacy notification pipeline. Per-event templates above should be used instead when possible.',
    sortOrder: 200,
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
