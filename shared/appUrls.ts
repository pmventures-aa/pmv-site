import { PUBLIC_SITE_URL } from './letterhead'

export { PUBLIC_SITE_URL }

/** Canonical public marketing origin. Alias of PUBLIC_SITE_URL (www). */
export const PUBLIC_SITE_BASE = PUBLIC_SITE_URL

/** Canonical post-login origin for portal (/) and HQ (/hq). */
export const SECURE_ORIGIN = 'https://secure.pinnaclemanagementventures.com'

/** Legacy hosts still accepted during cutover. Do not mint new links with these. */
export const LEGACY_HQ_ORIGIN = 'https://hq.pinnaclemanagementventures.com'
export const LEGACY_PORTAL_ORIGIN = 'https://client.pinnaclemanagementventures.com'

/** @deprecated Use LEGACY_HQ_ORIGIN only when detecting old hosts. */
export const HQ_APP_ORIGIN = LEGACY_HQ_ORIGIN
/** @deprecated Use LEGACY_PORTAL_ORIGIN only when detecting old hosts. */
export const PORTAL_APP_ORIGIN = LEGACY_PORTAL_ORIGIN

export const PORTAL_WWW_BASE = `${PUBLIC_SITE_URL}/portal`
export const HQ_WWW_LOGIN = `${PUBLIC_SITE_URL}/admin/login`
export const PORTAL_WWW_LOGIN = `${PUBLIC_SITE_URL}/portal/login`

function joinOrigin(origin: string, path = '/'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  if (suffix === '/') return origin
  return `${origin}${suffix}`
}

/** Client portal URL on secure. (canonical). */
export function portalUrl(path = '/'): string {
  return joinOrigin(SECURE_ORIGIN, path)
}

/** HQ URL on secure./hq (canonical). */
export function hqUrl(path = '/'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  if (suffix === '/') return `${SECURE_ORIGIN}/hq`
  return `${SECURE_ORIGIN}/hq${suffix}`
}

export function portalLoginUrl(): string {
  return portalUrl('/login')
}

export function hqLoginUrl(): string {
  return hqUrl('/login')
}

export function portalSetupUrl(token: string): string {
  return portalUrl(`/set-password?token=${encodeURIComponent(token)}`)
}

export function hqSetupUrl(token: string): string {
  return hqUrl(`/set-password?token=${encodeURIComponent(token)}`)
}

export function accountSetupUrl(role: string, token: string): string {
  return role === 'client' ? portalSetupUrl(token) : hqSetupUrl(token)
}

/** www path-mount helpers — Auth0 callbacks and public-site nested routes. */
export function wwwPortalUrl(path = '/'): string {
  return joinOrigin(PORTAL_WWW_BASE, path)
}

export function vendorSignupUrl(inviteToken?: string): string {
  const base = hqUrl('/vendor-signup')
  return inviteToken ? `${base}?invite=${encodeURIComponent(inviteToken)}` : base
}
