import type { Env } from './types'
import { uuid } from './crypto'
import { sendEmail, sendEmailStrict } from './email'
import { renderRelationshipEvent } from './emailTemplates/relationship'

import { portalUrl, PUBLIC_SITE_URL } from './appUrls'

/** Public marketing origin — always www (quotes, scope confirmations, unsubscribe). */
export const PUBLIC_SITE_BASE = PUBLIC_SITE_URL
export const CLIENT_PORTAL_BASE = portalUrl()

export const SCOPE_FOLLOWUP_STEPS = [
  {
    key: 'day1_make_scope_easy', day: 1,
    subject: 'A quick way to make your request easier to price',
    title: 'A few details can remove most of the back-and-forth.',
    body: (job: string) => `You asked Pinnacle about ${job}. If you have photos, an address or service area, a firm deadline, or a short description of the finished result you need, reply with whatever is easiest. We will organize it from there.\n\nYou do not need to create an account to continue the conversation. The client workspace is available when you want one place for updates, documents, estimates, and completion records.`,
    ctaLabel: 'Review My Request',
  },
  {
    key: 'day3_one_relationship', day: 3,
    subject: 'If the request crosses services, keep it together',
    title: 'One request can cover the handoffs around the work.',
    body: (job: string) => `The original need may be ${job}, but the practical work around it can include access, documents, a field visit, vendors, photos, signing, or follow-up. Tell us the outcome you need; Pinnacle can separate the pieces and keep them connected.\n\nIf the request has already been handled, no action is needed.`,
    ctaLabel: 'Continue My Request',
  },
  {
    key: 'day5_close_loop', day: 5,
    subject: 'Should we keep this request open?',
    title: 'A simple yes, no, or not yet is enough.',
    body: (job: string) => `I am closing the loop on your request for ${job}. Reply if you would like us to scope it now, if the timing changed, or if someone else already handled it.\n\nPinnacle remains available for business support, documents and notary, property cleaning, inspections, REO and eviction coordination, and other defined field work.`,
    ctaLabel: 'Open My Request',
  },
] as const

function easternParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return { weekday: values.weekday, hour: Number(values.hour), minute: Number(values.minute) }
}

/** Add staffed time only (9:00–17:00 ET, Monday–Friday). */
export function twoBusinessHoursFrom(now: Date): string {
  let cursor = new Date(now)
  let staffedMinutes = 0
  // One-minute increments keep the calculation DST-safe because each
  // instant is converted independently to Eastern time.
  while (staffedMinutes < 120) {
    const part = easternParts(cursor)
    const weekday = part.weekday !== 'Sat' && part.weekday !== 'Sun'
    if (weekday && part.hour >= 9 && part.hour < 17) staffedMinutes += 1
    cursor = new Date(cursor.getTime() + 60_000)
  }
  return cursor.toISOString()
}

export interface QuoteRule {
  key: string
  label: string
  base_price_cents: number
  per_sqft_cents: number
  minimum_price_cents: number
  range_low_percent: number
  range_high_percent: number
}

export function calculateCleaningEstimate(rule: QuoteRule, squareFeet: number, condition: string, rush: boolean) {
  const size = Math.min(20_000, Math.max(200, Math.round(squareFeet)))
  const conditionMultiplier = condition === 'heavy' ? 1.35 : condition === 'light' ? .9 : 1
  const rushMultiplier = rush ? 1.2 : 1
  const core = Math.max(rule.minimum_price_cents, rule.base_price_cents, size * rule.per_sqft_cents)
  const adjusted = core * conditionMultiplier * rushMultiplier
  const round = (value: number) => Math.max(0, Math.round(value / 500) * 500)
  return {
    lowCents: round(adjusted * (rule.range_low_percent / 100)),
    highCents: round(adjusted * (rule.range_high_percent / 100)),
    basis: `${rule.label} planning range for approximately ${size.toLocaleString()} sq. ft.`,
  }
}

export async function sendScopeConfirmation(env: Env, input: { name: string; email: string; jobLabel: string; token: string }) {
  const url = `${PUBLIC_SITE_BASE}/scope-request/confirmation?request=${encodeURIComponent(input.token)}`
  const email = renderRelationshipEvent({
    eventKey: 'scope_request_received',
    firstName: input.name,
    subject: 'We received your Pinnacle request',
    preheader: 'Your request is in. A person will review it within two business hours.',
    eyebrow: 'Request received',
    title: 'We have the request. Now we will make the next step clear.',
    body: `We received your request for ${input.jobLabel}. A person from Pinnacle will review the scope and reply within two business hours.\n\nYou can use the request page below to review what you sent, request a preferred service time when available, or create a client workspace without entering the same information again.`,
    ctaLabel: 'Review My Request',
    ctaUrl: url,
  })
  await sendEmail(env, { to: input.email, subject: email.subject, html: email.html, text: email.text, replyTo: 'orders@pinnaclemanagementventures.com', idempotencyKey: `scope-received-${input.token}`, tags: [{ name:'category',value:'scope_request' }] })
}

async function unsubscribeUrl(env: Env, email: string) {
  let row = await env.DB.prepare('SELECT token FROM email_unsubscribe_tokens WHERE lower(email)=lower(?) AND used_at IS NULL ORDER BY created_at DESC LIMIT 1').bind(email).first<{token:string}>()
  if (!row) {
    row = { token: uuid() }
    await env.DB.prepare('INSERT INTO email_unsubscribe_tokens(token,email) VALUES(?,?)').bind(row.token, email).run()
  }
  return `${PUBLIC_SITE_BASE}/api/unsubscribe/${encodeURIComponent(row.token)}`
}

export async function runDueScopeFollowups(env: Env, limit = 50): Promise<{processed:number;sent:number;skipped:number;failed:number}> {
  const rows = await env.DB.prepare(
    `SELECT id,public_token,contact_name,email,job_type,created_at
     FROM public_scope_requests
     WHERE follow_up_opt_in=1 AND marketing_status='emailable' AND status IN ('new','contacted','quoted')
       AND converted_user_id IS NULL AND booked_at IS NULL
     ORDER BY created_at ASC LIMIT ?`,
  ).bind(limit).all<any>()
  let sent = 0; let skipped = 0; let failed = 0
  for (const row of rows.results || []) {
    const ageDays = (Date.now() - new Date(row.created_at).getTime()) / 86_400_000
    const step = [...SCOPE_FOLLOWUP_STEPS].reverse().find((candidate) => ageDays >= candidate.day)
    if (!step) { skipped++; continue }
    const exists = await env.DB.prepare('SELECT 1 FROM scope_followup_deliveries WHERE scope_request_id=? AND step_key=?').bind(row.id, step.key).first()
    if (exists) { skipped++; continue }
    try {
      const requestUrl = `${PUBLIC_SITE_BASE}/scope-request/confirmation?request=${encodeURIComponent(row.public_token)}`
      const optOut = await unsubscribeUrl(env, row.email)
      const email = renderRelationshipEvent({
        eventKey: step.key,
        firstName: row.contact_name,
        subject: step.subject,
        eyebrow: 'Your Pinnacle request',
        title: step.title,
        body: step.body(String(row.job_type).replace(/_/g,' ')),
        ctaLabel: step.ctaLabel,
        ctaUrl: requestUrl,
        footerLink: { label:'Unsubscribe from request follow-up emails', url:optOut },
      })
      const providerId = await sendEmailStrict(env, { to: row.email, subject: email.subject, html: email.html, text: email.text, replyTo: 'orders@pinnaclemanagementventures.com', idempotencyKey: `scope-followup-${row.id}-${step.key}`, tags: [{name:'category',value:'scope_followup'},{name:'step',value:step.key}] })
      await env.DB.prepare('INSERT OR IGNORE INTO scope_followup_deliveries(id,scope_request_id,step_key,provider_message_id,status) VALUES(?,?,?,?,\'sent\')').bind(uuid(), row.id, step.key, providerId).run()
      sent++
    } catch (error) {
      failed++
      console.error('[scope-followup] send failed', row.id, step.key, error)
    }
  }
  return { processed:(rows.results || []).length, sent, skipped, failed }
}
