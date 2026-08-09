import type { Context, Next } from 'hono'
import type { AppEnv, Env, SessionUser } from './types'

export type Capability =
  | 'can_reveal_payment_info'
  | 'can_manage_users'
  | 'can_manage_settings'
  | 'can_view_reports'
  | 'can_view_audit_log'
  | 'can_manage_communications'

const permissionKey: Record<Capability, string> = {
  can_reveal_payment_info: 'reveal_payment_info',
  can_manage_users: 'manage_users',
  can_manage_settings: 'manage_settings',
  can_view_reports: 'view_reports',
  can_view_audit_log: 'view_audit_log',
  can_manage_communications: 'manage_communications',
}

// Existing per-person capability columns remain supported as direct overrides,
// while database-defined role templates can grant the same powers through
// role_permissions. This makes custom roles effective without breaking legacy
// accounts or forcing every route to understand role names.
export async function hasCapability(env: Env, user: SessionUser, cap: Capability): Promise<boolean> {
  if (user.role === 'admin') return true
  if (user.role !== 'staff') return false
  const row = await env.DB.prepare(
    `SELECT tm.${cap} AS direct_grant,
            CASE WHEN EXISTS (
              SELECT 1 FROM role_permissions rp
              WHERE rp.role_id = tm.role_definition_id AND rp.permission_key = ? AND rp.granted = 1
            ) THEN 1 ELSE 0 END AS role_grant
     FROM team_members tm WHERE tm.user_id = ?`,
  ).bind(permissionKey[cap], user.id).first<{ direct_grant: number; role_grant: number }>()
  return !!row?.direct_grant || !!row?.role_grant
}

// Chain after requireStaff. Assumes c.get('user') is already set.
export function requireCapability(cap: Capability) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = c.get('user')
    if (!(await hasCapability(c.env, user, cap))) return c.json({ error: 'forbidden' }, 403)
    await next()
  }
}
