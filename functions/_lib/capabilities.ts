import type { Context, Next } from 'hono'
import type { AppEnv, Env, SessionUser } from './types'

// Admins always pass; a staff member passes only with the named grant on
// their team_members row (see PATCH /admin/users/:id/staff-profile). Lets
// an admin hand out specific admin-adjacent powers without promoting
// someone to full admin. Shared across route files (admin.ts and the
// newer deletion/conversion/audit/reports/employees route files) so the
// capability list lives in exactly one place.
export type Capability =
  | 'can_reveal_payment_info'
  | 'can_manage_users'
  | 'can_manage_settings'
  | 'can_view_reports'
  | 'can_view_audit_log'
  | 'can_manage_communications'

export async function hasCapability(env: Env, user: SessionUser, cap: Capability): Promise<boolean> {
  if (user.role === 'admin') return true
  if (user.role !== 'staff') return false
  const row = await env.DB.prepare(`SELECT ${cap} AS v FROM team_members WHERE user_id = ?`).bind(user.id).first<{ v: number }>()
  return !!row?.v
}

// Chain after requireStaff. Assumes c.get('user') is already set.
export function requireCapability(cap: Capability) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = c.get('user')
    if (!(await hasCapability(c.env, user, cap))) return c.json({ error: 'forbidden' }, 403)
    await next()
  }
}
