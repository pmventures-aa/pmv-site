import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAdmin, requireStaff } from '../mid'

// Employee Management Center — deliberately Admin/Owner only, no
// delegable capability. It exposes every staff member's activity and
// performance data across the whole firm, unlike the other new
// capabilities (reports, audit log) which are meant to be delegable.
export const employeeRoutes = new Hono<AppEnv>()

// Any staff member (not just can_manage_users) needs this for assignee
// pickers on tasks/matters/tickets — deliberately open to requireStaff,
// unlike everything else in this file. Minimal fields only.
employeeRoutes.get('/staff-directory', requireStaff, async (c) => {
  const res = await c.env.DB.prepare(
    "SELECT id, full_name, email FROM users WHERE role IN ('staff', 'admin') AND status = 'active' ORDER BY full_name",
  ).all()
  return c.json({ staff: res.results ?? [] })
})

employeeRoutes.get('/employees', requireAdmin, async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.last_seen_at, u.last_login_at, u.status,
            tm.staff_role, tm.title, tm.party_type, tm.vendor_category,
            (SELECT COUNT(*) FROM client_tasks WHERE assigned_staff_user_id = u.id) AS tasks_assigned,
            (SELECT COUNT(*) FROM client_tasks WHERE assigned_staff_user_id = u.id AND status = 'done') AS tasks_completed,
            (SELECT COUNT(*) FROM client_tasks WHERE assigned_staff_user_id = u.id AND status != 'done' AND due_date IS NOT NULL AND due_date < date('now')) AS tasks_overdue,
            (SELECT COUNT(*) FROM internal_notes WHERE author_user_id = u.id) AS notes_added,
            (SELECT COUNT(*) FROM email_log WHERE sent_by_user_id = u.id) AS emails_sent,
            (SELECT COUNT(*) FROM activity_events WHERE actor_user_id = u.id) AS client_interactions
     FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id
     WHERE u.role IN ('staff', 'admin')
     ORDER BY u.full_name`,
  ).all()
  return c.json({ employees: res.results ?? [] })
})

employeeRoutes.get('/employees/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')!
  const employee = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.last_seen_at, u.last_login_at, u.status, u.created_at,
            tm.staff_role, tm.title, tm.can_reveal_payment_info, tm.can_manage_users, tm.can_manage_settings,
            tm.can_view_reports, tm.can_view_audit_log, tm.can_manage_communications, tm.is_owner,
            tm.party_type, tm.vendor_category
     FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id
     WHERE u.id = ?`,
  ).bind(id).first()
  if (!employee) return c.json({ error: 'not found' }, 404)

  const [logins, tasks, notes, avgResponse] = await Promise.all([
    c.env.DB.prepare("SELECT created_at, actor_ip, actor_user_agent FROM audit_log WHERE actor_user_id = ? AND action = 'login' ORDER BY created_at DESC LIMIT 20").bind(id).all(),
    c.env.DB.prepare(
      `SELECT t.id, t.title, t.status, t.due_date, t.created_at, u.full_name AS client_name, u.email AS client_email
       FROM client_tasks t JOIN users u ON u.id = t.client_user_id
       WHERE t.assigned_staff_user_id = ? ORDER BY t.created_at DESC LIMIT 50`,
    ).bind(id).all(),
    c.env.DB.prepare(
      `SELECT n.id, n.body, n.created_at, u.full_name AS client_name, u.email AS client_email
       FROM internal_notes n LEFT JOIN users u ON u.id = n.client_user_id
       WHERE n.author_user_id = ? ORDER BY n.created_at DESC LIMIT 20`,
    ).bind(id).all(),
    c.env.DB.prepare(
      `SELECT AVG((julianday(first_response_at) - julianday(created_at)) * 24) AS avg_hours
       FROM support_tickets WHERE assigned_staff_user_id = ? AND first_response_at IS NOT NULL`,
    ).bind(id).first<{ avg_hours: number | null }>(),
  ])

  return c.json({
    employee,
    login_history: logins.results ?? [],
    tasks: tasks.results ?? [],
    notes: notes.results ?? [],
    avg_response_hours: avgResponse?.avg_hours ?? null,
  })
})
