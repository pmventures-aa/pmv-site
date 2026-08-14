const BLOCKED_PREFIXES = ['/api', '/admin', '/hq']

function looksSafePath(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return false
  if (value.includes('\\') || value.includes('://')) return false
  if (/[\r\n\0]/.test(value)) return false
  return true
}

function decodeOnce(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function defaultReturnTo(request: Request): string {
  const host = new URL(request.url).hostname
  if (host.startsWith('secure.') || host.startsWith('client.')) return '/'
  return '/portal'
}

export function loginPathForRequest(request: Request): string {
  const host = new URL(request.url).hostname
  if (host.startsWith('secure.') || host.startsWith('client.')) return '/login'
  return '/portal/login'
}

export function signupPathForRequest(request: Request): string {
  const host = new URL(request.url).hostname
  if (host.startsWith('secure.') || host.startsWith('client.')) return '/signup'
  return '/portal/signup'
}

export function securityPathForRequest(request: Request): string {
  const host = new URL(request.url).hostname
  if (host.startsWith('secure.') || host.startsWith('client.')) return '/security'
  return '/portal/security'
}

export function isSafeReturnTo(value: unknown, request: Request): boolean {
  if (typeof value !== 'string' || !value) return false
  const raw = value.trim()
  const decoded = decodeOnce(raw)
  if (!looksSafePath(raw) || !looksSafePath(decoded)) return false
  const pathOnly = decoded.split('?')[0].split('#')[0]
  const lower = pathOnly.toLowerCase()
  if (BLOCKED_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix}/`))) return false
  const host = new URL(request.url).hostname
  if (host.startsWith('secure.') || host.startsWith('client.')) {
    if (lower === '/login' || lower.startsWith('/login/')) return false
    return true
  }
  return lower === '/portal' || lower.startsWith('/portal/')
}

export function safeReturnTo(value: unknown, request: Request): string {
  if (!isSafeReturnTo(value, request)) return defaultReturnTo(request)
  const path = String(value).trim()
  const pathOnly = decodeOnce(path).split('?')[0].split('#')[0].toLowerCase()
  if (pathOnly === '/portal/login' || pathOnly.startsWith('/portal/login/')) return defaultReturnTo(request)
  return path
}
