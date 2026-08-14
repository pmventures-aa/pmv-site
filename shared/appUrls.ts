import { PUBLIC_SITE_URL } from './letterhead'

export { PUBLIC_SITE_URL }

/** Canonical post-auth host from DEPLOY.md. Portal is `/`, HQ is `/hq`. */
export const SECURE_ORIGIN = 'https://secure.pinnaclemanagementventures.com'

/** Legacy hosts kept for inbound recognition during DNS cutover. Do not generate new links to these. */
export const LEGACY_HQ_ORIGIN = 'https://hq.pinnaclemanagementventures.com'
export const LEGACY_PORTAL_ORIGIN = 'https://client.pinnaclemanagementventures.com'

export const HQ_APP_ORIGIN = LEGACY_HQ_ORIGIN
export const PORTAL_APP_ORIGIN = LEGACY_PORTAL_ORIGIN

export const PORTAL_WWW_BASE = `${PUBLIC_SITE_URL}/portal`
export const HQ_WWW_LOGIN = `${PUBLIC_SITE_URL}/admin/login`
export const PORTAL_WWW_LOGIN = `${PUBLIC_SITE_URL}/portal/login`

function suffix(path: string): string {
  if (!path || path === '/') return ''
  return path.startsWith('/') ? path : `/${path}`
}

/** Client Portal on the canonical secure host. */
export function portalUrl(path = '/'): string {
  return `${SECURE_ORIGIN}${suffix(path)}`
}

/** Pinnacle HQ on the canonical secure host (`/hq`). */
export function hqUrl(path = '/'): string {
  return `${SECURE_ORIGIN}/hq${suffix(path)}`
}

/** Public-site portal mount. Prefer portalUrl() for post-login mail. */
export function wwwPortalUrl(path = '/'): string {
  return `${PORTAL_WWW_BASE}${suffix(path)}`
}

export function portalLoginUrl(): string {
  return portalUrl('/login')
}

export function hqLoginUrl(): string {
  return hqUrl('/login')
}

export function setupPasswordUrl(role: string, token: string): string {
  const origin = role === 'client' ? portalUrl() : hqUrl()
  return `${origin}/set-password?token=${encodeURIComponent(token)}`
}
