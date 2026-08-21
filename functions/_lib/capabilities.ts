import type { Context, Next } from 'hono'
import type { AppEnv, Env, SessionUser } from './types'

export type Capability =
  | 'can_reveal_payment_info'
  | 'can_manage_users'
  | 'can_manage_settings'
  | 'can_view_reports'
  | 'can_view_audit_log'
  | 'can_manage_communications'

export type NamedPermission =
  | 'reveal_payment_info'
  | 'manage_users'
  | 'manage_settings'
  | 'view_reports'
  | 'view_audit_log'
  | 'manage_communications'
  | 'manage_invitations'
  | 'manage_documents'
  | 'manage_team'
  | 'manage_email_templates'

export const NAMED_PERMISSIONS: NamedPermission[] = [
  'reveal_payment_info',
  'manage_users',
  'manage_settings',
  'view_reports',
  'view_audit_log',
  'manage_communications',
  'manage_invitations',
  'manage_documents',
  'manage_team',
  // Rewriting outbound email copy reaches clients directly, so this one is
  // owner-only until explicitly handed out. It has no legacy team_members
  // column on purpose: there is nothing to inherit it from.
  'manage_email_templates',
]

const permissionKey: Record<Capability, NamedPermission> = {
  can_reveal_payment_info: 'reveal_payment_info',
  can_manage_users: 'manage_users',
  can_manage_settings: 'manage_settings',
  can_view_reports: 'view_reports',
  can_view_audit_log: 'view_audit_log',
  can_manage_communications: 'manage_communications',
}

export const namedPermissionColumn: Partial<Record<NamedPermission, Capability>> = {
  reveal_payment_info: 'can_reveal_payment_info',
  manage_users: 'can_manage_users',
  manage_settings: 'can_manage_settings',
  view_reports: 'can_view_reports',
  view_audit_log: 'can_view_audit_log',
  manage_communications: 'can_manage_communications',
}

export function resolveNamedPermission(opts: {
  accountRole: string
  override: number | null | undefined
  directGrant: number | null | undefined
  roleGrant: number | null | undefined
}): boolean {
  if (opts.accountRole === 'admin') return true
  if (opts.accountRole !== 'staff') return false
  if (opts.override === 0 || opts.override === 1) return opts.override === 1
  return !!opts.directGrant || !!opts.roleGrant
}

export async function hasNamedPermission(env: Env, user: SessionUser, permission: NamedPermission): Promise<boolean> {
  if (user.role === 'admin') return true
  if (user.role !== 'staff') return false
  const legacy = namedPermissionColumn[permission]
  const selectLegacy = legacy ? `tm.${legacy}` : '0'
  try {
    const row = await env.DB.prepare(
      `SELECT ${selectLegacy} AS direct_grant,
              CASE WHEN EXISTS (
                SELECT 1 FROM role_permissions rp
                WHERE rp.role_id = tm.role_definition_id AND rp.permission_key = ? AND rp.granted = 1
              ) THEN 1 ELSE 0 END AS role_grant,
              (
                SELECT tmpo.granted FROM team_member_permission_overrides tmpo
                WHERE tmpo.team_member_id = tm.id AND tmpo.permission_key = ?
              ) AS override_grant
       FROM team_members tm WHERE tm.user_id = ?`,
    ).bind(permission, permission, user.id).first<{ direct_grant: number; role_grant: number; override_grant: number | null }>()
    return resolveNamedPermission({
      accountRole: user.role,
      override: row?.override_grant,
      directGrant: row?.direct_grant,
      roleGrant: row?.role_grant,
    })
  } catch {
    const row = await env.DB.prepare(
      `SELECT ${selectLegacy} AS direct_grant,
              CASE WHEN EXISTS (
                SELECT 1 FROM role_permissions rp
                WHERE rp.role_id = tm.role_definition_id AND rp.permission_key = ? AND rp.granted = 1
              ) THEN 1 ELSE 0 END AS role_grant
       FROM team_members tm WHERE tm.user_id = ?`,
    ).bind(permission, user.id).first<{ direct_grant: number; role_grant: number }>()
    return resolveNamedPermission({
      accountRole: user.role,
      override: null,
      directGrant: row?.direct_grant,
      roleGrant: row?.role_grant,
    })
  }
}

export async function hasCapability(env: Env, user: SessionUser, cap: Capability): Promise<boolean> {
  return hasNamedPermission(env, user, permissionKey[cap])
}

export function requireCapability(cap: Capability) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = c.get('user')
    if (!(await hasCapability(c.env, user, cap))) return c.json({ error: 'forbidden' }, 403)
    await next()
  }
}

export function requireNamedPermission(permission: NamedPermission) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = c.get('user')
    if (!(await hasNamedPermission(c.env, user, permission))) return c.json({ error: 'forbidden' }, 403)
    await next()
  }
}


/**
 * Whether a permission was EXPLICITLY granted, ignoring the admin shortcut.
 *
 * hasNamedPermission treats any admin as holding everything, which is the
 * right default for most things and the wrong one for a permission whose
 * whole point is that it starts narrower than the admin role. Use this where
 * the baseline is owner-only and every other holder is deliberate.
 */
export async function hasGrantedPermission(env: Env, user: SessionUser, permission: NamedPermission): Promise<boolean> {
  if (user.role !== 'admin' && user.role !== 'staff') return false
  try {
    const row = await env.DB.prepare(
      `SELECT CASE WHEN EXISTS (
                SELECT 1 FROM role_permissions rp
                WHERE rp.role_id = tm.role_definition_id AND rp.permission_key = ? AND rp.granted = 1
              ) THEN 1 ELSE 0 END AS role_grant,
              (
                SELECT tmpo.granted FROM team_member_permission_overrides tmpo
                WHERE tmpo.team_member_id = tm.id AND tmpo.permission_key = ?
              ) AS override_grant
       FROM team_members tm WHERE tm.user_id = ?`,
    ).bind(permission, permission, user.id).first<{ role_grant: number; override_grant: number | null }>()
    // An explicit deny beats a role grant, same precedence as elsewhere.
    if (row?.override_grant === 0 || row?.override_grant === 1) return row.override_grant === 1
    return !!row?.role_grant
  } catch {
    return false
  }
}

/** Owner accounts: admin role plus the is_owner flag on their team record. */
export async function isOwnerAccount(env: Env, user: SessionUser): Promise<boolean> {
  if (user.role !== 'admin') return false
  try {
    const row = await env.DB.prepare('SELECT is_owner FROM team_members WHERE user_id = ?').bind(user.id).first<{ is_owner: number }>()
    return !!row?.is_owner
  } catch {
    return false
  }
}
