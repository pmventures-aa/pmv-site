/**
 * Pure Auth0 ↔ Pinnacle identity resolution helpers (easy to unit test without live Auth0).
 */

export type ResolveLoginInput = {
  identityUserId: string | null
  identityUserStatus: string | null
  identityUserRole: string | null
  providerEmail: string | null
  emailVerified: boolean
  existingEmailUserId: string | null
}

export type ResolveLoginResult =
  | { action: 'session'; userId: string }
  | { action: 'create_client' }
  | { action: 'reject'; reason: 'inactive' | 'wrong_surface' | 'link_required' | 'unverified' | 'missing_subject' }

export function resolveAuth0Login(input: ResolveLoginInput): ResolveLoginResult {
  if (input.identityUserId) {
    if (input.identityUserStatus !== 'active') return { action: 'reject', reason: 'inactive' }
    if (input.identityUserRole !== 'client' && input.identityUserRole !== 'trusted_contact') {
      return { action: 'reject', reason: 'wrong_surface' }
    }
    return { action: 'session', userId: input.identityUserId }
  }

  if (input.existingEmailUserId) {
    return { action: 'reject', reason: 'link_required' }
  }

  if (!input.emailVerified || !input.providerEmail) {
    return { action: 'reject', reason: 'unverified' }
  }

  return { action: 'create_client' }
}

export type ResolveLinkInput = {
  sessionUserId: string | null
  intendedUserId: string | null
  emailVerified: boolean
  providerEmail: string | null
  existingIdentityUserId: string | null
}

export type ResolveLinkResult =
  | { action: 'already_linked' }
  | { action: 'link' }
  | { action: 'reject'; reason: 'unauthenticated' | 'mismatch' | 'unverified' | 'owned_elsewhere' }

export function resolveAuth0Link(input: ResolveLinkInput): ResolveLinkResult {
  if (!input.sessionUserId || !input.intendedUserId) return { action: 'reject', reason: 'unauthenticated' }
  if (input.sessionUserId !== input.intendedUserId) return { action: 'reject', reason: 'mismatch' }
  if (!input.emailVerified || !input.providerEmail) return { action: 'reject', reason: 'unverified' }
  if (input.existingIdentityUserId && input.existingIdentityUserId !== input.sessionUserId) {
    return { action: 'reject', reason: 'owned_elsewhere' }
  }
  if (input.existingIdentityUserId === input.sessionUserId) return { action: 'already_linked' }
  return { action: 'link' }
}

export function canUnlinkAuthMethod(passwordCount: number, identityCount: number): boolean {
  return passwordCount + identityCount > 1
}

/** Auth0 Organizations are deferred — Pinnacle client relationships stay authoritative. */
export const AUTH0_ORGANIZATIONS_DEFERRED = {
  status: 'deferred' as const,
  reason:
    'Auth0 Organizations are not required for the initial client-portal sign-in. Pinnacle business/relationship records remain authoritative. Future integration should only map Organizations to genuine multi-user business clients, never to granular resource permissions.',
}
