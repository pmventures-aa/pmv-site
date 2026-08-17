import type { Context, Next } from 'hono'
import type { AppEnv, Env, SessionUser } from './types'
import {
  authorize as coreAuthorize,
  type AuthorizationContext,
  type AuthorizationResource,
  type AuthorizationSubject,
  type DataScope,
  type GranularPermission,
  type LegacyPermission,
} from '../../shared/authorization'

// Server adapter that resolves an AuthorizationSubject from the current
// session + D1 and hands it to the pure authorize() core in
// shared/authorization.ts. Anything server-side that wants a decision on a
// granular permission (or a scope check on a specific record) should go
// through this file - never call coreAuthorize() directly with a hand-rolled
// subject except from tests.

// SessionUser.role today does not distinguish Owner from Admin - the highest
// account role from auth is 'admin'. Owner-only permissions (security.manage
// today) therefore deny at the admin layer until a future is_owner flag is
// wired into loadSubject. Everything below owner continues to work.
function accountRoleFor(user: SessionUser): AuthorizationSubject['accountRole'] {
  const role = String(user.role || '').toLowerCase()
  if (role === 'admin') return 'admin'
  if (role === 'staff') return 'staff'
  // No dedicated vendor role in SessionUser; vendors currently hit HQ as
  // staff. Treat unknown roles as client for the safest fallback.
  return 'client'
}

async function loadGrants(env: Env, user: SessionUser): Promise<{
  granularGrants: Set<GranularPermission>
  legacyGrants: Set<LegacyPermission>
  defaultScope: DataScope
}> {
  const granular = new Set<GranularPermission>()
  const legacy = new Set<LegacyPermission>()
  let defaultScope: DataScope = 'ASSIGNED'

  if (user.role === 'admin') {
    // Admin (and future owner) are handled by the core authorize() - grants don't matter.
    return { granularGrants: granular, legacyGrants: legacy, defaultScope: 'ALL' }
  }

  try {
    const rows = await env.DB.prepare(
      `SELECT rp.permission_key AS key, pc.legacy_key AS legacy_key, rp.granted AS granted
       FROM team_members tm
       JOIN role_permissions rp ON rp.role_id = tm.role_definition_id
       LEFT JOIN permission_catalog pc ON pc.permission_key = rp.permission_key
       WHERE tm.user_id = ?`,
    ).bind(user.id).all<{ key: string; legacy_key: string | null; granted: number }>()
    for (const row of rows.results || []) {
      if (row.granted !== 1) continue
      granular.add(row.key as GranularPermission)
      if (row.legacy_key) legacy.add(row.legacy_key as LegacyPermission)
      // Legacy coarse keys stored directly (no dot) still count as legacy.
      if (!row.key.includes('.')) legacy.add(row.key as LegacyPermission)
    }
  } catch {}

  try {
    const overrides = await env.DB.prepare(
      `SELECT tmpo.permission_key AS key, tmpo.granted AS granted, pc.legacy_key AS legacy_key
       FROM team_members tm
       JOIN team_member_permission_overrides tmpo ON tmpo.team_member_id = tm.id
       LEFT JOIN permission_catalog pc ON pc.permission_key = tmpo.permission_key
       WHERE tm.user_id = ?`,
    ).bind(user.id).all<{ key: string; granted: number; legacy_key: string | null }>()
    for (const row of overrides.results || []) {
      if (row.granted === 1) {
        granular.add(row.key as GranularPermission)
        if (row.legacy_key) legacy.add(row.legacy_key as LegacyPermission)
        if (!row.key.includes('.')) legacy.add(row.key as LegacyPermission)
      } else if (row.granted === 0) {
        granular.delete(row.key as GranularPermission)
      }
    }
  } catch {}

  try {
    const scope = await env.DB.prepare(
      `SELECT rds.scope AS scope
       FROM team_members tm
       LEFT JOIN role_data_scopes rds ON rds.role_id = tm.role_definition_id
       WHERE tm.user_id = ?`,
    ).bind(user.id).first<{ scope: string | null }>()
    if (scope?.scope) defaultScope = scope.scope as DataScope
  } catch {}

  return { granularGrants: granular, legacyGrants: legacy, defaultScope }
}

export async function loadSubject(env: Env, user: SessionUser): Promise<AuthorizationSubject> {
  const grants = await loadGrants(env, user)
  return {
    userId: user.id,
    accountRole: accountRoleFor(user),
    ...grants,
  }
}

// Server-side authorize convenience wrapper. Same decision surface as the
// pure core; loads the subject from D1 first. Returns the decision - the
// caller decides whether to 403.
export async function authorizeRequest(
  env: Env,
  user: SessionUser,
  action: GranularPermission,
  resource?: AuthorizationResource,
  context?: AuthorizationContext,
) {
  const subject = await loadSubject(env, user)
  return coreAuthorize({ subject, action, resource, context })
}

// Hono middleware. Replaces the coarse requireNamedPermission for endpoints
// that migrate to granular permissions. Non-granular endpoints continue to
// use functions/_lib/capabilities.ts unchanged.
export function requirePermission(action: GranularPermission, resource?: AuthorizationResource) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = c.get('user')
    const decision = await authorizeRequest(c.env, user, action, resource)
    if (!decision.allow) return c.json({ error: 'forbidden', reason: decision.reason }, 403)
    await next()
  }
}

export { coreAuthorize }
