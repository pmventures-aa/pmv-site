import { PUBLIC_SITE_URL } from '../../shared/letterhead'

export { PUBLIC_SITE_URL }

// Canonical public marketing origin. Callers that historically used the
// apex host (no www) should go through this alias so quote, scope, and
// unsubscribe links stay on www.
export const PUBLIC_SITE_BASE = PUBLIC_SITE_URL

// Dedicated post-auth host from DEPLOY.md. Legacy hq. / client. hosts still
// route to the same SPA during cutover, but newly generated account, invite,
// and operational links use secure.
export const SECURE_ORIGIN = 'https://secure.pinnaclemanagementventures.com'
export const LEGACY_HQ_ORIGIN = 'https://hq.pinnaclemanagementventures.com'
export const LEGACY_PORTAL_ORIGIN = 'https://client.pinnaclemanagementventures.com'
/** @deprecated Use LEGACY_HQ_ORIGIN when accepting old hosts; hqUrl() now emits secure. */
export const HQ_APP_ORIGIN = LEGACY_HQ_ORIGIN
/** @deprecated Use LEGACY_PORTAL_ORIGIN when accepting old hosts; portalUrl() now emits secure. */
export const PORTAL_APP_ORIGIN = LEGACY_PORTAL_ORIGIN
export const PORTAL_WWW_BASE = `${PUBLIC_SITE_URL}/portal`
export const HQ_WWW_LOGIN = `${PUBLIC_SITE_URL}/admin/login`
export const PORTAL_WWW_LOGIN = `${PUBLIC_SITE_URL}/portal/login`

function joinOrigin(origin: string, path = '/'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${origin}${suffix === '/' ? '' : suffix}`
}

export function portalUrl(path = '/'): string {
  return joinOrigin(SECURE_ORIGIN, path)
}

export function hqUrl(path = '/'): string {
  return joinOrigin(`${SECURE_ORIGIN}/hq`, path)
}

export function portalLoginUrl(): string {
  return `${SECURE_ORIGIN}/login`
}

export function hqLoginUrl(): string {
  return `${SECURE_ORIGIN}/hq/login`
}

export function setupPasswordUrl(role: string, token: string): string {
  const origin = role === 'client' ? portalUrl() : hqUrl()
  return `${origin}/set-password?token=${encodeURIComponent(token)}`
}

export function wwwPortalUrl(path = '/'): string {
  return joinOrigin(PORTAL_WWW_BASE, path)
}
