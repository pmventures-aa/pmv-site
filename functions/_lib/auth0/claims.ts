import type { UserClaims } from '@auth0/auth0-server-js'

export interface Auth0IdentityClaims {
  iss: string
  sub: string
  email: string | null
  emailVerified: boolean
  givenName: string
  familyName: string
  fullName: string
  connection: string | null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1
}

/**
 * Auth0 claims authenticate identity only. Roles, org membership, and custom
 * permissions are ignored and never copied onto the Pinnacle session.
 */
export function extractIdentityClaims(user: UserClaims | undefined | null, fallbackIssuer: string, requestedConnection?: string | null): Auth0IdentityClaims | null {
  if (!user) return null
  const sub = asString(user.sub)
  if (!sub) return null
  const iss = asString(user.iss) || fallbackIssuer
  if (!iss) return null
  const email = asString(user.email).toLowerCase() || null
  const givenName = asString(user.given_name)
  const familyName = asString(user.family_name)
  const name = asString(user.name)
  const fullName = `${givenName} ${familyName}`.trim() || name
  const connection = asString(user['https://auth0.com/connection'])
    || asString(user.connection)
    || (sub.includes('|') ? sub.split('|')[0] : '')
    || asString(requestedConnection)
    || null
  return {
    iss,
    sub,
    email,
    emailVerified: asBoolean(user.email_verified),
    givenName,
    familyName,
    fullName,
    connection,
  }
}

export function claimsGrantNoAuthorization(user: UserClaims | undefined | null): string[] {
  if (!user) return []
  const ignored = ['role', 'roles', 'permissions', 'org_id', 'org_name', 'groups']
  return ignored.filter((key) => user[key] !== undefined && user[key] !== null)
}
