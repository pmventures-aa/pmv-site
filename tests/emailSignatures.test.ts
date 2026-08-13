import { describe, expect, it } from 'vitest'
import { appendSignature, absolutizeSignatureAssets, brandedSignatureHtml, htmlToPlainText } from '../functions/_lib/emailSignatures'
import { resolveHqDeepLink } from '../src/components/kit/NotificationFeedPanel'

describe('branded email signatures', () => {
  it('builds a professional company block with crest, phone, and site', () => {
    const html = brandedSignatureHtml('company')
    expect(html).toContain('Pinnacle Management Ventures')
    expect(html).toContain('logo-crest-transparent.png')
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
    expect(html).toContain('logo-crest-transparent.png')
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
    expect(html).toContain('src="/logo-crest-transparent.png"')
    expect(html).not.toContain('https://www.pinnaclemanagementventures.com/logo-crest-transparent.png')
  })

  it('absolutizes the crest for outbound mail', () => {
    const html = absolutizeSignatureAssets(brandedSignatureHtml('company'))
    expect(html).toContain('https://www.pinnaclemanagementventures.com/logo-crest-transparent.png')
  })

  it('turns composed HTML into readable plain text', () => {
    expect(htmlToPlainText('<p>Hello<br/>there</p><div>Bye</div>')).toMatch(/Hello\s+there/)
  })
})

describe('HQ notification deep links', () => {
  const p = (path: string) => path ? `/hq/${path}` : '/hq'

  it('rewrites /hq/communications links onto the current HQ base', () => {
    expect(resolveHqDeepLink('/hq/communications?tab=email&thread=abc', p)).toBe('/hq/communications?tab=email&thread=abc')
  })

  it('keeps relative mail workspace links on the current HQ base', () => {
    const local = (path: string) => path ? `/admin/${path}` : '/admin'
    expect(resolveHqDeepLink('/messages?tab=email&thread=abc', local)).toBe('/admin/messages?tab=email&thread=abc')
    expect(resolveHqDeepLink('/hq/communications?tab=email&thread=abc', local)).toBe('/admin/communications?tab=email&thread=abc')
  })
})
