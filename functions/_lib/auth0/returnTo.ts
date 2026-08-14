/**
 * Strict allowlist for post-Auth0 redirects. Only same-app relative paths are
 * accepted — never protocol-relative, absolute, or external destinations.
 */

const ALLOWED_PREFIXES = [
  '/portal',
  '/admin',
  '/hq',
] as const

export function sanitizeReturnTo(raw: unknown, fallback = '/portal'): string {
  if (typeof raw !== 'string') return fallback
  const value = raw.trim()
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//')) return fallback
  if (value.includes('\\') || value.includes('\0')) return fallback
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return fallback
  const pathOnly = value.split(/[?#]/)[0] || ''
  const allowed = ALLOWED_PREFIXES.some((prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`))
  if (!allowed) return fallback
  // Keep query/hash from the original relative URL when the path is safe.
  return value.slice(0, 512)
}

export function loginErrorRedirect(logoutUrl: string, code: string): string {
  try {
    const url = new URL(logoutUrl)
    url.searchParams.set('auth0', code)
    return url.toString()
  } catch {
    return `/portal/login?auth0=${encodeURIComponent(code)}`
  }
}
