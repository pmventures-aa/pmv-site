import { escapeHtml } from '../email'
import { renderPinnacleEmailLayout } from './layout'

export type AccountRole = 'client' | 'staff' | 'admin'
export type AccountCreationType = 'self_signup' | 'admin_invite' | 'lead_conversion'

export interface AccountWelcomeInput {
  firstName?: string | null
  email: string
  role: AccountRole
  creationType: AccountCreationType
  actionLabel: string
  actionUrl: string
  businessName?: string | null
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

const securityNote = 'Pinnacle will never ask you to send your password by email. If you receive a message you’re unsure about, contact us directly before providing information.'

function firstName(value?: string | null): string {
  const clean = (value || '').trim()
  return clean ? clean.split(/\s+/)[0] : 'there'
}

function clientSubject(name: string, type: AccountCreationType): string {
  if (type === 'admin_invite') return `Welcome to Pinnacle, ${name} — Set Up Your Account`
  if (type === 'lead_conversion') return `Welcome to Pinnacle, ${name} — Your Account Is Ready`
  return `Welcome to Pinnacle, ${name}`
}

function clientWelcome(input: AccountWelcomeInput): RenderedEmail {
  const name = firstName(input.firstName)
  const safeName = escapeHtml(name)
  const setupNote = input.creationType === 'self_signup'
    ? ''
    : '<p style="margin:0 0 20px"><strong>Your secure setup link can be used once and expires in 24 hours.</strong> If it expires, contact Pinnacle and we can issue a new one.</p>'

  const bodyHtml = `<p style="margin:0 0 18px">Hi ${safeName},</p>
<p style="margin:0 0 18px">Welcome to <strong>Pinnacle Management Ventures</strong>. Your account is ready, and we’re glad you’re here.</p>
<p style="margin:0 0 22px;font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:27px;color:#9a7838"><strong>Professional support. One call away.</strong></p>
<p style="margin:0 0 20px">Pinnacle is here to help make complicated work easier to manage. Whether you’re working through a business project, coordinating vendors, making a technology change, handling property needs, or simply trying to figure out the right next step, you don’t have to have everything mapped out before you start.</p>
<h2 style="margin:28px 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:500;line-height:28px;color:#0b1728">Your Pinnacle Client Portal</h2>
<p style="margin:0 0 14px">Your secure portal gives you one place to stay connected with Pinnacle and keep your work organized.</p>
<p style="margin:0 0 8px">From your account, you can:</p>
<ul style="margin:0 0 22px;padding-left:21px">
  <li style="margin:5px 0">Complete your profile and onboarding</li>
  <li style="margin:5px 0">Explore and request Pinnacle services</li>
  <li style="margin:5px 0">Complete service applications</li>
  <li style="margin:5px 0">Upload and access documents</li>
  <li style="margin:5px 0">Send and receive secure messages</li>
  <li style="margin:5px 0">View projects, matters, tasks, and upcoming appointments</li>
  <li style="margin:5px 0">Track service activity and next steps</li>
  <li style="margin:5px 0">View billing and account information</li>
</ul>
${setupNote}
<h2 style="margin:28px 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:500;line-height:28px;color:#0b1728">Not sure where to begin?</h2>
<p style="margin:0 0 18px">That’s completely fine.</p>
<p style="margin:0 0 18px">Start with <strong>what’s happening, what you’re trying to accomplish, or what you need help getting done.</strong> We’ll help identify the right scope, information, people, and next steps from there.</p>
<p style="margin:0 0 18px">Our goal is simple: <strong>clear ownership, clear next steps, and less time spent chasing the work.</strong></p>
<p style="margin:0 0 18px">If you need help with your account or have a question before getting started, just reply to this email and our team can assist.</p>
<p style="margin:0 0 6px">Welcome to Pinnacle, ${safeName}. We look forward to working with you.</p>
<p style="margin:18px 0 0">Warmly,<br><br><strong>The Pinnacle Management Ventures Team</strong><br>Professional Services &amp; Business Consulting<br>(561) 388-7879<br>pinnaclemanagementventures.com</p>`

  const subject = clientSubject(name, input.creationType)
  const text = `Hi ${name},

Welcome to Pinnacle Management Ventures. Your account is ready, and we’re glad you’re here.

Professional support. One call away.

Pinnacle is here to help make complicated work easier to manage. Whether you’re working through a business project, coordinating vendors, making a technology change, handling property needs, or simply trying to figure out the right next step, you don’t have to have everything mapped out before you start.

YOUR PINNACLE CLIENT PORTAL
Your secure portal gives you one place to stay connected with Pinnacle and keep your work organized.

From your account, you can:
- Complete your profile and onboarding
- Explore and request Pinnacle services
- Complete service applications
- Upload and access documents
- Send and receive secure messages
- View projects, matters, tasks, and upcoming appointments
- Track service activity and next steps
- View billing and account information

${input.creationType === 'self_signup' ? '' : 'Your secure setup link can be used once and expires in 24 hours. If it expires, contact Pinnacle and we can issue a new one.\n\n'}${input.actionLabel}: ${input.actionUrl}

NOT SURE WHERE TO BEGIN?
That’s completely fine.

Start with what’s happening, what you’re trying to accomplish, or what you need help getting done. We’ll help identify the right scope, information, people, and next steps from there.

Our goal is simple: clear ownership, clear next steps, and less time spent chasing the work.

If you need help with your account or have a question before getting started, just reply to this email and our team can assist.

Welcome to Pinnacle, ${name}. We look forward to working with you.

Warmly,

The Pinnacle Management Ventures Team
Professional Services & Business Consulting
(561) 388-7879
pinnaclemanagementventures.com

Account security: ${securityNote}`

  return {
    subject,
    text,
    html: renderPinnacleEmailLayout({
      preheader: input.creationType === 'self_signup' ? 'Your Pinnacle client account is ready.' : 'Set up your secure Pinnacle account and get started.',
      eyebrow: 'Client portal',
      title: `Welcome to Pinnacle, ${name}.`,
      bodyHtml,
      cta: { label: input.actionLabel, url: input.actionUrl },
      securityNote,
    }),
  }
}

function hqWelcome(input: AccountWelcomeInput): RenderedEmail {
  const name = firstName(input.firstName)
  const roleLabel = input.role === 'admin' ? 'administrator' : 'team member'
  const subject = `You’ve been invited to Pinnacle HQ`
  const bodyHtml = `<p style="margin:0 0 18px">Hi ${escapeHtml(name)},</p>
<p style="margin:0 0 18px">Welcome to <strong>Pinnacle Management Ventures</strong>. An HQ account has been created for you as a Pinnacle ${roleLabel}.</p>
<p style="margin:0 0 18px">Pinnacle HQ is the firm’s internal workspace for client relationships, leads and prospects, communications, assignments, operational activity, and the work you’re authorized to access.</p>
<p style="margin:0 0 18px"><strong>Use the secure button below to choose your password.</strong> The setup link can be used once and expires in 24 hours.</p>
<p style="margin:0 0 18px">Once you’re signed in, your dashboard will show the areas and client information available to your account.</p>
<p style="margin:0">If you weren’t expecting this invitation, reply to this email before setting up the account.</p>`
  const text = `Hi ${name},

Welcome to Pinnacle Management Ventures. An HQ account has been created for you as a Pinnacle ${roleLabel}.

Pinnacle HQ is the firm’s internal workspace for client relationships, leads and prospects, communications, assignments, operational activity, and the work you’re authorized to access.

Use this secure link to choose your password. It can be used once and expires in 24 hours.

${input.actionLabel}: ${input.actionUrl}

If you weren’t expecting this invitation, reply to this email before setting up the account.

The Pinnacle Management Ventures Team
(561) 388-7879
pinnaclemanagementventures.com

Account security: ${securityNote}`
  return {
    subject,
    text,
    html: renderPinnacleEmailLayout({
      preheader: 'Your Pinnacle HQ invitation is ready.',
      eyebrow: 'Pinnacle HQ',
      title: `Welcome, ${name}.`,
      bodyHtml,
      cta: { label: input.actionLabel, url: input.actionUrl },
      securityNote,
    }),
  }
}

export function renderAccountWelcome(input: AccountWelcomeInput): RenderedEmail {
  return input.role === 'client' ? clientWelcome(input) : hqWelcome(input)
}

export function renderVendorApplicationReceived(input: { firstName?: string | null; email: string }): RenderedEmail {
  const name = firstName(input.firstName)
  const subject = 'We received your Pinnacle vendor application'
  const bodyHtml = `<p style="margin:0 0 18px">Hi ${escapeHtml(name)},</p>
<p style="margin:0 0 18px">Thanks for registering with <strong>Pinnacle Management Ventures</strong>.</p>
<p style="margin:0 0 18px">Your vendor/provider profile has been received and is <strong>pending review</strong>. Your account will remain unavailable for sign-in until a Pinnacle administrator approves it.</p>
<p style="margin:0 0 18px">Our team will contact you if additional information is needed. Once approved, we’ll send you a separate confirmation that your Pinnacle access is active.</p>
<p style="margin:0">If you did not submit this registration, reply to this email and let us know.</p>`
  const text = `Hi ${name},

Thanks for registering with Pinnacle Management Ventures.

Your vendor/provider profile has been received and is pending review. Your account will remain unavailable for sign-in until a Pinnacle administrator approves it.

Our team will contact you if additional information is needed. Once approved, we’ll send a separate confirmation that your Pinnacle access is active.

If you did not submit this registration, reply to this email and let us know.

The Pinnacle Management Ventures Team
(561) 388-7879
pinnaclemanagementventures.com`
  return {
    subject,
    text,
    html: renderPinnacleEmailLayout({
      preheader: 'Your Pinnacle vendor/provider registration is pending review.',
      eyebrow: 'Vendor & provider network',
      title: 'Application received.',
      bodyHtml,
    }),
  }
}

export function renderVendorApproved(input: { firstName?: string | null; actionUrl: string }): RenderedEmail {
  const name = firstName(input.firstName)
  const subject = 'Your Pinnacle vendor account has been approved'
  const bodyHtml = `<p style="margin:0 0 18px">Hi ${escapeHtml(name)},</p>
<p style="margin:0 0 18px">Your vendor/provider account with <strong>Pinnacle Management Ventures</strong> has been approved.</p>
<p style="margin:0 0 18px">You can now sign in to Pinnacle HQ using the email address and password you created when you registered. Your workspace will show the tools, assignments, and information available to your account.</p>
<p style="margin:0">If you have trouble signing in or believe your access needs to be adjusted, reply to this email and our team can help.</p>`
  const text = `Hi ${name},

Your vendor/provider account with Pinnacle Management Ventures has been approved.

You can now sign in to Pinnacle HQ using the email address and password you created when you registered.

Open Pinnacle HQ: ${input.actionUrl}

If you have trouble signing in or believe your access needs to be adjusted, reply to this email and our team can help.

The Pinnacle Management Ventures Team
(561) 388-7879
pinnaclemanagementventures.com

Account security: ${securityNote}`
  return {
    subject,
    text,
    html: renderPinnacleEmailLayout({
      preheader: 'Your approved Pinnacle vendor account is ready to use.',
      eyebrow: 'Vendor & provider network',
      title: `You’re approved, ${name}.`,
      bodyHtml,
      cta: { label: 'Open Pinnacle HQ', url: input.actionUrl },
      securityNote,
    }),
  }
}

export function renderPortalReminder(input: { firstName?: string | null; role: AccountRole; actionUrl: string }): RenderedEmail {
  const name = firstName(input.firstName)
  const isClient = input.role === 'client'
  const label = isClient ? 'Open My Client Portal' : 'Open Pinnacle HQ'
  const subject = isClient ? 'Your Pinnacle Client Portal' : 'Your Pinnacle HQ access'
  const bodyHtml = `<p style="margin:0 0 18px">Hi ${escapeHtml(name)},</p>
<p style="margin:0 0 18px">This is a quick reminder that your Pinnacle account is active and ready whenever you need it.</p>
<p style="margin:0">Use the button below to return to ${isClient ? 'your secure Client Portal' : 'Pinnacle HQ'}.</p>`
  const text = `Hi ${name},

This is a quick reminder that your Pinnacle account is active and ready whenever you need it.

${label}: ${input.actionUrl}

The Pinnacle Management Ventures Team
(561) 388-7879
pinnaclemanagementventures.com

Account security: ${securityNote}`
  return {
    subject,
    text,
    html: renderPinnacleEmailLayout({
      preheader: 'Your Pinnacle account is active and ready.',
      eyebrow: isClient ? 'Client portal' : 'Pinnacle HQ',
      title: `Welcome back, ${name}.`,
      bodyHtml,
      cta: { label, url: input.actionUrl },
      securityNote,
    }),
  }
}
