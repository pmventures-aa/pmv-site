import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { requireNamedPermission } from '../capabilities'
import { uuid } from '../crypto'

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
            tm.network_status, tm.availability_status, tm.is_preferred_provider, tm.service_area_summary,
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
            tm.network_status, tm.availability_status, tm.is_preferred_provider, tm.service_area_summary,
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

  const [logins, tasks, networkNotes, dispatch, notes, avgResponse, vendorDocuments, agreementAcceptances] = await Promise.all([
    c.env.DB.prepare("SELECT created_at, actor_ip, actor_user_agent FROM audit_log WHERE actor_user_id = ? AND action = 'login' ORDER BY created_at DESC LIMIT 20").bind(id).all(),
    c.env.DB.prepare(
      `SELECT t.id,t.title,t.status,t.due_date,t.created_at,u.full_name client_name,u.email client_email
       FROM client_tasks t JOIN users u ON u.id = t.client_user_id
       WHERE t.assigned_staff_user_id = ? ORDER BY t.created_at DESC LIMIT 50`,
    ).bind(id).all(),
    c.env.DB.prepare(
      `SELECT pn.id,pn.body,pn.note_type,pn.created_at,u.full_name author_name,u.email author_email
       FROM provider_network_notes pn JOIN users u ON u.id=pn.author_user_id
       WHERE pn.provider_user_id=? ORDER BY pn.created_at DESC LIMIT 100`,
    ).bind(id).all(),
    c.env.DB.prepare(
      `SELECT id,kind,service_key,status,title,site_label,site_address,scheduled_at,completed_at,created_at
       FROM field_assignments WHERE vendor_user_id=? ORDER BY created_at DESC LIMIT 100`,
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
    c.env.DB.prepare(
      `SELECT agreement_version, signature_name, accepted_at, acceptance_method
       FROM provider_agreement_acceptances WHERE user_id = ? ORDER BY accepted_at DESC`,
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
    provider_agreements: agreementAcceptances.results ?? [],
    network_notes: networkNotes.results ?? [],
    dispatch_history: dispatch.results ?? [],
    avg_response_hours: avgResponse?.avg_hours ?? null,
  })
})

employeeRoutes.patch('/employees/:id/network', requireStaff, requireNamedPermission('manage_team'), async (c) => {
  const id = c.req.param('id') || ''
  const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>))
  const networkStatus = String(body.network_status || 'active')
  const availability = String(body.availability_status || 'available')
  if (!['prospect','vetting','active','paused','inactive'].includes(networkStatus)) return c.json({ error: 'invalid network status' }, 400)
  if (!['available','limited','unavailable'].includes(availability)) return c.json({ error: 'invalid availability status' }, 400)
  const result = await c.env.DB.prepare(`UPDATE team_members SET network_status=?,availability_status=?,is_preferred_provider=?,service_area_summary=? WHERE user_id=?`)
    .bind(networkStatus, availability, body.is_preferred_provider ? 1 : 0, String(body.service_area_summary || '').slice(0,500) || null, id).run()
  if (!result.meta.changes) return c.json({ error: 'provider not found' }, 404)
  return c.json({ ok: true })
})

employeeRoutes.post('/employees/:id/network-notes', requireStaff, requireNamedPermission('manage_team'), async (c) => {
  const id = c.req.param('id') || ''
  const body: { body?: string; note_type?: string } = await c.req.json<{ body?: string; note_type?: string }>().catch(() => ({}))
  const text = String(body.body || '').trim()
  if (!text) return c.json({ error: 'note is required' }, 400)
  const noteId = uuid()
  await c.env.DB.prepare(`INSERT INTO provider_network_notes(id,provider_user_id,author_user_id,body,note_type) VALUES(?,?,?,?,?)`)
    .bind(noteId, id, c.get('user').id, text.slice(0,5000), String(body.note_type || 'general').slice(0,40)).run()
  return c.json({ id: noteId }, 201)
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
