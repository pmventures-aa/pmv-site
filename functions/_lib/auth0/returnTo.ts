export type Auth0Surface = 'client' | 'staff'

const MAX_LEN = 300

export function sanitizeReturnTo(value: string | null | undefined, surface: Auth0Surface): string | null {
  if (!value) return null
  const raw = value.trim()
  if (!raw || raw.length > MAX_LEN) return null
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null
  if (raw.includes('\\') || raw.includes('://')) return null
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null

  const path = raw.split('?')[0].split('#')[0]
  if (path.includes('..')) return null
  if (surface === 'client' && (path.startsWith('/admin') || path.startsWith('/hq'))) return null
  if (surface === 'staff' && (path.startsWith('/portal') || path === '/trusted' || path.startsWith('/trusted/'))) return null
  return raw
}

export function defaultReturnTo(surface: Auth0Surface, dedicatedHost: boolean): string {
  if (surface === 'staff') return dedicatedHost ? '/' : '/admin'
  return dedicatedHost ? '/' : '/portal'
}

export function loginPathFor(surface: Auth0Surface, hostname: string): string {
  const host = hostname.toLowerCase()
  if (surface === 'staff') {
    if (host.startsWith('secure.')) return '/hq/login'
    if (host.startsWith('hq.')) return '/login'
    return '/admin/login'
  }
  if (host.startsWith('secure.') || host.startsWith('client.')) return '/login'
  return '/portal/login'
}

export function isDedicatedAppHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host.startsWith('secure.') || host.startsWith('client.') || host.startsWith('hq.')
}

export function callbackErrorPath(loginPath: string): string {
  const join = loginPath.includes('?') ? '&' : '?'
  return `${loginPath}${join}auth_error=signin`
}
