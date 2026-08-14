export type Auth0Surface = 'client' | 'staff'

export function parseAuth0Surface(raw: string | null | undefined): Auth0Surface {
  return raw === 'staff' ? 'staff' : 'client'
}

export function roleAllowedForSurface(role: string, surface: Auth0Surface): boolean {
  if (surface === 'staff') return role === 'staff' || role === 'admin'
  return role === 'client' || role === 'trusted_contact'
}

export function defaultReturnForSurface(surface: Auth0Surface): string {
  return surface === 'staff' ? '/admin/' : '/portal/'
}

export function loginPathForSurface(surface: Auth0Surface): string {
  return surface === 'staff' ? '/admin/login' : '/portal/login'
}

export function securityPathForSurface(surface: Auth0Surface): string {
  return surface === 'staff' ? '/admin/security-center' : '/portal/security'
}

export function postAuthDestination(role: string, surface: Auth0Surface, returnTo: string): string {
  if (surface === 'staff') return returnTo || '/admin/'
  if (role === 'trusted_contact') return returnTo || '/portal/trusted'
  return returnTo || '/portal/'
}
