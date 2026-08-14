import { describe, expect, it } from 'vitest'
import {
  CLIENT_LOGIN_URL,
  CLIENT_PORTAL_URL,
  HQ_LOGIN_URL,
} from '../functions/_lib/accountEmails'
import {
  hqLoginUrl,
  hqUrl,
  LEGACY_HQ_ORIGIN,
  LEGACY_PORTAL_ORIGIN,
  portalLoginUrl,
  portalUrl,
  PUBLIC_SITE_BASE,
  PUBLIC_SITE_URL,
  SECURE_ORIGIN,
  setupPasswordUrl,
} from '../functions/_lib/appUrls'
import { inviteUrl } from '../functions/_lib/invites'

describe('canonical app URLs', () => {
  it('keeps public marketing on www and post-login surfaces on secure', () => {
    expect(PUBLIC_SITE_BASE).toBe(PUBLIC_SITE_URL)
    expect(PUBLIC_SITE_BASE).toBe('https://www.pinnaclemanagementventures.com')
    expect(SECURE_ORIGIN).toBe('https://secure.pinnaclemanagementventures.com')
    expect(portalUrl()).toBe(SECURE_ORIGIN)
    expect(hqUrl()).toBe(`${SECURE_ORIGIN}/hq`)
    expect(portalLoginUrl()).toBe(`${SECURE_ORIGIN}/login`)
    expect(hqLoginUrl()).toBe(`${SECURE_ORIGIN}/hq/login`)
  })

  it('builds setup, invite, and account-email links on secure rather than legacy hosts', () => {
    expect(setupPasswordUrl('client', 'tok')).toBe(`${SECURE_ORIGIN}/set-password?token=tok`)
    expect(setupPasswordUrl('staff', 'tok')).toBe(`${SECURE_ORIGIN}/hq/set-password?token=tok`)
    expect(inviteUrl('client', 'abc')).toBe(`${SECURE_ORIGIN}/signup?invite=abc`)
    expect(inviteUrl('vendor', 'abc')).toBe(`${SECURE_ORIGIN}/hq/vendor-signup?invite=abc`)
    expect(inviteUrl('staff', 'abc')).toBe(`${SECURE_ORIGIN}/hq/invite/abc`)
    expect(inviteUrl('trusted_contact', 'abc')).toBe(`${SECURE_ORIGIN}/trusted-invite/abc`)
    expect(CLIENT_PORTAL_URL).toBe(`${SECURE_ORIGIN}/`)
    expect(CLIENT_LOGIN_URL).toBe(`${SECURE_ORIGIN}/login`)
    expect(HQ_LOGIN_URL).toBe(`${SECURE_ORIGIN}/hq/login`)
  })

  it('keeps legacy host constants for accepting old traffic without generating them', () => {
    expect(LEGACY_HQ_ORIGIN).toBe('https://hq.pinnaclemanagementventures.com')
    expect(LEGACY_PORTAL_ORIGIN).toBe('https://client.pinnaclemanagementventures.com')
    expect(portalUrl('/billing')).not.toContain('client.pinnaclemanagementventures.com')
    expect(hqUrl('/login')).not.toContain('hq.pinnaclemanagementventures.com')
  })
})
