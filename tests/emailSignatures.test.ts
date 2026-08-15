import { describe, expect, it, vi } from 'vitest'
import { appendSignature, absolutizeSignatureAssets, brandedSignatureHtml, htmlToPlainText } from '../functions/_lib/emailSignatures'
import { sendEmailStrict } from '../functions/_lib/email'
import { CREST_ABSOLUTE_URL, CREST_CID } from '../shared/letterhead'
import { withEmbeddedCrest } from '../shared/emailSignatureHtml'
import { resolveHqDeepLink } from '../src/components/kit/NotificationFeedPanel'
import { readFileSync } from 'node:fs'

describe('branded email signatures', () => {
  it('builds a professional company block with crest, phone, and site', () => {
    const html = brandedSignatureHtml('company')
    expect(html).toContain('<!--pmv-sig:v4-->')
    expect(html).toContain('Pinnacle Management Ventures')
    expect(html).toContain('logo-crest-letterhead.png')
    expect(html).toContain('(561) 388-7879')
    expect(html).toContain('pinnaclemanagementventures.com')
    expect(html).toContain('Property')
    expect(html).toContain('South Florida')
    expect(html).not.toContain('—')
  })

  it('builds a PMV Support block that is distinct from the company default', () => {
    const html = brandedSignatureHtml('support')
    expect(html).toContain('PMV Support')
    expect(html).toContain('Client Care')
    expect(html).toContain('support@pinnaclemanagementventures.com')
    expect(html).toContain('logo-crest-letterhead.png')
  })

  it('builds a personal block with the sender name and title', () => {
    const html = brandedSignatureHtml('personal', {
      name: 'Jordan Lee',
      title: 'Principal',
      email: 'jordan@pinnaclemanagementventures.com',
      phone: '(561) 388-7879',
    })
    expect(html).toContain('Jordan Lee')
    expect(html).toContain('Principal')
    expect(html).toContain('jordan@pinnaclemanagementventures.com')
  })

  it('appends a signature once and replaces a previous signature block', () => {
    const sig = brandedSignatureHtml('company')
    const first = appendSignature('<p>Hello</p>', sig)
    expect(first).toContain('data-pmv-signature="1"')
    expect(first.startsWith('<p>Hello</p>')).toBe(true)
    const second = appendSignature(first, brandedSignatureHtml('support'))
    expect(second).toContain('PMV Support')
    expect(second.match(/data-pmv-signature/g)?.length).toBe(1)
  })

  it('keeps the crest on a same-origin path so HQ can display it', () => {
    const html = brandedSignatureHtml('company')
    expect(html).toContain('src="/logo-crest-letterhead.png"')
    expect(html).not.toContain('https://www.pinnaclemanagementventures.com/logo-crest-letterhead.png')
  })

  it('absolutizes the crest when a hosted URL is required', () => {
    const html = absolutizeSignatureAssets(brandedSignatureHtml('company'))
    expect(html).toContain(CREST_ABSOLUTE_URL)
  })

  it('embeds the crest as an inline CID image for outbound mail', () => {
    const { html, attachments } = withEmbeddedCrest(brandedSignatureHtml('personal', {
      name: 'C.R. Jenkins',
      title: 'Principal',
      email: 'cody@pinnaclemanagementventures.com',
    }))
    expect(html).toContain(`src="cid:${CREST_CID}"`)
    expect(html).not.toContain('src="/logo-crest-letterhead.png"')
    expect(attachments).toEqual([
      expect.objectContaining({
        filename: 'logo-crest-letterhead.png',
        content_id: CREST_CID,
        content_type: 'image/png',
        path: CREST_ABSOLUTE_URL,
      }),
    ])
  })

  it('embeds the crest from transactional hosted URLs too', () => {
    const { html, attachments } = withEmbeddedCrest(`<img src="${CREST_ABSOLUTE_URL}" alt="Pinnacle"/>`)
    expect(html).toContain(`cid:${CREST_CID}`)
    expect(attachments[0]?.content_id).toBe(CREST_CID)
  })

  it('does not attach a crest when the message has no letterhead image', () => {
    const { html, attachments } = withEmbeddedCrest('<p>Hello</p>')
    expect(html).toBe('<p>Hello</p>')
    expect(attachments).toEqual([])
  })

  it('puts the person name and title on the shared Pinnacle letterhead', () => {
    const html = brandedSignatureHtml('personal', {
      name: 'Jordan Lee',
      title: 'Field vendor',
      email: 'jordan@pinnaclemanagementventures.com',
      phone: '(561) 388-7879',
    })
    expect(html).toContain('Pinnacle Management Ventures')
    expect(html).toContain('Jordan Lee')
    expect(html).toContain('Field vendor')
    expect(html).toContain('data-pmv-person="1"')
  })

  it('rewrites the padded transparent crest onto the letterhead mark', () => {
    const html = absolutizeSignatureAssets('<img src="/logo-crest-transparent.png" width="76" height="76"/>')
    expect(html).toContain('/logo-crest-letterhead.png')
    expect(html).not.toContain('logo-crest-transparent.png')
  })

  it('turns composed HTML into readable plain text', () => {
    expect(htmlToPlainText('<p>Hello<br/>there</p><div>Bye</div>')).toMatch(/Hello\s+there/)
  })
})

describe('HQ notification deep links', () => {
  const p = (path: string) => path ? `/hq/${path}` : '/hq'

  it('sends legacy communications links to the live Messages hub', () => {
    expect(resolveHqDeepLink('/hq/communications?tab=email&thread=abc', p)).toBe('/hq/messages?tab=email&thread=abc')
    expect(resolveHqDeepLink('/hq/communications?tab=threads&conv=xyz', p)).toBe('/hq/messages?tab=staff&conv=xyz')
    expect(resolveHqDeepLink('/hq/communications', p)).toBe('/hq/messages?tab=email')
    expect(resolveHqDeepLink('/hq/communications/email', p)).toBe('/hq/communications/email')
  })

  it('keeps relative mail workspace links on the current HQ base', () => {
    const local = (path: string) => path ? `/admin/${path}` : '/admin'
    expect(resolveHqDeepLink('/messages?tab=email&thread=abc', local)).toBe('/admin/messages?tab=email&thread=abc')
    expect(resolveHqDeepLink('/hq/communications?tab=email&thread=abc', local)).toBe('/admin/messages?tab=email&thread=abc')
  })
})

describe('outbound crest embedding', () => {
  it('sends the crest as a CID attachment through Resend', async () => {
    const payloads: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body || '{}')))
      return { ok: true, json: async () => ({ id: 're_test' }) } as Response
    })
    await sendEmailStrict(
      { RESEND_API_KEY: 're_test_key' } as any,
      { to: 'jordan@example.com', subject: 'Hello', html: brandedSignatureHtml('company') },
    )
    vi.unstubAllGlobals()
    expect(payloads[0].html).toContain(`cid:${CREST_CID}`)
    expect(payloads[0].attachments).toEqual([
      expect.objectContaining({ content_id: CREST_CID, filename: 'logo-crest-letterhead.png' }),
    ])
  })

  it('lets HQ edit branded signatures for staff and vendors', () => {
    const panel = readFileSync(new URL('../src/pages/admin/EmailSignaturesPanel.tsx', import.meta.url), 'utf8')
    const routes = readFileSync(new URL('../functions/_lib/routes/emailSignatures.ts', import.meta.url), 'utf8')
    const profile = readFileSync(new URL('../src/pages/admin/ProviderProfile.tsx', import.meta.url), 'utf8')
    expect(panel).toContain('Vendors')
    expect(panel).toContain('Staff')
    expect(routes).toContain('/email-signatures/roster/:userId')
    expect(profile).toContain('Save signature')
  })
})
