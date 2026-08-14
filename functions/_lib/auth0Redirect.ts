import type { Auth0Surface } from './auth0Access'
import { defaultReturnForSurface, loginPathForSurface, securityPathForSurface } from './auth0Access'
import { PORTAL_WWW_BASE } from './appUrls'

const CLIENT_PREFIXES = [
  '/portal',
  '/portal/',
  '/portal/login',
  '/portal/security',
  '/portal/onboarding',
  '/portal/services',
  '/portal/documents',
  '/portal/messages',
  '/portal/billing',
  '/portal/support',
  '/portal/trusted-contacts',
  '/portal/notifications',
  '/portal/business-profile',
  '/portal/my-team',
  '/portal/properties',
  '/portal/matters',
  '/portal/calendar',
  '/portal/planned-calls',
  '/portal/tasks',
  '/portal/funding',
  '/portal/tax',
  '/portal/trusted',
]

const STAFF_PREFIXES = [
  '/admin',
  '/admin/',
  '/admin/login',
  '/admin/security-center',
  '/admin/settings',
  '/admin/field-work',
  '/admin/field-work/mine',
  '/hq',
  '/hq/',
  '/hq/login',
  '/hq/security-center',
  '/hq/settings',
  '/hq/field-work',
  '/hq/field-work/mine',
]

function allowedPrefixes(surface: Auth0Surface): string[] {
  return surface === 'staff' ? STAFF_PREFIXES : CLIENT_PREFIXES
}

export function sanitizeReturnPath(
  raw: string | null | undefined,
  fallback?: string,
  surface: Auth0Surface = 'client',
): string {
  const safeFallback = fallback || defaultReturnForSurface(surface)
  const value = (raw || '').trim()
  if (!value) return safeFallback
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('://') || value.includes('\\')) {
    return safeFallback
  }
  const pathOnly = value.split('?')[0].split('#')[0]
  const prefixes = allowedPrefixes(surface)
  const allowed = prefixes.some((prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`))
  return allowed ? value : safeFallback
}

export function loginErrorRedirect(code: string, surface: Auth0Surface = 'client', returnTo?: string): string {
  const loginPath = loginPathForSurface(surface)
  const path = sanitizeReturnPath(returnTo, loginPath, surface)
  const base = path.startsWith(loginPath) ? path : loginPath
  const url = new URL(base, 'https://www.pinnaclemanagementventures.com')
  url.searchParams.set('auth_error', code)
  if (returnTo && !path.startsWith(loginPath)) {
    url.searchParams.set('returnTo', sanitizeReturnPath(returnTo, defaultReturnForSurface(surface), surface))
  }
  return `${url.pathname}${url.search}`
}

export function absoluteRedirect(origin: string, path: string, surface: Auth0Surface = 'client'): string {
  const safePath = sanitizeReturnPath(path, defaultReturnForSurface(surface), surface)
  if (safePath.startsWith('http://') || safePath.startsWith('https://')) return safePath
  return `${origin.replace(/\/$/, '')}${safePath.startsWith('/') ? safePath : `/${safePath}`}`
}

export function portalSecurityPath(): string {
  return `${PORTAL_WWW_BASE}/security`
}

export function hqSecurityPath(): string {
  return '/admin/security-center'
}

export function securityPathForAuth0Surface(surface: Auth0Surface): string {
  return securityPathForSurface(surface)
}
