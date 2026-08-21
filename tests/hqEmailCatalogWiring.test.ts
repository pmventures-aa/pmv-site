import { describe, it, expect } from 'vitest'
import {
  HQ_EMAIL_CATALOG,
  HQ_EMAIL_SAMPLE_VARS,
  mergeHqTemplateHtml,
  mergeHqTemplatePlain,
} from '../shared/hqEmailTemplates'
import { extractAllReferencedTokens, isKnownEmailVariable } from '../shared/emailVariables'

// The copy library in docs/email-template-library.md is wired into the live
// catalog. These guards keep that wiring honest: every template the system can
// send must render with no unresolved {{tokens}} and must only reference
// variables the shared registry actually knows about.
describe('HQ email catalog wiring', () => {
  it('registers the templates added from the copy library', () => {
    const slugs = new Set(HQ_EMAIL_CATALOG.map((t) => t.slug))
    const added = [
      // Second staff-event variant the brief required as distinct.
      'staff_event_reminder',
      // Cleaning lifecycle.
      'cleaning_booking_received', 'cleaning_scheduled', 'cleaner_assigned',
      'cleaning_completed', 'cleaning_issue_reported',
      // Payments, quotes, e-sign, appointments, security.
      'payment_received', 'invoice_past_due', 'quote_accepted', 'quote_expiring',
      'signature_requested', 'signature_reminder', 'signature_completed',
      'appointment_reminder', 'appointment_updated',
      'password_changed', 'provider_application_declined',
    ]
    for (const slug of added) expect(slugs.has(slug), `missing template: ${slug}`).toBe(true)
  })

  it('keeps every slug unique', () => {
    const slugs = HQ_EMAIL_CATALOG.map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('only references variables the shared registry knows', () => {
    const unknown: string[] = []
    for (const t of HQ_EMAIL_CATALOG) {
      const referenced = [
        ...extractAllReferencedTokens(t.subject),
        ...extractAllReferencedTokens(t.preheader),
        ...extractAllReferencedTokens(t.title),
        ...extractAllReferencedTokens(t.bodyHtml),
        ...extractAllReferencedTokens(t.securityNote || ''),
      ]
      for (const token of referenced) {
        // Sample vars cover a few legacy slugs that predate the registry.
        if (!isKnownEmailVariable(token) && !(token in HQ_EMAIL_SAMPLE_VARS)) {
          unknown.push(`${t.slug}: {{${token}}}`)
        }
      }
    }
    expect(unknown, `unregistered variables:\n${unknown.join('\n')}`).toEqual([])
  })

  it('renders every template with sample data and leaks no raw tokens', () => {
    const leaked: string[] = []
    for (const t of HQ_EMAIL_CATALOG) {
      const subject = mergeHqTemplatePlain(t.subject, HQ_EMAIL_SAMPLE_VARS)
      const body = mergeHqTemplateHtml(t.bodyHtml, HQ_EMAIL_SAMPLE_VARS)
      if (/\{\{\s*[\w.]+\s*\}\}/.test(subject)) leaked.push(`${t.slug} subject`)
      if (/\{\{\s*[\w.]+\s*\}\}/.test(body)) leaked.push(`${t.slug} body`)
      expect(subject.trim().length, `${t.slug} has an empty subject`).toBeGreaterThan(0)
      expect(body.trim().length, `${t.slug} has an empty body`).toBeGreaterThan(0)
    }
    expect(leaked, `templates leaking raw tokens:\n${leaked.join('\n')}`).toEqual([])
  })

  it('gives each template a CTA target that exists, when it has a CTA', () => {
    for (const t of HQ_EMAIL_CATALOG) {
      if (!t.ctaLabel) continue
      expect(t.ctaUrlToken, `${t.slug} has a CTA label but no URL token`).toBeTruthy()
    }
  })
})
