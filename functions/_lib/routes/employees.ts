import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { requireNamedPermission, hasNamedPermission } from '../capabilities'
import { uuid } from '../crypto'
import { generateVendorApplicationPdf } from '../vendorApplicationRecord'
import { safeUploadName, validateUploadSignature } from '../fileValidation'
import { ALL_APPLICATION_DOC_KEYS } from '../../../shared/providerApplication'

export const employeeRoutes = new Hono<AppEnv>()

// Editable text columns on provider_credentials (w9_on_file is handled
// separately as a boolean).
const CREDENTIAL_TEXT_FIELDS = [
  'insurance_carrier', 'insurance_policy_number', 'insurance_expires_at',
  'auto_insurance_carrier', 'auto_insurance_policy_number', 'auto_insurance_expires_at',
  'notary_commission_number', 'notary_state', 'notary_expires_at',
  'eo_bond_provider', 'eo_bond_expires_at',
  'background_check_status', 'background_check_completed_at',
  'ein', 'notes',
] as const

async function ensureProviderCredentialsTable(env: AppEnv['Bindings']) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS provider_credentials (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      insurance_carrier TEXT, insurance_policy_number TEXT, insurance_expires_at TEXT,
      auto_insurance_carrier TEXT, auto_insurance_policy_number TEXT, auto_insurance_expires_at TEXT,
      notary_commission_number TEXT, notary_state TEXT, notary_expires_at TEXT,
      eo_bond_provider TEXT, eo_bond_expires_at TEXT,
      background_check_status TEXT, background_check_completed_at TEXT,
      w9_on_file INTEGER NOT NULL DEFAULT 0, ein TEXT, details_json TEXT, notes TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')), updated_by_user_id TEXT
    )`,
  ).run()
}

employeeRoutes.get('/staff-directory', requireStaff, async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT u.id, u.full_name, u.email, tm.party_type, tm.vendor_category, tm.availability_status
     FROM users u
     LEFT JOIN team_members tm ON tm.user_id = u.id
     WHERE u.role IN ('staff', 'admin') AND u.status = 'active'
     ORDER BY u.full_name`,
  ).all()
  return c.json({ staff: res.results ?? [] })
})

employeeRoutes.get('/employees', requireStaff, requireNamedPermission('manage_team'), async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.phone, u.last_seen_at, u.last_login_at, u.status,
            tm.staff_role, tm.title, tm.party_type, tm.vendor_category, tm.role_definition_id, rd.name role_name,
            tm.network_status, tm.availability_status, tm.is_preferred_provider, tm.service_area_summary,
            (SELECT COUNT(*) FROM client_tasks WHERE assigned_staff_user_id = u.id) AS tasks_assigned,
            (SELECT COUNT(*) FROM client_tasks WHERE assigned_staff_user_id = u.id AND status = 'done') AS tasks_completed,
            (SELECT COUNT(*) FROM client_tasks WHERE assigned_staff_user_id = u.id AND status != 'done' AND due_date IS NOT NULL AND due_date < date('now')) AS tasks_overdue,
            (SELECT COUNT(*) FROM field_assignments WHERE vendor_user_id = u.id AND status NOT IN ('completed','cancelled')) AS dispatch_open,
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
    `SELECT u.id, u.email, u.full_name, u.phone, u.last_seen_at, u.last_login_at, u.status, u.created_at,
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
    // Sign-ins land under 'login' (password) or 'auth0_login' (Auth0/social),
    // which is how most providers authenticate — include both, and surface the
    // captured IP, device, and geo so staff can see where a provider signed in.
    c.env.DB.prepare("SELECT created_at, action, actor_ip, actor_user_agent, actor_city, actor_region, actor_country FROM audit_log WHERE actor_user_id = ? AND action IN ('login','auth0_login') ORDER BY created_at DESC LIMIT 25").bind(id).all(),
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

  let vendorApplication: Record<string, unknown> | null = null
  try {
    const row = await c.env.DB.prepare('SELECT application_json, submitted_at, updated_at FROM vendor_application_profiles WHERE user_id = ?').bind(id).first<{ application_json:string; submitted_at:string; updated_at:string }>()
    if (row) vendorApplication = { ...JSON.parse(row.application_json), submitted_at: row.submitted_at, updated_at: row.updated_at }
  } catch (err) {
    console.error('[employees] vendor application profile unavailable', err)
  }

  // Provider credentials: the editable, current record. When none is saved yet,
  // seed suggested values from the submitted application so staff start with
  // what we already know instead of a blank form.
  let providerCredentials: Record<string, unknown> = { is_saved: false }
  try {
    await ensureProviderCredentialsTable(c.env)
    const row = await c.env.DB.prepare('SELECT * FROM provider_credentials WHERE user_id = ?').bind(id).first<Record<string, unknown>>()
    if (row) {
      providerCredentials = { ...row, w9_on_file: Number(row.w9_on_file) === 1, is_saved: true }
    } else if (vendorApplication) {
      const a = vendorApplication
      providerCredentials = {
        is_saved: false,
        notary_commission_number: a.commission_number ?? null,
        notary_state: a.commission_state ?? null,
        notary_expires_at: a.commission_expiration ?? null,
        eo_bond_provider: a.ron_provider ?? null,
        w9_on_file: false,
      }
    }
  } catch (err) {
    console.error('[employees] provider credentials unavailable', err)
  }

  return c.json({
    employee,
    login_history: logins.results ?? [],
    tasks: tasks.results ?? [],
    notes: notes.results ?? [],
    vendor_documents: vendorDocuments.results ?? [],
    vendor_application: vendorApplication,
    provider_credentials: providerCredentials,
    provider_agreements: agreementAcceptances.results ?? [],
    network_notes: networkNotes.results ?? [],
    dispatch_history: dispatch.results ?? [],
    avg_response_hours: avgResponse?.avg_hours ?? null,
  })
})

employeeRoutes.patch('/employees/:id/network', requireStaff, async (c) => {
  const id = c.req.param('id') || ''
  const me = c.get('user')
  const target = await c.env.DB.prepare(
    `SELECT u.id, u.role, tm.network_status, tm.availability_status, tm.is_preferred_provider, tm.service_area_summary, tm.staff_role, tm.party_type
     FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id WHERE u.id = ?`,
  ).bind(id).first<{
    id: string; role: string; network_status: string | null; availability_status: string | null
    is_preferred_provider: number | null; service_area_summary: string | null; staff_role: string | null; party_type: string | null
  }>()
  if (!target || !['staff', 'admin'].includes(target.role)) return c.json({ error: 'provider not found' }, 404)
  const isSelf = id === me.id
  const selfServiceVendor = isSelf && target.party_type === 'vendor'
  if (!selfServiceVendor && !(await hasNamedPermission(c.env, me, 'manage_team'))) return c.json({ error: 'forbidden' }, 403)
  const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>))
  const networkStatus = body.network_status != null ? String(body.network_status) : (target.network_status || 'active')
  const availability = body.availability_status != null ? String(body.availability_status) : (target.availability_status || 'available')
  if (!['prospect','vetting','active','paused','inactive'].includes(networkStatus)) return c.json({ error: 'invalid network status' }, 400)
  if (!['available','limited','unavailable'].includes(availability)) return c.json({ error: 'invalid availability status' }, 400)
  const preferred = body.is_preferred_provider != null ? (body.is_preferred_provider ? 1 : 0) : (target.is_preferred_provider ? 1 : 0)
  const area = body.service_area_summary != null ? (String(body.service_area_summary).slice(0,500) || null) : target.service_area_summary
  // A vendor may only flip their own availability. Everything else in their
  // network record (network status, preferred flag, service area) is owned by
  // Network & Dispatch and stays untouched during self-service.
  if (selfServiceVendor) {
    const update = body.availability_status != null ? String(body.availability_status) : (target.availability_status || 'available')
    if (!['available','limited','unavailable'].includes(update)) return c.json({ error: 'invalid availability status' }, 400)
    await c.env.DB.prepare(
      `INSERT INTO team_members(id,user_id,staff_role,party_type,network_status,availability_status,is_preferred_provider,service_area_summary)
       VALUES(?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET availability_status = excluded.availability_status`,
    ).bind(uuid(), id, target.staff_role || 'representative', target.party_type || 'employee', networkStatus, update, preferred, area).run()
    return c.json({ ok: true })
  }
  await c.env.DB.prepare(
    `INSERT INTO team_members(id,user_id,staff_role,party_type,network_status,availability_status,is_preferred_provider,service_area_summary)
     VALUES(?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET
       network_status = excluded.network_status,
       availability_status = excluded.availability_status,
       is_preferred_provider = excluded.is_preferred_provider,
       service_area_summary = excluded.service_area_summary`,
  ).bind(uuid(), id, target.staff_role || 'representative', target.party_type || 'employee', networkStatus, availability, preferred, area).run()
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

// Regenerate the branded provider-application PDF from stored answers and
// (re)attach it to the profile. Lets staff produce a summary for providers
// who applied before the PDF existed, or refresh one after edits.
employeeRoutes.post('/employees/:id/vendor-application/generate-pdf', requireStaff, requireNamedPermission('manage_team'), async (c) => {
  if (!c.env.UPLOADS) return c.json({ error: 'secure file storage is not configured' }, 503)
  const userId = c.req.param('id') || ''
  const profile = await c.env.DB.prepare('SELECT 1 FROM vendor_application_profiles WHERE user_id = ?').bind(userId).first()
  if (!profile) return c.json({ error: 'no stored application answers for this provider' }, 404)
  const documentId = await generateVendorApplicationPdf(c.env, userId, c.req.url)
  if (!documentId) return c.json({ error: 'could not generate the application PDF' }, 500)
  return c.json({ ok: true, document_id: documentId }, 201)
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

// Editable, current provider credentials (insurance, notary, background check,
// tax). Staff maintain this over time so it stays accurate when things change.
employeeRoutes.patch('/employees/:id/credentials', requireStaff, requireNamedPermission('manage_team'), async (c) => {
  const id = c.req.param('id') || ''
  const me = c.get('user')
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  await ensureProviderCredentialsTable(c.env)

  const cols: string[] = []
  const vals: unknown[] = []
  for (const field of CREDENTIAL_TEXT_FIELDS) {
    if (field in body) {
      cols.push(field)
      const v = body[field]
      vals.push(v === '' || v == null ? null : String(v))
    }
  }
  if ('w9_on_file' in body) { cols.push('w9_on_file'); vals.push(body.w9_on_file ? 1 : 0) }
  if ('details_json' in body) { cols.push('details_json'); vals.push(body.details_json == null ? null : JSON.stringify(body.details_json)) }
  if (cols.length === 0) return c.json({ error: 'no credential fields provided' }, 400)

  // Upsert: insert the row if absent, otherwise update the provided columns.
  const insertCols = ['user_id', ...cols, 'updated_at', 'updated_by_user_id']
  const placeholders = insertCols.map(() => '?').join(', ')
  const updateSet = [...cols.map((col) => `${col} = excluded.${col}`), "updated_at = datetime('now')", 'updated_by_user_id = excluded.updated_by_user_id'].join(', ')
  await c.env.DB.prepare(
    `INSERT INTO provider_credentials (${insertCols.join(', ')}) VALUES (${placeholders})
     ON CONFLICT(user_id) DO UPDATE SET ${updateSet}`,
  ).bind(id, ...vals, new Date().toISOString(), me.id).run()
  return c.json({ ok: true })
})

// Staff upload of a provider document (e.g. a refreshed insurance certificate
// when a carrier changes). Stored alongside the provider's application docs.
employeeRoutes.post('/employees/:id/vendor-documents', requireStaff, requireNamedPermission('manage_team'), async (c) => {
  if (!c.env.UPLOADS) return c.json({ error: 'secure file storage is not configured' }, 503)
  const id = c.req.param('id') || ''
  const documentType = (c.req.query('document_type') || 'supporting').toString()
  if (!ALL_APPLICATION_DOC_KEYS.includes(documentType as never)) return c.json({ error: 'unsupported document type' }, 400)
  const contentType = (c.req.header('Content-Type') || '').split(';')[0].toLowerCase()
  const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
  if (!allowed.has(contentType)) return c.json({ error: 'upload a PDF, JPG, PNG, or WebP file' }, 415)
  const body = await c.req.arrayBuffer()
  if (!body.byteLength) return c.json({ error: 'empty file' }, 400)
  if (body.byteLength > 20 * 1024 * 1024) return c.json({ error: 'files must be 20 MB or smaller' }, 413)
  const signature = validateUploadSignature(body, contentType, ['pdf', 'jpeg', 'png', 'webp'])
  if (!signature.ok) return c.json({ error: signature.error }, 415)
  const fileName = safeUploadName(c.req.header('X-File-Name') || 'document', 'document')
  const docId = uuid()
  const objectKey = `vendor-applications/${id}/${docId}-${fileName}`
  await c.env.UPLOADS.put(objectKey, body, { httpMetadata: { contentType }, customMetadata: { validated: 'signature-v1', documentType, uploadedByStaff: '1' } })
  await c.env.DB.prepare(
    `INSERT INTO vendor_application_documents(id,user_id,document_type,object_key,file_name,content_type,size_bytes) VALUES (?,?,?,?,?,?,?)`,
  ).bind(docId, id, documentType, objectKey, fileName, contentType, body.byteLength).run()
  return c.json({ ok: true, id: docId }, 201)
})
