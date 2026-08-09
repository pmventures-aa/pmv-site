import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { requireNamedPermission } from '../capabilities'
import { sendVendorApproved } from '../accountEmails'
import { uuid } from '../crypto'
import { activityInsert } from '../activity'

export const teamManagementRoutes = new Hono<AppEnv>()

function clean(value: unknown, max = 120): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

// Operational team management intentionally excludes capability flags,
// Owner status, and role-definition assignment. Those remain Owner-controlled.
teamManagementRoutes.patch('/team-members/:id/profile', requireStaff, requireNamedPermission('manage_team'), async (c) => {
  const actor = c.get('user')
  const id = c.req.param('id') || ''
  const target = await c.env.DB.prepare(
    `SELECT u.id,u.email,u.full_name,u.status,u.role,tm.party_type,tm.staff_role,tm.title,tm.vendor_category
     FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id WHERE u.id = ?`,
  ).bind(id).first<any>()
  if (!target || !['staff', 'admin'].includes(target.role)) return c.json({ error: 'team member not found' }, 404)

  type Body = { staff_role?: string; title?: string; party_type?: string; vendor_category?: string; status?: string }
  const body = await c.req.json<Body>().catch(() => ({} as Body))
  const staffRole = clean(body.staff_role, 80) || target.staff_role || 'representative'
  const title = body.title !== undefined ? clean(body.title, 100) || null : target.title
  const partyType = body.party_type === 'vendor' ? 'vendor' : body.party_type === 'employee' ? 'employee' : target.party_type || 'employee'
  const vendorCategory = partyType === 'vendor'
    ? (body.vendor_category !== undefined ? clean(body.vendor_category, 100) || null : target.vendor_category)
    : null
  const nextStatus = body.status === 'active' || body.status === 'suspended' ? body.status : target.status

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO team_members(id,user_id,staff_role,title,party_type,vendor_category)
       VALUES(?,?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET
         staff_role = excluded.staff_role,
         title = excluded.title,
         party_type = excluded.party_type,
         vendor_category = excluded.vendor_category`,
    ).bind(uuid(), id, staffRole, title, partyType, vendorCategory),
    c.env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(nextStatus, id),
    activityInsert(c.env, {
      actorUserId: actor.id,
      kind: 'staff_profile_updated',
      detail: { name: target.full_name || target.email, party_type: partyType, staff_role: staffRole, status: nextStatus },
    }),
  ])
  return c.json({ ok: true })
})

teamManagementRoutes.post('/team-members/:id/approve', requireStaff, requireNamedPermission('manage_team'), async (c) => {
  const actor = c.get('user')
  const id = c.req.param('id') || ''
  const row = await c.env.DB.prepare(
    `SELECT u.id,u.email,u.full_name,u.first_name,u.status,u.role,
            tm.party_type,tm.staff_role,tm.title,tm.vendor_category
     FROM users u JOIN team_members tm ON tm.user_id = u.id WHERE u.id = ?`,
  ).bind(id).first<any>()
  if (!row || !['staff', 'admin'].includes(row.role)) return c.json({ error: 'team member not found' }, 404)
  if (row.status === 'active') return c.json({ ok: true, already_active: true })

  await c.env.DB.prepare("UPDATE users SET status = 'active' WHERE id = ?").bind(id).run()
  let emailDelivery: { status: string; error?: string } | null = null
  if (row.party_type === 'vendor') {
    try {
      emailDelivery = await sendVendorApproved(c.env, {
        userId: id,
        email: row.email,
        firstName: row.first_name || (row.full_name ? String(row.full_name).split(/\s+/)[0] : null),
        actorUserId: actor.id,
      })
    } catch (err) {
      emailDelivery = { status: 'failed', error: err instanceof Error ? err.message : 'approval email failed' }
    }
  }
  return c.json({ ok: true, email_delivery: emailDelivery })
})
