import { PUBLIC_SITE_URL } from '../../shared/letterhead'

export { PUBLIC_SITE_URL }

// Canonical hosts from DEPLOY.md:
//   www.     → public marketing
//   secure.  → portal (/) + HQ (/hq/*)
// Legacy hq. / client. remain resolvable during cutover but MUST NOT be
// generated for new invite, setup, or transactional links.
export const SECURE_ORIGIN = 'https://secure.pinnaclemanagementventures.com'
export const LEGACY_HQ_ORIGIN = 'https://hq.pinnaclemanagementventures.com'
export const LEGACY_PORTAL_ORIGIN = 'https://client.pinnaclemanagementventures.com'

/** @deprecated Prefer SECURE_ORIGIN + hqUrl(); kept for webhook/host allowlists. */
export const HQ_APP_ORIGIN = LEGACY_HQ_ORIGIN
/** @deprecated Prefer SECURE_ORIGIN + portalUrl(); kept for webhook/host allowlists. */
export const PORTAL_APP_ORIGIN = LEGACY_PORTAL_ORIGIN

export const PORTAL_WWW_BASE = `${PUBLIC_SITE_URL}/portal`
export const HQ_WWW_LOGIN = `${PUBLIC_SITE_URL}/admin/login`
export const PORTAL_WWW_LOGIN = `${PUBLIC_SITE_URL}/portal/login`

/** Canonical public marketing origin (www). Prefer this over apex aliases. */
export const PUBLIC_SITE_BASE = PUBLIC_SITE_URL

export function portalUrl(path = '/'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${SECURE_ORIGIN}${suffix === '/' ? '' : suffix}`
}

export function hqUrl(path = '/'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  if (suffix === '/') return `${SECURE_ORIGIN}/hq`
  return `${SECURE_ORIGIN}/hq${suffix}`
}

export function wwwPortalUrl(path = '/'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${PORTAL_WWW_BASE}${suffix === '/' ? '' : suffix}`
}
