import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  HQ_EMAIL_CATALOG,
  mergeHqTemplateHtml,
  mergeHqTemplatePlain,
  slugifyHqEmailName,
} from '../shared/hqEmailTemplates'
import { renderHqEmailFromRow } from '../functions/_lib/hqEmailTemplates'

describe('HQ email template catalog', () => {
  it('covers the outbound letters staff asked to edit', () => {
    const slugs = HQ_EMAIL_CATALOG.map((item) => item.slug)
    expect(slugs).toContain('account_welcome_client')
    expect(slugs).toContain('password_reset')
    expect(slugs).toContain('invoice_send')
    expect(slugs).toContain('quote_send')
    expect(slugs).toContain('invite_staff')
    expect(slugs).toContain('nurture_day2_how_pinnacle_works')
  })

  it('merges tokens and conditionals', () => {
    expect(mergeHqTemplatePlain('Hi {{first_name}}', { first_name: 'Ada' })).toBe('Hi Ada')
    expect(mergeHqTemplateHtml('{{#if setup_note}}<p>{{setup_note}}</p>{{/if}}', { setup_note: 'Once' })).toContain('Once')
    expect(mergeHqTemplateHtml('{{#if setup_note}}<p>{{setup_note}}</p>{{/if}}', { setup_note: '' })).toBe('')
    expect(mergeHqTemplateHtml('<p>{{first_name}}</p>', { first_name: 'A <B>' })).toContain('A &lt;B&gt;')
  })

  it('slugifies custom names', () => {
    expect(slugifyHqEmailName('  Closing Letter!! ')).toBe('closing_letter')
  })

  it('wraps a stored letter in the Pinnacle layout', () => {
    const rendered = renderHqEmailFromRow({
      enabled: 1,
      wrap_letterhead: 1,
      subject: 'Hello {{first_name}}',
      preheader: 'Ready',
      eyebrow: 'Portal',
      title: 'Welcome',
      body_html: '<p>Hi {{first_name}},</p>',
      cta_label: 'Open',
      cta_url_token: 'action_url',
      security_note: null,
    }, { first_name: 'Ada', action_url: 'https://example.com' })
    expect(rendered.skipped).toBe(false)
    expect(rendered.subject).toBe('Hello Ada')
    expect(rendered.html).toContain('Hi Ada')
    expect(rendered.html).toContain('logo-crest-letterhead.png')
    expect(rendered.html).toContain('https://example.com')
  })
})

describe('HQ email templates workspace', () => {
  it('adds a Messages Templates tab with the letterhead editor', () => {
    const messages = readFileSync(new URL('../src/pages/admin/MessagesAdmin.tsx', import.meta.url), 'utf8')
    const panel = readFileSync(new URL('../src/pages/admin/EmailTemplatesPanel.tsx', import.meta.url), 'utf8')
    const compose = readFileSync(new URL('../src/pages/admin/EmailComposePane.tsx', import.meta.url), 'utf8')
    expect(messages).toContain("id: 'templates'")
    expect(messages).toContain('EmailTemplatesPanel')
    expect(panel).toContain('surface="letter"')
    expect(panel).toContain('Insert')
    expect(compose).toContain('Insert')
    expect(compose).toContain('openTemplates')
    expect(compose).toContain('footer=')
    expect(compose).not.toContain('z-10')
  })
})
