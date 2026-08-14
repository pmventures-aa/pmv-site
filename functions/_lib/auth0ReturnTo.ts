/**
 * Strict allowlist for post-login redirects.
 * Only same-app relative paths are accepted — never protocol-relative or absolute URLs.
 */

const BLOCKED_PREFIXES = ['//', '/\\', '/http:', '/https:']

export function sanitizeReturnTo(raw: unknown, fallback = '/portal'): string {
  if (typeof raw !== 'string') return fallback
  let value = raw.trim()
  if (!value) return fallback

  // Allow encoded values from query strings.
  try {
    value = decodeURIComponent(value)
  } catch {
    return fallback
  }

  if (!value.startsWith('/')) return fallback
  if (BLOCKED_PREFIXES.some((prefix) => value.toLowerCase().startsWith(prefix))) return fallback
  if (value.includes('://')) return fallback
  if (/[\x00-\x1f]/.test(value)) return fallback

  // Portal / trusted surfaces only (Auth0 is a client-portal sign-in method).
  const allowed =
    value === '/' ||
    value === '/portal' ||
    value.startsWith('/portal/') ||
    value === '/trusted' ||
    value.startsWith('/trusted/')

  if (!allowed) return fallback
  return value.slice(0, 500)
}

export function portalLoginErrorUrl(message: string, surface: 'client' | 'staff' = 'client'): string {
  const base = surface === 'staff' ? '/admin/login' : '/portal/login'
  const params = new URLSearchParams({ auth_error: message.slice(0, 180) })
  return `${base}?${params.toString()}`
}
