import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireOwner } from '../mid'
import { uuid } from '../crypto'
import { getPublishedManagedTemplate, normalizeTemplateSections, slugTemplateKey } from '../managedTemplates'
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

managedTemplateAdminRoutes.post('/managed-templates', requireOwner, async (c) => {
  const actor = c.get('user')
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>))
  const name = toDisplayCase(body.name).slice(0, 200)
  const category = ['agreement', 'document', 'email', 'operations'].includes(String(body.category || '')) ? String(body.category) : 'document'
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1200) : ''
  const requestedKey = slugTemplateKey(typeof body.template_key === 'string' && body.template_key.trim() ? body.template_key : name)
  if (!name || !requestedKey) return c.json({ error: 'a name is required' }, 400)
  const existing = await c.env.DB.prepare('SELECT id FROM managed_templates WHERE template_key=?').bind(requestedKey).first()
  if (existing) return c.json({ error: 'that template key is already in use' }, 409)
  const sections = normalizeTemplateSections(body.sections).length
    ? normalizeTemplateSections(body.sections)
    : [{ id: 'overview', title: 'Overview', body: 'Write the first section, then save a draft version.' }]
  const id = uuid()
  const content = JSON.stringify(sections)
  const label = new Date().toISOString().slice(0, 10)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO managed_templates(id,template_key,name,category,description,status,draft_version,content_json,created_by_user_id,updated_by_user_id)
       VALUES (?,?,?,?,?,'draft',1,?,?,?)`,
    ).bind(id, requestedKey, name, category, description || null, content, actor.id, actor.id),
    c.env.DB.prepare(
      `INSERT INTO managed_template_versions(id,template_id,version_number,version_label,name,description,content_json,change_note,created_by_user_id)
       VALUES (?,?,1,?,?,?,?,?,?)`,
    ).bind(uuid(), id, label, name, description || null, content, 'Created', actor.id),
  ])
  await logAudit(c.env, { actorUserId: actor.id, actorIp: actorIp(c.req.raw), actorUserAgent: actorUserAgent(c.req.raw), action: 'record_created', entityType: 'managed_template', entityId: id, after: { template_key: requestedKey, name, category } })
  return c.json({ ok: true, id, template_key: requestedKey }, 201)
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

managedTemplateAdminRoutes.post('/managed-templates/:id/duplicate', requireOwner, async (c) => {
  const actor = c.get('user')
  const current = await c.env.DB.prepare('SELECT * FROM managed_templates WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!current) return c.json({ error: 'template not found' }, 404)
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>))
  const name = toDisplayCase(body.name ?? `${current.name} copy`).slice(0, 200)
  let key = slugTemplateKey(typeof body.template_key === 'string' && body.template_key.trim() ? body.template_key : `${current.template_key}-copy`)
  if (!name || !key) return c.json({ error: 'a name is required' }, 400)
  const clash = await c.env.DB.prepare('SELECT id FROM managed_templates WHERE template_key=?').bind(key).first()
  if (clash) key = `${key}-${uuid().slice(0, 8)}`
  let sections = normalizeTemplateSections(safeParse(current.content_json))
  if (!sections.length && current.template_key === 'provider-agreement') sections = DEFAULT_PROVIDER_AGREEMENT_SECTIONS
  if (!sections.length) sections = [{ id: 'overview', title: 'Overview', body: 'Write the first section, then save a draft version.' }]
  const id = uuid()
  const content = JSON.stringify(sections)
  const label = new Date().toISOString().slice(0, 10)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO managed_templates(id,template_key,name,category,description,status,draft_version,content_json,created_by_user_id,updated_by_user_id)
       VALUES (?,?,?,?,?,'draft',1,?,?,?)`,
    ).bind(id, key, name, current.category, current.description, content, actor.id, actor.id),
    c.env.DB.prepare(
      `INSERT INTO managed_template_versions(id,template_id,version_number,version_label,name,description,content_json,change_note,created_by_user_id)
       VALUES (?,?,1,?,?,?,?,?,?)`,
    ).bind(uuid(), id, label, name, current.description, content, `Duplicated from ${current.name}`, actor.id),
  ])
  await logAudit(c.env, { actorUserId: actor.id, actorIp: actorIp(c.req.raw), actorUserAgent: actorUserAgent(c.req.raw), action: 'record_created', entityType: 'managed_template', entityId: id, after: { template_key: key, duplicated_from: current.id } })
  return c.json({ ok: true, id, template_key: key }, 201)
})

managedTemplateAdminRoutes.patch('/managed-templates/:id', requireOwner, async (c) => {
  const actor = c.get('user')
  const current = await c.env.DB.prepare('SELECT * FROM managed_templates WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!current) return c.json({ error: 'template not found' }, 404)
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>))
  const status = ['draft', 'published', 'archived'].includes(String(body.status || '')) ? String(body.status) : current.status
  if (current.template_key === 'provider-agreement' && status === 'archived') {
    return c.json({ error: 'the provider agreement cannot be archived' }, 400)
  }
  await c.env.DB.prepare('UPDATE managed_templates SET status=?, updated_by_user_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status, actor.id, current.id).run()
  await logAudit(c.env, { actorUserId: actor.id, actorIp: actorIp(c.req.raw), actorUserAgent: actorUserAgent(c.req.raw), action: 'record_updated', entityType: 'managed_template', entityId: current.id, before: { status: current.status }, after: { status } })
  return c.json({ ok: true, status })
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
