import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { requireNamedPermission } from '../capabilities'

export const employeeRoutes = new Hono<AppEnv>()

employeeRoutes.get('/staff-directory', requireStaff, async (c) => {
  const res = await c.env.DB.prepare(
    "SELECT id, full_name, email FROM users WHERE role IN ('staff', 'admin') AND status = 'active' ORDER BY full_name",
  ).all()
  return c.json({ staff: res.results ?? [] })
})

employeeRoutes.get('/employees', requireStaff, requireNamedPermission('manage_team'), async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.last_seen_at, u.last_login_at, u.status,
            tm.staff_role, tm.title, tm.party_type, tm.vendor_category, tm.role_definition_id, rd.name role_name,
            (SELECT COUNT(*) FROM client_tasks WHERE assigned_staff_user_id = u.id) AS tasks_assigned,
            (SELECT COUNT(*) FROM client_tasks WHERE assigned_staff_user_id = u.id AND status = 'done') AS tasks_completed,
            (SELECT COUNT(*) FROM client_tasks WHERE assigned_staff_user_id = u.id AND status != 'done' AND due_date IS NOT NULL AND due_date < date('now')) AS tasks_overdue,
            (SELECT COUNT(*) FROM internal_notes WHERE author_user_id = u.id) AS notes_added,
            (SELECT COUNT(*) FROM email_log WHERE sent_by_user_id = u.id) AS emails_sent,
            (SELECT COUNT(*) FROM activity_events WHERE actor_user_id = u.id) AS client_interactions,
            (SELECT COUNT(*) FROM vendor_application_documents WHERE user_id = u.id) AS application_documents
     FROM users u
     LEFT JOIN team_members tm ON tm.user_id = u.id
     LEFT JOIN role_definitions rd ON rd.id = tm.role_definition_id
     WHERE u.role IN ('staff', 'admin')
     ORDER BY u.full_name`,
  ).all()
  return c.json({ employees: res.results ?? [] })
})

employeeRoutes.get('/employees/:id', requireStaff, requireNamedPermission('manage_team'), async (c) => {
  const id = c.req.param('id') || ''
  const employee = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.last_seen_at, u.last_login_at, u.status, u.created_at,
            tm.staff_role, tm.title, tm.can_reveal_payment_info, tm.can_manage_users, tm.can_manage_settings,
            tm.can_view_reports, tm.can_view_audit_log, tm.can_manage_communications, tm.is_owner,
            tm.party_type, tm.vendor_category, tm.role_definition_id, rd.name role_name,
            (SELECT COUNT(*) FROM client_tasks WHERE assigned_staff_user_id = u.id) AS tasks_assigned,
            (SELECT COUNT(*) FROM client_tasks WHERE assigned_staff_user_id = u.id AND status = 'done') AS tasks_completed,
            (SELECT COUNT(*) FROM client_tasks WHERE assigned_staff_user_id = u.id AND status != 'done' AND due_date IS NOT NULL AND due_date < date('now')) AS tasks_overdue,
            (SELECT COUNT(*) FROM internal_notes WHERE author_user_id = u.id) AS notes_added,
            (SELECT COUNT(*) FROM email_log WHERE sent_by_user_id = u.id) AS emails_sent,
            (SELECT COUNT(*) FROM activity_events WHERE actor_user_id = u.id) AS client_interactions,
            (SELECT COUNT(*) FROM vendor_application_documents WHERE user_id = u.id) AS application_documents
     FROM users u
     LEFT JOIN team_members tm ON tm.user_id = u.id
     LEFT JOIN role_definitions rd ON rd.id = tm.role_definition_id
     WHERE u.id = ?`,
  ).bind(id).first()
  if (!employee) return c.json({ error: 'not found' }, 404)

  const [logins, tasks, notes, avgResponse, vendorDocuments] = await Promise.all([
    c.env.DB.prepare("SELECT created_at, actor_ip, actor_user_agent FROM audit_log WHERE actor_user_id = ? AND action = 'login' ORDER BY created_at DESC LIMIT 20").bind(id).all(),
    c.env.DB.prepare(
      `SELECT t.id,t.title,t.status,t.due_date,t.created_at,u.full_name client_name,u.email client_email
       FROM client_tasks t JOIN users u ON u.id = t.client_user_id
       WHERE t.assigned_staff_user_id = ? ORDER BY t.created_at DESC LIMIT 50`,
    ).bind(id).all(),
    c.env.DB.prepare(
      `SELECT n.id,n.body,n.created_at,u.full_name client_name,u.email client_email
       FROM internal_notes n LEFT JOIN users u ON u.id = n.client_user_id
       WHERE n.author_user_id = ? ORDER BY n.created_at DESC LIMIT 20`,
    ).bind(id).all(),
    c.env.DB.prepare(
      `SELECT AVG((julianday(first_response_at) - julianday(created_at)) * 24) avg_hours
       FROM support_tickets WHERE assigned_staff_user_id = ? AND first_response_at IS NOT NULL`,
    ).bind(id).first<{ avg_hours: number | null }>(),
    c.env.DB.prepare(
      `SELECT id, document_type, file_name, content_type, size_bytes, created_at
       FROM vendor_application_documents WHERE user_id = ? ORDER BY created_at`,
    ).bind(id).all(),
  ])

  let vendorApplication: unknown = null
  try {
    const row = await c.env.DB.prepare('SELECT application_json, submitted_at, updated_at FROM vendor_application_profiles WHERE user_id = ?').bind(id).first<{ application_json:string; submitted_at:string; updated_at:string }>()
    if (row) vendorApplication = { ...JSON.parse(row.application_json), submitted_at: row.submitted_at, updated_at: row.updated_at }
  } catch (err) {
    console.error('[employees] vendor application profile unavailable', err)
  }

  return c.json({
    employee,
    login_history: logins.results ?? [],
    tasks: tasks.results ?? [],
    notes: notes.results ?? [],
    vendor_documents: vendorDocuments.results ?? [],
    vendor_application: vendorApplication,
    avg_response_hours: avgResponse?.avg_hours ?? null,
  })
})

employeeRoutes.get('/employees/:id/vendor-documents/:documentId/download', requireStaff, requireNamedPermission('manage_team'), async (c) => {
  if (!c.env.UPLOADS) return c.json({ error: 'secure file storage is not configured' }, 503)
  const row = await c.env.DB.prepare(
    `SELECT id, object_key, file_name, content_type FROM vendor_application_documents WHERE id = ? AND user_id = ?`,
  ).bind(c.req.param('documentId') || '', c.req.param('id') || '').first<{ id:string; object_key:string; file_name:string; content_type:string|null }>()
  if (!row) return c.json({ error: 'document not found' }, 404)
  const object = await c.env.UPLOADS.get(row.object_key)
  if (!object) return c.json({ error: 'stored document not found' }, 404)
  const safe = row.file_name.replace(/["\r\n]/g, '_')
  return new Response(object.body, { headers: {
    'Content-Type': row.content_type || object.httpMetadata?.contentType || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${safe}"`,
    'Cache-Control': 'private, no-store',
  } })
})
