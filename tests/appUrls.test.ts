import { describe, expect, it } from 'vitest'
import {
  PUBLIC_SITE_BASE,
  PUBLIC_SITE_URL,
  SECURE_ORIGIN,
  accountSetupUrl,
  hqLoginUrl,
  hqUrl,
  portalLoginUrl,
  portalUrl,
  vendorSignupUrl,
  wwwPortalUrl,
} from '../shared/appUrls'
import { inviteUrl } from '../functions/_lib/invites'
import { CLIENT_LOGIN_URL, CLIENT_PORTAL_URL, HQ_LOGIN_URL } from '../functions/_lib/accountEmails'

describe('canonical app URLs', () => {
  it('uses www for public marketing and secure. for post-login surfaces', () => {
    expect(PUBLIC_SITE_BASE).toBe(PUBLIC_SITE_URL)
    expect(PUBLIC_SITE_URL).toBe('https://www.pinnaclemanagementventures.com')
    expect(SECURE_ORIGIN).toBe('https://secure.pinnaclemanagementventures.com')
    expect(portalUrl('/billing')).toBe('https://secure.pinnaclemanagementventures.com/billing')
    expect(hqUrl('/invite/abc')).toBe('https://secure.pinnaclemanagementventures.com/hq/invite/abc')
    expect(hqUrl()).toBe('https://secure.pinnaclemanagementventures.com/hq')
    expect(wwwPortalUrl('/signup')).toBe('https://www.pinnaclemanagementventures.com/portal/signup')
  })

  it('mints setup, login, and invite links on secure. rather than legacy hosts', () => {
    expect(accountSetupUrl('client', 'tok')).toBe('https://secure.pinnaclemanagementventures.com/set-password?token=tok')
    expect(accountSetupUrl('staff', 'tok')).toBe('https://secure.pinnaclemanagementventures.com/hq/set-password?token=tok')
    expect(portalLoginUrl()).toBe('https://secure.pinnaclemanagementventures.com/login')
    expect(hqLoginUrl()).toBe('https://secure.pinnaclemanagementventures.com/hq/login')
    expect(vendorSignupUrl()).toBe('https://secure.pinnaclemanagementventures.com/hq/vendor-signup')
    expect(inviteUrl('vendor', 'abc')).toBe('https://secure.pinnaclemanagementventures.com/hq/vendor-signup?invite=abc')
    expect(inviteUrl('client', 'abc')).toBe('https://secure.pinnaclemanagementventures.com/signup?invite=abc')
    expect(inviteUrl('staff', 'abc')).toBe('https://secure.pinnaclemanagementventures.com/hq/invite/abc')
    expect(inviteUrl('trusted_contact', 'abc')).toBe('https://secure.pinnaclemanagementventures.com/trusted-invite/abc')
    expect(CLIENT_PORTAL_URL).toBe(SECURE_ORIGIN)
    expect(CLIENT_LOGIN_URL).toContain('secure.pinnaclemanagementventures.com')
    expect(HQ_LOGIN_URL).toBe('https://secure.pinnaclemanagementventures.com/hq/login')
    expect(CLIENT_LOGIN_URL).not.toContain('client.pinnaclemanagementventures.com')
    expect(HQ_LOGIN_URL).not.toContain('hq.pinnaclemanagementventures.com')
  })
})
