import { escapeHtml } from '../email'
import { renderPinnacleEmailLayout } from './layout'

export interface RelationshipEmail {
  subject: string
  html: string
  text: string
}

export interface EventEmailInput {
  eventKey: string
  firstName?: string | null
  subject: string
  title: string
  body: string
  ctaLabel?: string
  ctaUrl?: string
  footerLink?: { label: string; url: string }
  eyebrow?: string
  preheader?: string
}

const first = (value?: string | null) => (value || '').trim().split(/\s+/)[0] || 'there'
const para = (text: string) => text.split(/\n\n+/).map((p) => `<p style="margin:0 0 18px">${escapeHtml(p)}</p>`).join('')

export function renderRelationshipEvent(input: EventEmailInput): RelationshipEmail {
  const name = first(input.firstName)
  const footerLinkHtml=input.footerLink?`<p style="margin:24px 0 0;font-size:12px;color:#64748b"><a href="${escapeHtml(input.footerLink.url)}" style="color:#94a3b8;text-decoration:underline">${escapeHtml(input.footerLink.label)}</a></p>`:''
  const bodyHtml = `<p style="margin:0 0 18px">Hi ${escapeHtml(name)},</p>${para(input.body)}${footerLinkHtml}`
  const html = renderPinnacleEmailLayout({
    preheader: input.preheader || input.subject,
    eyebrow: input.eyebrow || 'Pinnacle update',
    title: input.title,
    bodyHtml,
    cta: input.ctaLabel && input.ctaUrl ? { label: input.ctaLabel, url: input.ctaUrl } : undefined,
  })
  return {
    subject: input.subject,
    html,
    text: `Hi ${name},\n\n${input.body}${input.ctaLabel && input.ctaUrl ? `\n\n${input.ctaLabel}: ${input.ctaUrl}` : ''}${input.footerLink?`\n\n${input.footerLink.label}: ${input.footerLink.url}`:''}\n\nPinnacle Management Ventures\n(561) 388-7879\npinnaclemanagementventures.com`,
  }
}

export interface NurtureStep {
  key: string
  day: number
  subject: (name: string) => string
  preheader: string
  eyebrow: string
  title: string
  body: (name: string) => string
  ctaLabel: string
  ctaPath: string
}

export const CLIENT_NURTURE_STEPS: NurtureStep[] = [
  {
    key: 'day2_how_pinnacle_works', day: 2,
    subject: (name) => `${name}, here’s how Pinnacle works around you`,
    preheader: 'One relationship, clear next steps, and the right support when you need it.',
    eyebrow: 'Your Pinnacle journey', title: 'You don’t need to know the answer before you ask.',
    body: () => `Pinnacle is built around a simple idea: you should be able to start with the situation, not a service name. Tell us what you are trying to accomplish and we help define the scope, coordinate the right resources, and keep the next step visible.\n\nYour portal is the home base for that relationship — services, documents, messages, appointments, billing, and the people helping you move things forward.`,
    ctaLabel: 'Explore My Portal', ctaPath: '/',
  },
  {
    key: 'day4_explore_services', day: 4,
    subject: () => 'A few ways Pinnacle can make the work easier',
    preheader: 'Explore business, property, document, and professional support at your own pace.',
    eyebrow: 'Discover support', title: 'Use what helps now. Discover the rest when it becomes useful.',
    body: () => `Clients use Pinnacle for very different reasons. Some need a one-time property visit. Others need help changing a POS system, organizing a business project, preparing for funding, coordinating documents, or simply getting administrative work off their plate.\n\nYou do not need to choose a package. Browse the service library and start with one practical need.`,
    ctaLabel: 'Explore Services', ctaPath: '/services',
  },
  {
    key: 'day6_network', day: 6,
    subject: () => 'The right professional, without starting over',
    preheader: 'How Pinnacle’s vetted professional network supports client work.',
    eyebrow: 'The Pinnacle network', title: 'Some problems need a specialist. You should not have to rebuild the relationship.',
    body: () => `When work calls for outside expertise, licensed support, local field work, or another specialty, Pinnacle can coordinate a vetted professional around the engagement.\n\nThe goal is not to pretend one company does everything. The value is having one relationship that helps identify the right resource, define the assignment, protect access to your information, and keep the work coordinated.`,
    ctaLabel: 'See How the Network Works', ctaPath: '/services',
  },
  {
    key: 'day8_use_case', day: 8,
    subject: () => 'One request can solve more than one part of the problem',
    preheader: 'A simple example of how Pinnacle coordinates work around a client need.',
    eyebrow: 'One relationship', title: 'The request may be simple. The coordination usually is not.',
    body: () => `Imagine a property owner who needs an occupancy verification, current photos, a document delivered, and a notarized form. Those are four separate tasks — but they do not need to become four disconnected vendor relationships.\n\nPinnacle can help organize the scope, coordinate the right people, keep documents together, and give the client one place to see what is happening next.`,
    ctaLabel: 'Tell Us What You Need', ctaPath: '/services',
  },
  {
    key: 'day10_did_you_know', day: 10,
    subject: () => 'Did you know Pinnacle can help with these too?',
    preheader: 'A few less-obvious services available through your Pinnacle relationship.',
    eyebrow: 'Did you know?', title: 'Pinnacle is broader than one service category.',
    body: () => `Beyond the obvious requests, clients can use Pinnacle for things like payment/POS transitions, vendor coordination, property photo verification, broker price opinions through licensed network professionals, courier/document runs, funding-readiness support, and ongoing administrative projects.\n\nIf you are spending time figuring out who should handle something, that is often a good reason to ask us first.`,
    ctaLabel: 'Browse the Service Library', ctaPath: '/services',
  },
  {
    key: 'day12_portal', day: 12,
    subject: () => 'Your Pinnacle portal is more useful as the relationship grows',
    preheader: 'Messages, documents, work, appointments, and billing stay connected.',
    eyebrow: 'Your workspace', title: 'Less chasing. More context in one place.',
    body: () => `Your Client Portal is designed to become more useful over time. Messages stay connected to the relationship. Documents live with the work. Applications and service requests have a status. Appointments, invoices, and your Pinnacle team are visible without searching through old email threads.\n\nYou can also invite a Trusted Contact and choose exactly what that person can view or edit.`,
    ctaLabel: 'Open My Portal', ctaPath: '/',
  },
  {
    key: 'day14_next', day: 14,
    subject: (name) => `${name}, what would make the next two weeks easier?`,
    preheader: 'Start the next request or simply tell Pinnacle what you are working through.',
    eyebrow: 'What’s next', title: 'What can we help make easier next?',
    body: () => `You have had a little time to look around Pinnacle. There is no expectation that you use everything. The point is to have a professional relationship you can return to when something needs ownership, coordination, or a clearer next step.\n\nIf there is something on your list — business, property, documents, operations, payments, or another professional need — start there. We can help determine what happens next.`,
    ctaLabel: 'Start a Service Request', ctaPath: '/services',
  },
]

export function renderNurtureEmail(input: { firstName?: string | null; step: NurtureStep; portalBase: string }): RelationshipEmail {
  const name = first(input.firstName)
  const ctaUrl = `${input.portalBase.replace(/\/$/, '')}${input.step.ctaPath}`
  return renderRelationshipEvent({
    eventKey: input.step.key,
    firstName: name,
    subject: input.step.subject(name),
    preheader: input.step.preheader,
    eyebrow: input.step.eyebrow,
    title: input.step.title,
    body: input.step.body(name),
    ctaLabel: input.step.ctaLabel,
    ctaUrl,
  })
}
