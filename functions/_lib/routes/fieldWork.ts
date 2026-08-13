import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { canAccessClient } from '../access'
import { uuid } from '../crypto'
import { activityInsert, logActivity } from '../activity'
import { actorIp, actorUserAgent, actorGeo, logAudit } from '../auditLog'
import { sendEmail } from '../email'
import { renderPinnacleEmailLayout } from '../emailTemplates/layout'
import { renderFieldAssignmentAuditEmail } from '../emailTemplates/fieldAssignmentAudit'

export const fieldWorkRoutes = new Hono<AppEnv>()

const KIND_VALUES = new Set(['field', 'ron'])
const STATUS_ORDER = ['assigned', 'traveling', 'on_site', 'documented', 'signed', 'completed', 'cancelled'] as const
type Status = typeof STATUS_ORDER[number]

interface AssignmentRow {
  id: string
  kind: string
  service_key: string
  client_user_id: string
  vendor_user_id: string
  assigned_by_user_id: string | null
  title: string | null
  site_label: string | null
  site_address: string | null
  site_city: string | null
  site_state: string | null
  site_postal_code: string | null
  site_lat: number | null
  site_lng: number | null
  scheduled_at: string | null
  status: string
  departed_at: string | null
  depart_lat: number | null
  depart_lng: number | null
  arrived_at: string | null
  arrival_lat: number | null
  arrival_lng: number | null
  arrival_source: string | null
  documented_at: string | null
  completed_at: string | null
  completion_lat: number | null
  completion_lng: number | null
  vendor_signature_type: string | null
  vendor_signature_name: string | null
  vendor_signature_image_key: string | null
  vendor_signed_at: string | null
  vendor_signed_ip: string | null
  audit_email_sent_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  client_name?: string | null
  client_email?: string | null
  vendor_name?: string | null
  vendor_email?: string | null
}

interface DocumentRow {
  id: string
  assignment_id: string
  document_type: string
  signer_names: string
  witness_role: number
  oath_administered: number
  stamps_count: number
  notes: string | null
  created_at: string
}

async function loadAssignment(env: AppEnv['Bindings'], id: string | undefined): Promise<AssignmentRow | null> {
  if (!id) return null
  return await env.DB.prepare(
    `SELECT fa.*,
       cu.full_name AS client_name, cu.email AS client_email,
       vu.full_name AS vendor_name, vu.email AS vendor_email
     FROM field_assignments fa
     LEFT JOIN users cu ON cu.id = fa.client_user_id
     LEFT JOIN users vu ON vu.id = fa.vendor_user_id
     WHERE fa.id = ?`,
  ).bind(id).first<AssignmentRow>()
}

async function loadDocuments(env: AppEnv['Bindings'], assignmentId: string): Promise<DocumentRow[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM field_assignment_documents WHERE assignment_id = ? ORDER BY created_at ASC`,
  ).bind(assignmentId).all<DocumentRow>()
  return res.results ?? []
}

// Both the assigned vendor and the staff/admin who assigned the work can
// see and update an assignment. Everyone else with the staff role can list
// their own assignments only.
function canView(user: { id: string; role: string }, row: AssignmentRow): boolean {
  if (user.role === 'admin') return true
  return row.vendor_user_id === user.id || row.assigned_by_user_id === user.id
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function nowIso(): string {
  return new Date().toISOString()
}

// ---------- Staff: create + list all ----------

fieldWorkRoutes.post('/field-assignments', requireStaff, async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const kind = typeof body.kind === 'string' && KIND_VALUES.has(body.kind) ? body.kind : 'field'
  const serviceKey = typeof body.service_key === 'string' ? body.service_key.trim() : ''
  const clientUserId = typeof body.client_user_id === 'string' ? body.client_user_id : ''
  const vendorUserId = typeof body.vendor_user_id === 'string' ? body.vendor_user_id : ''
  if (!serviceKey || !clientUserId || !vendorUserId) {
    return c.json({ error: 'service_key, client_user_id and vendor_user_id are required' }, 400)
  }
  if (!(await canAccessClient(c.env, user, clientUserId))) {
    return c.json({ error: 'forbidden' }, 403)
  }
  const client = await c.env.DB.prepare(
    `SELECT id FROM users WHERE id = ? AND role = 'client' AND status = 'active'`,
  ).bind(clientUserId).first()
  if (!client) return c.json({ error: 'unknown client' }, 400)
  const vendor = await c.env.DB.prepare(
    `SELECT u.id FROM users u
     LEFT JOIN team_members tm ON tm.user_id = u.id
     WHERE u.id = ? AND u.status = 'active'
       AND (tm.party_type = 'vendor' OR u.role IN ('staff', 'admin'))`,
  ).bind(vendorUserId).first()
  if (!vendor) return c.json({ error: 'unknown vendor' }, 400)
  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO field_assignments (
       id, kind, service_key, client_user_id, vendor_user_id, assigned_by_user_id,
       title, site_label, site_address, site_city, site_state, site_postal_code,
       site_lat, site_lng, scheduled_at, notes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    kind,
    serviceKey,
    clientUserId,
    vendorUserId,
    user.id,
    (body.title as string) || null,
    (body.site_label as string) || null,
    (body.site_address as string) || null,
    (body.site_city as string) || null,
    (body.site_state as string) || null,
    (body.site_postal_code as string) || null,
    num(body.site_lat),
    num(body.site_lng),
    typeof body.scheduled_at === 'string' ? body.scheduled_at : null,
    (body.notes as string) || null,
  ).run()

  await logActivity(c.env, {
    actorUserId: user.id,
    clientUserId,
    kind: 'field_assignment_created',
    detail: { id, service_key: serviceKey, kind_value: kind, vendor_user_id: vendorUserId },
  })

  const row = await loadAssignment(c.env, id)
  return c.json({ assignment: row })
})

fieldWorkRoutes.get('/field-assignments', requireStaff, async (c) => {
  const user = c.get('user')
  const status = c.req.query('status') || ''
  const kind = c.req.query('kind') || ''
  const clauses: string[] = ['1=1']
  const params: unknown[] = []
  if (user.role !== 'admin') {
    clauses.push('(fa.vendor_user_id = ? OR fa.assigned_by_user_id = ?)')
    params.push(user.id, user.id)
  }
  if (status) { clauses.push('fa.status = ?'); params.push(status) }
  if (kind && KIND_VALUES.has(kind)) { clauses.push('fa.kind = ?'); params.push(kind) }
  const res = await c.env.DB.prepare(
    `SELECT fa.*,
       cu.full_name AS client_name, cu.email AS client_email,
       vu.full_name AS vendor_name, vu.email AS vendor_email
     FROM field_assignments fa
     LEFT JOIN users cu ON cu.id = fa.client_user_id
     LEFT JOIN users vu ON vu.id = fa.vendor_user_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY (fa.status = 'completed') ASC, COALESCE(fa.scheduled_at, fa.created_at) DESC
     LIMIT 200`,
  ).bind(...params).all<AssignmentRow>()
  return c.json({ assignments: res.results ?? [] })
})

fieldWorkRoutes.get('/field-assignments/:id', requireStaff, async (c) => {
  const user = c.get('user')
  const row = await loadAssignment(c.env, c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (!canView(user, row)) return c.json({ error: 'forbidden' }, 403)
  const documents = await loadDocuments(c.env, row.id)
  return c.json({ assignment: row, documents })
})

// ---------- Vendor: workflow transitions ----------

fieldWorkRoutes.post('/field-assignments/:id/depart', requireStaff, async (c) => {
  const user = c.get('user')
  const row = await loadAssignment(c.env, c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (row.vendor_user_id !== user.id && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  if (row.kind === 'ron') return c.json({ error: 'travel steps do not apply to RON sessions' }, 400)
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  await c.env.DB.prepare(
    `UPDATE field_assignments SET status = 'traveling', departed_at = ?, depart_lat = ?, depart_lng = ?, updated_at = datetime('now') WHERE id = ?`,
  ).bind(nowIso(), num(body.lat), num(body.lng), row.id).run()
  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'field_assignment_departed',
    entityType: 'field_assignment',
    entityId: row.id,
    after: { lat: num(body.lat), lng: num(body.lng) },
  })
  return c.json({ ok: true })
})

fieldWorkRoutes.post('/field-assignments/:id/arrive', requireStaff, async (c) => {
  const user = c.get('user')
  const row = await loadAssignment(c.env, c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (row.vendor_user_id !== user.id && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  if (row.kind === 'ron') return c.json({ error: 'travel steps do not apply to RON sessions' }, 400)
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const source = body.source === 'auto_geofence' ? 'auto_geofence' : 'manual'
  await c.env.DB.prepare(
    `UPDATE field_assignments SET status = 'on_site', arrived_at = ?, arrival_lat = ?, arrival_lng = ?, arrival_source = ?, updated_at = datetime('now') WHERE id = ?`,
  ).bind(nowIso(), num(body.lat), num(body.lng), source, row.id).run()
  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'field_assignment_arrived',
    entityType: 'field_assignment',
    entityId: row.id,
    after: { lat: num(body.lat), lng: num(body.lng), source },
  })
  return c.json({ ok: true })
})

// Documents can be added, edited or removed while the assignment is not yet
// completed. Once completed the audit trail is frozen — the completion
// email is the record.
fieldWorkRoutes.post('/field-assignments/:id/documents', requireStaff, async (c) => {
  const user = c.get('user')
  const row = await loadAssignment(c.env, c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (row.vendor_user_id !== user.id && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  if (row.status === 'completed' || row.status === 'cancelled') return c.json({ error: 'assignment is closed' }, 409)
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const documentType = typeof body.document_type === 'string' ? body.document_type.trim() : ''
  if (!documentType) return c.json({ error: 'document_type required' }, 400)
  const signers = Array.isArray(body.signer_names) ? body.signer_names.filter((n) => typeof n === 'string' && n.trim()).map((n) => (n as string).trim()) : []
  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO field_assignment_documents (id, assignment_id, document_type, signer_names, witness_role, oath_administered, stamps_count, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    row.id,
    documentType,
    JSON.stringify(signers),
    body.witness_role ? 1 : 0,
    body.oath_administered ? 1 : 0,
    Math.max(0, parseInt(String(body.stamps_count ?? 0), 10) || 0),
    typeof body.notes === 'string' ? body.notes.trim() || null : null,
  ).run()
  await c.env.DB.prepare(
    `UPDATE field_assignments SET status = CASE WHEN status IN ('assigned','traveling','on_site') THEN 'documented' ELSE status END, documented_at = COALESCE(documented_at, ?), updated_at = datetime('now') WHERE id = ?`,
  ).bind(nowIso(), row.id).run()
  return c.json({ id })
})

fieldWorkRoutes.delete('/field-assignments/:id/documents/:docId', requireStaff, async (c) => {
  const user = c.get('user')
  const row = await loadAssignment(c.env, c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (row.vendor_user_id !== user.id && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  if (row.status === 'completed' || row.status === 'cancelled') return c.json({ error: 'assignment is closed' }, 409)
  await c.env.DB.prepare(`DELETE FROM field_assignment_documents WHERE assignment_id = ? AND id = ?`).bind(row.id, c.req.param('docId')).run()
  return c.json({ ok: true })
})

// Completion writes the signature snapshot and fires the branded audit
// email to the client. Whether that email actually leaves the box depends
// on RESEND_API_KEY being configured (same as every other transactional
// email in the app); we mark audit_email_sent_at either way once the
// completion write commits so the vendor UI can show "sent" without
// blocking on the delivery status webhook.
fieldWorkRoutes.post('/field-assignments/:id/complete', requireStaff, async (c) => {
  const user = c.get('user')
  const row = await loadAssignment(c.env, c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (row.vendor_user_id !== user.id && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  if (row.status === 'completed') return c.json({ error: 'already completed' }, 409)
  if (row.status === 'cancelled') return c.json({ error: 'assignment was cancelled' }, 409)
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const signatureType = body.signature_type === 'drawn' ? 'drawn' : 'typed'
  const signatureName = typeof body.signature_name === 'string' ? body.signature_name.trim() : ''
  const signatureImageKey = typeof body.signature_image_key === 'string' ? body.signature_image_key : null
  if (signatureType === 'typed' && signatureName.length < 2) return c.json({ error: 'typed signature must be at least 2 characters' }, 400)
  if (signatureType === 'drawn' && !signatureImageKey) return c.json({ error: 'drawn signature image key missing' }, 400)

  const documents = await loadDocuments(c.env, row.id)
  if (documents.length === 0) return c.json({ error: 'add at least one document before completing' }, 400)

  const now = nowIso()
  await c.env.DB.prepare(
    `UPDATE field_assignments SET
        status = 'completed',
        completed_at = ?,
        completion_lat = ?, completion_lng = ?,
        vendor_signature_type = ?,
        vendor_signature_name = ?,
        vendor_signature_image_key = ?,
        vendor_signed_at = ?,
        vendor_signed_ip = ?,
        audit_email_sent_at = ?,
        updated_at = datetime('now')
      WHERE id = ?`,
  ).bind(
    now,
    num(body.lat), num(body.lng),
    signatureType,
    signatureName || null,
    signatureImageKey,
    now,
    actorIp(c.req.raw),
    now,
    row.id,
  ).run()

  const updated = await loadAssignment(c.env, row.id)
  if (updated && updated.client_email) {
    const { subject, html, text } = renderFieldAssignmentAuditEmail({
      assignment: updated,
      documents,
    })
    try {
      await sendEmail(c.env, { to: updated.client_email, subject, html, text })
    } catch (err) {
      console.error('field-assignment audit email failed', err)
    }
  }

  await logActivity(c.env, {
    actorUserId: user.id,
    clientUserId: row.client_user_id,
    kind: 'field_assignment_completed',
    detail: { id: row.id, service_key: row.service_key, kind: row.kind, documents: documents.length },
  })
  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'field_assignment_completed',
    entityType: 'field_assignment',
    entityId: row.id,
    after: { documents: documents.length, signature_type: signatureType },
  })
  return c.json({ ok: true, assignment: updated })
})

// Small helper: staff can cancel an open assignment.
fieldWorkRoutes.post('/field-assignments/:id/cancel', requireStaff, async (c) => {
  const user = c.get('user')
  const row = await loadAssignment(c.env, c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (user.role !== 'admin' && row.assigned_by_user_id !== user.id) return c.json({ error: 'forbidden' }, 403)
  if (row.status === 'completed') return c.json({ error: 'cannot cancel completed assignment' }, 409)
  await c.env.DB.prepare(`UPDATE field_assignments SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).bind(row.id).run()
  return c.json({ ok: true })
})

fieldWorkRoutes.post('/field-assignments/:id/ping', requireStaff, async (c) => {
  const user = c.get('user')
  const row = await loadAssignment(c.env, c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (row.vendor_user_id !== user.id && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const lat = num(body.lat)
  const lng = num(body.lng)
  if (lat == null || lng == null) return c.json({ error: 'lat and lng are required' }, 400)
  await c.env.DB.prepare(
    `INSERT INTO field_agent_locations (user_id, assignment_id, lat, lng, accuracy_m, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       assignment_id = excluded.assignment_id,
       lat = excluded.lat,
       lng = excluded.lng,
       accuracy_m = excluded.accuracy_m,
       updated_at = datetime('now')`,
  ).bind(user.id, row.id, lat, lng, num(body.accuracy_m)).run()
  return c.json({ ok: true })
})

fieldWorkRoutes.get('/field-map', requireStaff, async (c) => {
  const user = c.get('user')
  const clauses: string[] = ["fa.status NOT IN ('completed', 'cancelled')"]
  const params: unknown[] = []
  if (user.role !== 'admin') {
    clauses.push('(fa.vendor_user_id = ? OR fa.assigned_by_user_id = ?)')
    params.push(user.id, user.id)
  }
  const assignments = await c.env.DB.prepare(
    `SELECT fa.id, fa.kind, fa.service_key, fa.status, fa.title, fa.site_label, fa.site_address,
            fa.site_city, fa.site_state, fa.site_lat, fa.site_lng, fa.scheduled_at,
            fa.depart_lat, fa.depart_lng, fa.arrival_lat, fa.arrival_lng,
            fa.vendor_user_id, vu.full_name AS vendor_name
     FROM field_assignments fa
     LEFT JOIN users vu ON vu.id = fa.vendor_user_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY fa.updated_at DESC
     LIMIT 200`,
  ).bind(...params).all()
  let agents: { results?: Array<{ user_id: string; assignment_id: string | null; lat: number; lng: number; accuracy_m: number | null; updated_at: string; full_name: string | null; email: string }> } = { results: [] }
  try {
    agents = await c.env.DB.prepare(
      `SELECT loc.user_id, loc.assignment_id, loc.lat, loc.lng, loc.accuracy_m, loc.updated_at,
              u.full_name, u.email
       FROM field_agent_locations loc
       JOIN users u ON u.id = loc.user_id
       WHERE julianday('now') - julianday(loc.updated_at) < 1`,
    ).all()
  } catch {
    agents = { results: [] }
  }
  return c.json({ assignments: assignments.results ?? [], agents: agents.results ?? [] })
})

// Suppress unused import warnings for helpers we intentionally re-export
void activityInsert
void renderPinnacleEmailLayout
