import type { Env } from './types'

export type Auth0Surface = 'client' | 'staff'

/** Owner accounts always sign in with email/password — never Auth0 social. */
export async function isOwnerAccount(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT is_owner FROM team_members WHERE user_id = ?',
  ).bind(userId).first<{ is_owner: number }>()
  return !!row?.is_owner
}

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
