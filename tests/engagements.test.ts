import { describe, expect, it } from 'vitest'
import { campaignAudienceHref, clientEmailHref, clientInboxHref, composeAddress, isCampaignAudienceQuery, leadEmailHref } from '../src/lib/engagements'
import { describeActivity, categorizeActivity, type ActivityEvent } from '../src/lib/activity'
import { CREST_ABSOLUTE_URL, FIRM_NAME, FIRM_PHONE } from '../shared/letterhead'
import { brandedSignatureHtml } from '../functions/_lib/emailSignatures'
import { hqUrl, portalUrl, wwwPortalUrl } from '../functions/_lib/appUrls'

const p = (path: string) => `/hq/${path}`

function event(kind: string, detail: Record<string, unknown> = {}, extra: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: '1',
    actor_user_id: 'staff',
    actor_name: 'Jordan',
    actor_email: 'jordan@example.com',
    client_user_id: extra.client_user_id ?? null,
    client_name: extra.client_name ?? null,
    client_email: extra.client_email ?? null,
    kind,
    detail: JSON.stringify(detail),
    created_at: '2026-08-13 12:00:00',
  }
}

describe('engagement deep links', () => {
  it('opens one-to-one email compose for a client', () => {
    expect(clientEmailHref(p, { id: 'c1', email: 'a@x.com', name: 'Ada' })).toBe(
      '/hq/messages?tab=email&compose=1&scopeClient=c1&to=a%40x.com&name=Ada',
    )
  })

  it('opens the secure client inbox for a client', () => {
    expect(clientInboxHref(p, 'c1')).toBe('/hq/messages?client=c1')
  })

  it('opens one-to-one email compose for a lead', () => {
    expect(leadEmailHref(p, { id: 'l1', email: 'lead@x.com', name: 'Lee' })).toContain('tab=email')
    expect(leadEmailHref(p, { id: 'l1', email: 'lead@x.com', name: 'Lee' })).toContain('lead=l1')
    expect(leadEmailHref(p, { id: 'l1', email: 'lead@x.com', name: 'Lee' })).toContain('compose=1')
  })

  it('keeps campaign audiences on the Email Center', () => {
    expect(campaignAudienceHref(p, { lead: 'l1' })).toBe('/hq/communications/email?lead=l1')
    expect(campaignAudienceHref(p, { leadIds: ['a', 'b'] })).toBe('/hq/communications/email?leadIds=a%2Cb')
    expect(campaignAudienceHref(p, { list: 'list-1' })).toBe('/hq/communications/email?list=list-1')
  })

  it('formats a display address and detects campaign query params', () => {
    expect(composeAddress('Ada', 'a@x.com')).toBe('Ada <a@x.com>')
    expect(isCampaignAudienceQuery(new URLSearchParams('lead=l1'))).toBe(true)
    expect(isCampaignAudienceQuery(new URLSearchParams('tab=email&thread=1'))).toBe(false)
  })
})

describe('comms activity copy', () => {
  it('describes a per-recipient campaign send on the relationship', () => {
    const text = describeActivity(event('comms_message_sent', { subject: 'Welcome', to: 'ada@x.com' }, { client_name: 'Ada' }))
    expect(text).toContain('Welcome')
    expect(text).toContain('Ada')
    expect(categorizeActivity('comms_message_sent')).toBe('communications')
  })

  it('describes a scoped one-to-one email', () => {
    const text = describeActivity(event('email.sent', { subject: 'Docs' }, { client_name: 'Ada' }))
    expect(text).toContain('Ada')
    expect(text).toContain('Docs')
  })

  it('describes staff conversation messages as communications', () => {
    expect(categorizeActivity('conversation.message')).toBe('communications')
    expect(describeActivity(event('conversation.message', { subject: 'Staff DM' }))).toContain('Staff DM')
  })
})

describe('shared letterhead and hosts', () => {
  it('keeps the branded signature on the shared crest and firm name', () => {
    const html = brandedSignatureHtml('company')
    expect(html).toContain(FIRM_NAME)
    expect(html).toContain(FIRM_PHONE)
    expect(html).toContain('/logo-crest-letterhead.png')
    expect(CREST_ABSOLUTE_URL).toContain('logo-crest-letterhead.png')
  })

  it('centralizes portal and HQ hosts on secure.', () => {
    expect(portalUrl('/billing')).toBe('https://secure.pinnaclemanagementventures.com/billing')
    expect(hqUrl('/invite/abc')).toBe('https://secure.pinnaclemanagementventures.com/hq/invite/abc')
    expect(hqUrl('/')).toBe('https://secure.pinnaclemanagementventures.com/hq')
    expect(wwwPortalUrl('/signup')).toBe('https://www.pinnaclemanagementventures.com/portal/signup')
  })
})
