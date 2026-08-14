import { PUBLIC_SITE_URL } from '../../shared/letterhead'

export { PUBLIC_SITE_URL }

// Canonical hosts from DEPLOY.md:
//   www.   = public marketing
//   secure. = Client Portal (/) + Pinnacle HQ (/hq/*)
// Legacy hq. / client. still resolve in the SPA during cutover, but new
// invite, welcome, and setup links must be minted against secure.
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

/** Public marketing base (www). Prefer this over apex-without-www. */
export const PUBLIC_SITE_BASE = PUBLIC_SITE_URL

function withPath(origin: string, path = '/'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${origin}${suffix === '/' ? '' : suffix}`
}

/** Client Portal absolute URL on secure. (root of the host). */
export function portalUrl(path = '/'): string {
  return withPath(SECURE_ORIGIN, path)
}

/** Pinnacle HQ absolute URL on secure./hq. */
export function hqUrl(path = '/'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  if (suffix === '/') return `${SECURE_ORIGIN}/hq`
  return `${SECURE_ORIGIN}/hq${suffix}`
}

/** www-mounted portal path (legacy public mount; prefer portalUrl for post-login). */
export function wwwPortalUrl(path = '/'): string {
  return withPath(PORTAL_WWW_BASE, path)
}
