import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { hasCapability } from '../capabilities'

export const roleCapabilityRoutes = new Hono<AppEnv>()

roleCapabilityRoutes.get('/effective-capabilities', requireStaff, async (c) => {
  const user = c.get('user')
  const ownerRow = await c.env.DB.prepare(
    `SELECT tm.is_owner, tm.role_definition_id, rd.name role_name
     FROM team_members tm LEFT JOIN role_definitions rd ON rd.id=tm.role_definition_id
     WHERE tm.user_id=?`,
  ).bind(user.id).first<{ is_owner:number; role_definition_id:string|null; role_name:string|null }>()
  const [banking, users, settings, reports, audit, communications] = await Promise.all([
    hasCapability(c.env,user,'can_reveal_payment_info'),
    hasCapability(c.env,user,'can_manage_users'),
    hasCapability(c.env,user,'can_manage_settings'),
    hasCapability(c.env,user,'can_view_reports'),
    hasCapability(c.env,user,'can_view_audit_log'),
    hasCapability(c.env,user,'can_manage_communications'),
  ])
  return c.json({
    can_reveal_payment_info: banking,
    can_manage_users: users,
    can_manage_settings: settings,
    can_view_reports: reports,
    can_view_audit_log: audit,
    can_manage_communications: communications,
    is_owner: user.role === 'admin' && !!ownerRow?.is_owner,
    role_definition_id: ownerRow?.role_definition_id || null,
    role_name: ownerRow?.role_name || (user.role === 'admin' ? 'Administrator' : null),
  })
})
