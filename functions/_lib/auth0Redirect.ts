import { PORTAL_WWW_BASE } from './appUrls'

const ALLOWED_PREFIXES = [
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
  '/',
]

export function sanitizeReturnPath(raw: string | null | undefined, fallback = '/portal/'): string {
  const value = (raw || '').trim()
  if (!value) return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('://') || value.includes('\\')) {
    return fallback
  }
  const pathOnly = value.split('?')[0].split('#')[0]
  const allowed = ALLOWED_PREFIXES.some((prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`))
  return allowed ? value : fallback
}

export function loginErrorRedirect(code: string, returnTo?: string): string {
  const path = sanitizeReturnPath(returnTo, '/portal/login')
  const base = path.startsWith('/portal/login') ? path : '/portal/login'
  const url = new URL(base, 'https://www.pinnaclemanagementventures.com')
  url.searchParams.set('auth_error', code)
  if (returnTo && !path.startsWith('/portal/login')) {
    url.searchParams.set('returnTo', sanitizeReturnPath(returnTo))
  }
  return `${url.pathname}${url.search}`
}

export function absoluteRedirect(origin: string, path: string): string {
  const safePath = sanitizeReturnPath(path)
  if (safePath.startsWith('http://') || safePath.startsWith('https://')) return safePath
  return `${origin.replace(/\/$/, '')}${safePath.startsWith('/') ? safePath : `/${safePath}`}`
}

export function portalSecurityPath(): string {
  return `${PORTAL_WWW_BASE}/security`
}
