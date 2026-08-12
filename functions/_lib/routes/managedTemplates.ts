import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireOwner } from '../mid'
import { uuid } from '../crypto'
import { getPublishedManagedTemplate, normalizeTemplateSections } from '../managedTemplates'
import { DEFAULT_PROVIDER_AGREEMENT_SECTIONS } from '../../../shared/providerAgreementContent'
import { toDisplayCase } from '../../../shared/displayCase'
import { logAudit, actorIp, actorUserAgent } from '../auditLog'

export const managedTemplatePublicRoutes = new Hono<AppEnv>()
export const managedTemplateAdminRoutes = new Hono<AppEnv>()

managedTemplatePublicRoutes.get('/managed-templates/:key', async (c) => {
  const template = await getPublishedManagedTemplate(c.env, c.req.param('key') || '')
  if (!template) return c.json({ error: 'published template not found' }, 404)
  c.header('Cache-Control', 'public, max-age=300')
  return c.json({ template })
})

managedTemplateAdminRoutes.get('/managed-templates', requireOwner, async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id,template_key,name,category,description,status,draft_version,published_version,published_version_label,
            updated_at,published_at,
            CASE WHEN published_version IS NULL OR draft_version > published_version THEN 1 ELSE 0 END has_unpublished_changes
     FROM managed_templates ORDER BY category,name`,
  ).all()
  return c.json({ templates: rows.results || [] })
})

managedTemplateAdminRoutes.get('/managed-templates/:id', requireOwner, async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM managed_templates WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!row) return c.json({ error: 'template not found' }, 404)
  let sections = normalizeTemplateSections(safeParse(row.content_json))
  if (!sections.length && row.template_key === 'provider-agreement') sections = DEFAULT_PROVIDER_AGREEMENT_SECTIONS
  const versions = await c.env.DB.prepare(
    `SELECT id,version_number,version_label,change_note,published_at,created_at
     FROM managed_template_versions WHERE template_id=? ORDER BY version_number DESC LIMIT 50`,
  ).bind(row.id).all()
  return c.json({ template: { ...row, sections, content_json: undefined }, versions: versions.results || [] })
})

managedTemplateAdminRoutes.patch('/managed-templates/:id/draft', requireOwner, async (c) => {
  const actor = c.get('user')
  const current = await c.env.DB.prepare('SELECT * FROM managed_templates WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!current) return c.json({ error: 'template not found' }, 404)
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>))
  const name = toDisplayCase(body.name ?? current.name).slice(0, 200)
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1200) : String(current.description || '')
  const sections = normalizeTemplateSections(body.sections)
  if (!name || !sections.length) return c.json({ error: 'a name and at least one complete section are required' }, 400)
  const version = Number(current.draft_version || 0) + 1
  const label = typeof body.version_label === 'string' && body.version_label.trim() ? body.version_label.trim().slice(0, 80) : new Date().toISOString().slice(0, 10)
  const note = typeof body.change_note === 'string' ? body.change_note.trim().slice(0, 500) : ''
  const content = JSON.stringify(sections)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE managed_templates SET name=?,description=?,content_json=?,draft_version=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).bind(name, description || null, content, version, actor.id, current.id),
    c.env.DB.prepare(
      `INSERT INTO managed_template_versions(id,template_id,version_number,version_label,name,description,content_json,change_note,created_by_user_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(uuid(), current.id, version, label, name, description || null, content, note || null, actor.id),
  ])
  await logAudit(c.env, { actorUserId: actor.id, actorIp: actorIp(c.req.raw), actorUserAgent: actorUserAgent(c.req.raw), action: 'record_updated', entityType: 'managed_template', entityId: current.id, before: { draft_version: current.draft_version }, after: { draft_version: version, version_label: label, change_note: note || null } })
  return c.json({ ok: true, version_number: version, version_label: label })
})

managedTemplateAdminRoutes.post('/managed-templates/:id/publish', requireOwner, async (c) => {
  const actor = c.get('user')
  const current = await c.env.DB.prepare('SELECT * FROM managed_templates WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!current) return c.json({ error: 'template not found' }, 404)
  const version = Number(current.draft_version || 0)
  let versionRow = await c.env.DB.prepare('SELECT * FROM managed_template_versions WHERE template_id=? AND version_number=?').bind(current.id, version).first<any>()
  if (!versionRow) {
    const content = current.template_key === 'provider-agreement' && !normalizeTemplateSections(safeParse(current.content_json)).length
      ? JSON.stringify(DEFAULT_PROVIDER_AGREEMENT_SECTIONS) : current.content_json
    await c.env.DB.prepare(
      `INSERT INTO managed_template_versions(id,template_id,version_number,version_label,name,description,content_json,change_note,created_by_user_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(uuid(), current.id, version, current.published_version_label || new Date().toISOString().slice(0, 10), current.name, current.description, content, 'Published from seeded template', actor.id).run()
    versionRow = await c.env.DB.prepare('SELECT * FROM managed_template_versions WHERE template_id=? AND version_number=?').bind(current.id, version).first<any>()
  }
  if (!normalizeTemplateSections(safeParse(versionRow?.content_json)).length) return c.json({ error: 'template has no publishable sections' }, 400)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE managed_templates SET status='published',published_version=?,published_version_label=?,published_by_user_id=?,published_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).bind(version, versionRow.version_label, actor.id, current.id),
    c.env.DB.prepare(
      `UPDATE managed_template_versions SET published_by_user_id=?,published_at=CURRENT_TIMESTAMP WHERE template_id=? AND version_number=?`,
    ).bind(actor.id, current.id, version),
  ])
  await logAudit(c.env, { actorUserId: actor.id, actorIp: actorIp(c.req.raw), actorUserAgent: actorUserAgent(c.req.raw), action: 'record_updated', entityType: 'managed_template', entityId: current.id, before: { published_version: current.published_version, published_version_label: current.published_version_label }, after: { published_version: version, published_version_label: versionRow.version_label } })
  return c.json({ ok: true, version_number: version, version_label: versionRow.version_label })
})

function safeParse(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return [] }
}
