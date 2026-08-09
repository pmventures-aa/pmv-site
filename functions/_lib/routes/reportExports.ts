import { Hono } from 'hono'
import type { AppEnv, SessionUser } from '../types'
import { requireStaff } from '../mid'
import { requireCapability, requireNamedPermission } from '../capabilities'
import { visibleClientIds } from '../access'
import { REPORTS_BY_KEY, type ReportCtx, type ReportDef } from '../reportRegistry'
import { renderReportPdf } from '../reportPdf'
import { uuid } from '../crypto'

export const reportExportRoutes = new Hono<AppEnv>()

function dateRange(c: { req: { query(key: string): string | undefined } }) {
  const now = new Date()
  const defaultTo = now.toISOString().slice(0, 10)
  const defaultFrom = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
  const fromDate = c.req.query('from') || defaultFrom
  const toDate = c.req.query('to') || defaultTo
  return { fromDate, toDate, from: `${fromDate} 00:00:00`, to: `${toDate} 23:59:59` }
}

function canRunReport(user: SessionUser, def: ReportDef) {
  return def.category !== 'employee' || user.role === 'admin'
}

async function logoBytes(requestUrl: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(new URL('/logo-crest.png', requestUrl).toString(), { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit)
    return res.ok ? await res.arrayBuffer() : null
  } catch { return null }
}

function safe(name: string) {
  return name.replace(/[^a-zA-Z0-9._ -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'report'
}

reportExportRoutes.post('/reports/:key/export.pdf', requireStaff, requireCapability('can_view_reports'), async (c) => {
  if (!c.env.UPLOADS) return c.json({ error: 'secure file storage is not configured' }, 503)
  const key = c.req.param('key') || ''
  const def = REPORTS_BY_KEY[key]
  if (!def) return c.json({ error: 'unknown report' }, 404)
  const user = c.get('user')
  if (!canRunReport(user, def)) return c.json({ error: 'forbidden' }, 403)
  const { fromDate, toDate, from, to } = dateRange(c)
  const ctx: ReportCtx = { env: c.env, from, to, clientIds: await visibleClientIds(c.env, user) }
  const result = await def.run(ctx)
  const pdf = await renderReportPdf({ key, label: def.label, description: def.description, from, to, result, generatedBy: user.full_name || user.email, logoBytes: await logoBytes(c.req.url) })
  const id = uuid()
  const fileName = `${safe(def.label)} - ${fromDate} to ${toDate}.pdf`
  const r2Key = `report-exports/${new Date().toISOString().slice(0,7)}/${id}.pdf`
  await c.env.UPLOADS.put(r2Key, pdf, { httpMetadata: { contentType: 'application/pdf' }, customMetadata: { reportKey: key, generatedBy: user.id } })
  try {
    await c.env.DB.prepare(
      `INSERT INTO report_exports(id,report_key,report_label,file_name,r2_key,content_type,size_bytes,filters_json,created_by_user_id)
       VALUES(?,?,?,?,?,'application/pdf',?,?,?)`,
    ).bind(id,key,def.label,fileName,r2Key,pdf.byteLength,JSON.stringify({ from: fromDate, to: toDate }),user.id).run()
  } catch (err) {
    await c.env.UPLOADS.delete(r2Key).catch(()=>{})
    throw err
  }
  return c.json({ ok: true, export: { id, file_name: fileName, report_key: key, report_label: def.label, size_bytes: pdf.byteLength, created_at: new Date().toISOString() } }, 201)
})

reportExportRoutes.get('/report-exports', requireStaff, requireCapability('can_view_reports'), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT re.*, u.full_name created_by_name, u.email created_by_email,
            COALESCE(cp.business_name, cu.full_name, cu.email) client_name
     FROM report_exports re
     LEFT JOIN users u ON u.id=re.created_by_user_id
     LEFT JOIN users cu ON cu.id=re.client_user_id
     LEFT JOIN client_profiles cp ON cp.user_id=re.client_user_id
     ORDER BY re.created_at DESC LIMIT 500`,
  ).all()
  return c.json({ exports: rows.results || [] })
})

reportExportRoutes.get('/report-exports/:id/file', requireStaff, requireCapability('can_view_reports'), async (c) => {
  if (!c.env.UPLOADS) return c.json({ error: 'secure file storage is not configured' }, 503)
  const row = await c.env.DB.prepare('SELECT * FROM report_exports WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!row) return c.json({ error: 'not found' }, 404)
  const object = await c.env.UPLOADS.get(row.r2_key)
  if (!object) return c.json({ error: 'file missing from storage' }, 404)
  c.header('Content-Type', row.content_type || 'application/pdf')
  c.header('Content-Disposition', `inline; filename="${String(row.file_name).replace(/"/g,'')}"`)
  return c.body(object.body)
})

reportExportRoutes.get('/document-center', requireStaff, requireNamedPermission('manage_documents'), async (c) => {
  const user = c.get('user')
  const clientIds = await visibleClientIds(c.env, user)
  const where = clientIds === null ? '1=1' : clientIds.length ? `d.client_user_id IN (${clientIds.map(()=>'?').join(',')})` : '1=0'
  const docs = await c.env.DB.prepare(
    `SELECT d.id,d.client_user_id,d.category,d.file_name,d.review_status,d.visibility,d.content_type,d.size_bytes,d.source,d.created_at,
            COALESCE(cp.business_name,u.full_name,u.email) client_name
     FROM client_documents d JOIN users u ON u.id=d.client_user_id LEFT JOIN client_profiles cp ON cp.user_id=u.id
     WHERE d.archived_at IS NULL AND ${where}
     ORDER BY d.created_at DESC LIMIT 500`,
  ).bind(...(clientIds || [])).all()
  const reportRows = await c.env.DB.prepare(
    `SELECT re.id,re.report_key,re.report_label,re.file_name,re.content_type,re.size_bytes,re.created_at,
            u.full_name created_by_name,u.email created_by_email
     FROM report_exports re LEFT JOIN users u ON u.id=re.created_by_user_id ORDER BY re.created_at DESC LIMIT 500`,
  ).all()
  return c.json({ documents: docs.results || [], report_exports: reportRows.results || [] })
})
