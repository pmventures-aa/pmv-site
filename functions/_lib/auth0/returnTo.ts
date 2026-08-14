import { defaultPortalReturnTo } from './config'

const MAX_RETURN_TO = 300

const DEDICATED_PORTAL_PREFIXES = [
  '/security',
  '/trusted',
  '/services',
  '/matters',
  '/documents',
  '/onboarding',
  '/billing',
  '/messages',
  '/support',
  '/business-profile',
  '/my-team',
  '/notifications',
  '/calendar',
  '/property-management',
  '/funding',
  '/tax-filings',
  '/planned-calls',
  '/trusted-contacts',
]

function isAllowedPath(path: string): boolean {
  if (path === '/' || path === '/portal' || path.startsWith('/portal/')) return true
  return DEDICATED_PORTAL_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

function stripDangerous(value: string): string {
  return value.replace(/[\0\r\n\\]/g, '')
}

/**
 * Only same-origin relative portal paths are accepted. Protocol-relative,
 * scheme-bearing, and encoded open-redirect payloads fall back to the portal home.
 */
export function validateReturnTo(raw: string | null | undefined, request?: Request): string {
  const fallback = request ? defaultPortalReturnTo(request) : '/portal'
  if (typeof raw !== 'string' || !raw.trim()) return fallback

  let value = stripDangerous(raw.trim())
  try { value = decodeURIComponent(value) } catch { return fallback }
  value = stripDangerous(value).trim()
  if (value.length > MAX_RETURN_TO) return fallback
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback
  if (value.includes('://') || value.includes('\\')) return fallback
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return fallback
  if (value.includes('..')) return fallback

  const qIndex = value.indexOf('?')
  const hIndex = value.indexOf('#')
  const pathEnd = [qIndex, hIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0]
  const path = pathEnd === undefined ? value : value.slice(0, pathEnd)
  const rest = pathEnd === undefined ? '' : value.slice(pathEnd)
  if (/javascript:|data:|vbscript:|https?:/i.test(rest)) return fallback
  if (path === '/' || path === '/portal' || path.startsWith('/portal/')) return `${path}${rest}`
  if (isAllowedPath(path)) return `${path}${rest}`
  return fallback
}

export function loginErrorPath(request: Request, code: 'signin' | 'link' | 'unavailable' = 'signin'): string {
  const originPath = request ? (new URL(request.url).origin.startsWith('https://secure.') || new URL(request.url).origin.startsWith('https://client.') ? '/login' : '/portal/login') : '/portal/login'
  return `${originPath}?auth_error=${code}`
}
