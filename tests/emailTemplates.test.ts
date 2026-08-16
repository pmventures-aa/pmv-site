import { describe, it, expect } from 'vitest'
import {
  HQ_EMAIL_CATALOG,
  HQ_EMAIL_SAMPLE_VARS,
  hqEmailCatalogBySlug,
  mergeHqTemplatePlain,
  mergeHqTemplateHtml,
} from '../shared/hqEmailTemplates'
import {
  EMAIL_VARIABLES,
  emailVariable,
  extractTemplateTokens,
  extractAllReferencedTokens,
  findUnresolvedTokens,
  isKnownEmailVariable,
  buildEmailPreviewVars,
} from '../shared/emailVariables'

describe('email variable registry', () => {
  it('carries every variable the sprint spec requires', () => {
    const required = [
      // Recipient
      'first_name', 'last_name', 'full_name', 'email', 'phone',
      // Client
      'client_name', 'business_name', 'property_name', 'portal_url', 'account_status',
      // Matter
      'matter_name', 'matter_status', 'next_step', 'assigned_contact', 'service_name', 'service_status',
      // Calendar
      'appointment_title', 'event_title', 'event_date', 'event_time', 'event_timezone', 'event_location', 'meeting_url',
      // Document
      'document_name', 'document_status', 'agreement_name', 'signature_due_date',
      // Billing
      'invoice_number', 'amount', 'balance_due', 'due_date', 'invoice_description', 'quote_amount', 'quote_url',
      // Property / Field work
      'property_address', 'turnover_date', 'checkout_time', 'check_in_time', 'turnover_window',
      'provider_name', 'issue_type', 'issue_summary', 'supply_item', 'supply_status',
      'completed_at', 'risk_reason', 'severity', 'can_continue',
      // Network / provider
      'services', 'service_area', 'assignment_name', 'assignment_payout', 'status', 'location',
      // Trusted contact
      'trusted_contact_name', 'contact_name', 'access_summary',
      // System
      'today', 'current_year', 'pinnacle_phone', 'pinnacle_email', 'company_name',
      'sender_name', 'sender_title', 'platform_name', 'reminder_message', 'action_label',
      'registered_at', 'submitted_at', 'uploaded_at', 'last_activity_date', 'waiting_since',
      'source', 'urgency', 'context', 'message_preview', 'scheduled_at', 'provider_name_or_unassigned',
    ]
    const known = new Set(EMAIL_VARIABLES.map((v) => v.key))
    const missing = required.filter((k) => !known.has(k))
    expect(missing).toEqual([])
  })

  it('every registered variable has label, description, category, and example', () => {
    for (const v of EMAIL_VARIABLES) {
      expect(v.label).toBeTruthy()
      expect(v.description).toBeTruthy()
      expect(v.category).toBeTruthy()
      expect(v.example).toBeTruthy()
    }
  })

  it('emailVariable() returns the metadata by key', () => {
    const v = emailVariable('invoice_number')
    expect(v?.label).toBe('Invoice number')
    expect(v?.category).toBe('billing')
  })

  it('isKnownEmailVariable rejects fabricated keys', () => {
    expect(isKnownEmailVariable('first_name')).toBe(true)
    expect(isKnownEmailVariable('bogus_variable_that_does_not_exist')).toBe(false)
  })
})

describe('extract + unresolved token helpers', () => {
  it('extracts unique tokens from a template body', () => {
    const src = 'Hi {{first_name}}, invoice {{invoice_number}} is due {{due_date}}. Contact {{first_name}} if needed.'
    expect(extractTemplateTokens(src).sort()).toEqual(['due_date', 'first_name', 'invoice_number'])
  })

  it('includes tokens referenced only inside {{#if}} / {{#unless}} blocks', () => {
    const src = 'Hi {{first_name}}{{#if matter_name}} regarding {{matter_name}}{{/if}}{{#unless invoice_number}} - no invoice yet{{/unless}}.'
    expect(extractAllReferencedTokens(src).sort()).toEqual(['first_name', 'invoice_number', 'matter_name'])
  })

  it('reports no unresolved tokens once merged with sample vars', () => {
    const src = 'Hi {{first_name}}, your invoice {{invoice_number}} is due {{due_date}}.'
    const merged = mergeHqTemplatePlain(src, HQ_EMAIL_SAMPLE_VARS)
    expect(findUnresolvedTokens(merged)).toEqual([])
    expect(merged).not.toContain('{{')
  })
})

describe('template catalog rendering', () => {
  const previewVars = buildEmailPreviewVars(HQ_EMAIL_SAMPLE_VARS)

  it('every catalog template renders subject and body without leaking {{tokens}}', () => {
    for (const entry of HQ_EMAIL_CATALOG) {
      const subject = mergeHqTemplatePlain(entry.subject, previewVars)
      const bodyHtml = mergeHqTemplateHtml(entry.bodyHtml, previewVars)
      const title = mergeHqTemplatePlain(entry.title, previewVars)
      expect(findUnresolvedTokens(subject), `subject leak in ${entry.slug}`).toEqual([])
      expect(findUnresolvedTokens(title), `title leak in ${entry.slug}`).toEqual([])
      expect(findUnresolvedTokens(bodyHtml), `body leak in ${entry.slug}`).toEqual([])
    }
  })

  it('client welcome uses first_name and portal URL', () => {
    const t = hqEmailCatalogBySlug('account_welcome_client')
    expect(t?.subject).toContain('{{first_name}}')
    expect(t?.ctaUrlToken).toBe('portal_url')
  })

  it('invoice template renders invoice number and due date from sample vars', () => {
    const t = hqEmailCatalogBySlug('invoice_send')!
    const subject = mergeHqTemplatePlain(t.subject, previewVars)
    const body = mergeHqTemplateHtml(t.bodyHtml, previewVars)
    expect(subject).toContain(previewVars.invoice_number)
    expect(subject).toContain(previewVars.amount)
    expect(body).toContain(previewVars.invoice_number)
    expect(body).toContain(previewVars.due_date)
  })

  it('turnover at risk template renders operational fields', () => {
    const t = hqEmailCatalogBySlug('notify_turnover_at_risk')!
    const body = mergeHqTemplateHtml(t.bodyHtml, previewVars)
    expect(body).toContain(previewVars.property_name)
    expect(body).toContain(previewVars.check_in_time)
    expect(body).toContain(previewVars.risk_reason)
  })

  it('trusted contact invitation uses client_name in subject', () => {
    const t = hqEmailCatalogBySlug('invite_trusted_contact')!
    const subject = mergeHqTemplatePlain(t.subject, previewVars)
    expect(subject).toContain(previewVars.client_name)
  })

  it('unknown variables render as empty string, never as raw {{token}}', () => {
    const merged = mergeHqTemplatePlain('Hi {{first_name}}, ref: {{does_not_exist}}.', { first_name: 'Cody' })
    expect(merged).toBe('Hi Cody, ref: .')
    expect(merged).not.toContain('{{')
  })

  it('optional #if blocks are omitted when the variable is empty', () => {
    const src = 'Hi {{first_name}}{{#if matter_name}} - {{matter_name}}{{/if}}.'
    expect(mergeHqTemplatePlain(src, { first_name: 'Cody' })).toBe('Hi Cody.')
    expect(mergeHqTemplatePlain(src, { first_name: 'Cody', matter_name: 'Onboarding' })).toBe('Hi Cody - Onboarding.')
  })
})

describe('catalog integrity', () => {
  it('slugs are unique', () => {
    const slugs = HQ_EMAIL_CATALOG.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('every declared token exists in the variable registry', () => {
    for (const entry of HQ_EMAIL_CATALOG) {
      for (const token of entry.tokens) {
        // event_subject / event_body come from the legacy notification pipeline;
        // they are still valid renderer inputs even though they are not staff-
        // facing variables. Same for older aliases used by the seed sample vars.
        const legacy = new Set([
          'event_subject', 'event_body', 'assignment_title', 'site_address',
          'role_label', 'workspace_label', 'invoice_label', 'due', 'invoice_message',
          'quote_number', 'quote_title', 'quote_intro', 'valid_until', 'setup_note',
        ])
        if (legacy.has(token)) continue
        expect(isKnownEmailVariable(token), `unknown token ${token} in ${entry.slug}`).toBe(true)
      }
    }
  })

  it('every referenced token in a template body resolves via sample vars or is a known legacy alias', () => {
    const previewVars = buildEmailPreviewVars(HQ_EMAIL_SAMPLE_VARS)
    for (const entry of HQ_EMAIL_CATALOG) {
      const refs = extractAllReferencedTokens(`${entry.subject} ${entry.title} ${entry.bodyHtml} ${entry.ctaLabel || ''}`)
      for (const key of refs) {
        expect(previewVars[key] !== undefined || isKnownEmailVariable(key), `${entry.slug} references ${key} but preview vars have no value`).toBe(true)
      }
    }
  })
})
