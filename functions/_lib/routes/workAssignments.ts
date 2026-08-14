import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { canAccessClient } from '../scope'
import { logActivity } from '../activity'

export const workAssignmentRoutes = new Hono<AppEnv>()

const ASSIGNABLE = {
  matter: { table: 'matters', column: 'assigned_staff_user_id' },
  task: { table: 'client_tasks', column: 'assigned_staff_user_id' },
  ticket: { table: 'support_tickets', column: 'assigned_staff_user_id' },
  field_assignment: { table: 'field_assignments', column: 'vendor_user_id' },
  service_application: { table: 'service_applications', column: 'assigned_rep_user_id' },
} as const

type AssignableType = keyof typeof ASSIGNABLE

workAssignmentRoutes.post('/work-assignments/:type/:id/assign-self', requireStaff, async (c) => {
  const user = c.get('user')
  const type = c.req.param('type') as AssignableType
  const config = ASSIGNABLE[type]
  if (!config) return c.json({ error: 'unsupported assignment type' }, 400)

  const row = await c.env.DB.prepare(
    `SELECT id, client_user_id FROM ${config.table} WHERE id = ?`,
  ).bind(c.req.param('id') || '').first<{ id: string; client_user_id: string }>()
  if (!row) return c.json({ error: 'not found' }, 404)
  if (!(await canAccessClient(c.env, user, row.client_user_id))) return c.json({ error: 'forbidden' }, 403)

  if (type === 'service_application') {
    await c.env.DB.prepare(
      "UPDATE service_applications SET assigned_rep_user_id = ?, assigned_by_user_id = ?, assigned_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    ).bind(user.id, user.id, row.id).run()
  } else {
    await c.env.DB.prepare(
      `UPDATE ${config.table} SET ${config.column} = ? WHERE id = ?`,
    ).bind(user.id, row.id).run()
  }

  await logActivity(c.env, {
    actorUserId: user.id,
    clientUserId: row.client_user_id,
    kind: 'work_assigned_to_self',
    detail: { target_type: type, target_id: row.id },
  })
  return c.json({ ok: true, assigned_user_id: user.id })
})
