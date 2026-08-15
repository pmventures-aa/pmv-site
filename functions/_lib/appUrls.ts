import { PUBLIC_SITE_URL } from '../../shared/letterhead'

export { PUBLIC_SITE_URL }

// Dedicated post-auth host from DEPLOY.md. Invite and login emails stay on
// the www path mounts and the still-live hq. / client. hosts until that DNS
// cutover is confirmed. Operational portal links use the legacy client host
// so existing mail keeps working during the overlap.
export const SECURE_ORIGIN = 'https://secure.pinnaclemanagementventures.com'
export const HQ_APP_ORIGIN = 'https://hq.pinnaclemanagementventures.com'
export const PORTAL_APP_ORIGIN = 'https://client.pinnaclemanagementventures.com'
export const PORTAL_WWW_BASE = `${PUBLIC_SITE_URL}/portal`
export const HQ_WWW_LOGIN = `${PUBLIC_SITE_URL}/admin/login`
export const PORTAL_WWW_LOGIN = `${PUBLIC_SITE_URL}/portal/login`

export function portalUrl(path = '/'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${PORTAL_APP_ORIGIN}${suffix === '/' ? '' : suffix}`
}

export function hqUrl(path = '/'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${HQ_APP_ORIGIN}${suffix === '/' ? '' : suffix}`
}

export function wwwPortalUrl(path = '/'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${PORTAL_WWW_BASE}${suffix === '/' ? '' : suffix}`
}
