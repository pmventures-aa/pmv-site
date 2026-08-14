import { describe, expect, it } from 'vitest'
import { inviteUrl } from '../functions/_lib/invites'
import {
  hqLoginUrl,
  hqUrl,
  LEGACY_HQ_ORIGIN,
  LEGACY_PORTAL_ORIGIN,
  portalLoginUrl,
  portalUrl,
  PUBLIC_SITE_URL,
  SECURE_ORIGIN,
  setupPasswordUrl,
  wwwPortalUrl,
} from '../shared/appUrls'

describe('canonical post-login URLs', () => {
  it('builds portal and HQ links on secure. instead of legacy hosts', () => {
    expect(portalUrl()).toBe(SECURE_ORIGIN)
    expect(portalUrl('/billing')).toBe(`${SECURE_ORIGIN}/billing`)
    expect(portalLoginUrl()).toBe(`${SECURE_ORIGIN}/login`)
    expect(hqUrl()).toBe(`${SECURE_ORIGIN}/hq`)
    expect(hqUrl('/login')).toBe(`${SECURE_ORIGIN}/hq/login`)
    expect(hqLoginUrl()).toBe(`${SECURE_ORIGIN}/hq/login`)
    expect(setupPasswordUrl('client', 'tok')).toBe(`${SECURE_ORIGIN}/set-password?token=tok`)
    expect(setupPasswordUrl('staff', 'tok')).toBe(`${SECURE_ORIGIN}/hq/set-password?token=tok`)
  })

  it('keeps www marketing and www path mounts separate from post-login mail', () => {
    expect(PUBLIC_SITE_URL).toBe('https://www.pinnaclemanagementventures.com')
    expect(wwwPortalUrl('/signup')).toBe(`${PUBLIC_SITE_URL}/portal/signup`)
    expect(LEGACY_HQ_ORIGIN).toContain('hq.')
    expect(LEGACY_PORTAL_ORIGIN).toContain('client.')
    expect(portalUrl('/')).not.toContain('client.')
    expect(hqUrl('/')).not.toContain('hq.pinnacle')
  })

  it('issues invite links on secure.', () => {
    expect(inviteUrl('vendor', 'abc')).toBe(`${SECURE_ORIGIN}/hq/vendor-signup?invite=abc`)
    expect(inviteUrl('staff', 'abc')).toBe(`${SECURE_ORIGIN}/hq/invite/abc`)
    expect(inviteUrl('client', 'abc')).toBe(`${SECURE_ORIGIN}/signup?invite=abc`)
    expect(inviteUrl('trusted_contact', 'abc')).toBe(`${SECURE_ORIGIN}/trusted-invite/abc`)
  })
})
