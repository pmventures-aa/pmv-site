import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { hasGrantedPermission, isOwnerAccount } from '../capabilities'
import { sendEmail } from '../email'
import {
  ensureHqEmailTemplates,
  getHqEmailTemplate,
  HQ_EMAIL_SAMPLE_VARS,
  listHqEmailTemplates,
  nextCustomSlug,
  renderHqEmailFromRow,
  snapshotHqEmailTemplate,
  type HqEmailTemplateRow,
} from '../hqEmailTemplates'
import { hqEmailCatalogBySlug } from '../../../shared/hqEmailTemplates'
import { uuid } from '../crypto'

export const hqEmailTemplateRoutes = new Hono<AppEnv>()
hqEmailTemplateRoutes.use('*', requireStaff)

const clean = (v: unknown, n: number) => typeof v === 'string' ? v.trim().slice(0, n) : ''

// Editing this copy changes what lands in clients' inboxes, so the baseline is
// owner-only. Anyone else holds it because someone deliberately granted
// manage_email_templates, not because they happen to be an admin or hold a
// broad settings permission.
async function canManage(env: AppEnv['Bindings'], user: { id: string; role: string }) {
  return await isOwnerAccount(env, user as any)
    || await hasGrantedPermission(env, user as any, 'manage_email_templates')
}

function publicRow(row: HqEmailTemplateRow) {
  let tokens: string[] = []
  try { tokens = JSON.parse(row.variable_schema_json || '[]') } catch { tokens = [] }
  if (!tokens.length) tokens = hqEmailCatalogBySlug(row.slug)?.tokens || ['first_name']
  return { ...row, tokens }
}

hqEmailTemplateRoutes.get('/email-templates', async (c) => {
  const rows = await listHqEmailTemplates(c.env)
  return c.json({ templates: rows.map(publicRow), sample_vars: HQ_EMAIL_SAMPLE_VARS })
})

hqEmailTemplateRoutes.get('/email-templates/:id', async (c) => {
  const row = await getHqEmailTemplate(c.env, c.req.param('id') || '')
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({ template: publicRow(row), sample_vars: HQ_EMAIL_SAMPLE_VARS })
})

hqEmailTemplateRoutes.post('/email-templates', async (c) => {
  const user = c.get('user')
  if (!(await canManage(c.env, user))) return c.json({ error: 'forbidden' }, 403)
  await ensureHqEmailTemplates(c.env)
  const body = await c.req.json<any>().catch(() => ({}))
  const name = clean(body.name, 120) || 'New email template'
  const id = uuid()
  const slug = nextCustomSlug(name)
  await c.env.DB.prepare(
    `INSERT INTO hq_email_templates (
       id, slug, name, category, description, is_system, enabled, wrap_letterhead, include_signature,
       subject, preheader, eyebrow, title, body_html, cta_label, cta_url_token, security_note,
       variable_schema_json, sort_order, created_by_user_id, updated_by_user_id
     ) VALUES (?, ?, ?, 'custom', ?, 0, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 300, ?, ?)`,
  ).bind(
    id,
    slug,
    name,
    clean(body.description, 400) || 'Custom HQ email you can insert into compose or send as a branded letter.',
    body.wrap_letterhead === 0 ? 0 : 1,
    body.include_signature ? 1 : 0,
    clean(body.subject, 200) || 'Pinnacle update',
    clean(body.preheader, 200) || '',
    clean(body.eyebrow, 80) || 'Pinnacle',
    clean(body.title, 200) || name,
    clean(body.body_html, 50_000) || '<p>Hi {{first_name}},</p><p></p>',
    clean(body.cta_label, 80) || '',
    clean(body.cta_url_token, 40) || 'action_url',
    clean(body.security_note, 400) || '',
    JSON.stringify(['first_name', 'full_name', 'action_url', 'action_label']),
    user.id,
    user.id,
  ).run()
  const row = await getHqEmailTemplate(c.env, id)
  return c.json({ template: row ? publicRow(row) : null }, 201)
})

hqEmailTemplateRoutes.patch('/email-templates/:id', async (c) => {
  const user = c.get('user')
  if (!(await canManage(c.env, user))) return c.json({ error: 'forbidden' }, 403)
  const row = await getHqEmailTemplate(c.env, c.req.param('id') || '')
  if (!row) return c.json({ error: 'not found' }, 404)
  await snapshotHqEmailTemplate(c.env, row, user.id, 'edit')
  const body = await c.req.json<any>().catch(() => ({}))
  const name = body.name != null ? clean(body.name, 120) || row.name : row.name
  const enabled = row.is_system && ['password_reset', 'account_welcome_client', 'account_welcome_hq'].includes(row.slug)
    ? 1
    : (body.enabled == null ? row.enabled : (body.enabled ? 1 : 0))
  await c.env.DB.prepare(
    `UPDATE hq_email_templates SET
       name = ?, description = ?, enabled = ?, wrap_letterhead = ?, include_signature = ?,
       subject = ?, preheader = ?, eyebrow = ?, title = ?, body_html = ?, cta_label = ?,
       cta_url_token = ?, security_note = ?, updated_by_user_id = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).bind(
    name,
    body.description != null ? clean(body.description, 400) : row.description,
    enabled,
    body.wrap_letterhead == null ? row.wrap_letterhead : (body.wrap_letterhead ? 1 : 0),
    body.include_signature == null ? row.include_signature : (body.include_signature ? 1 : 0),
    body.subject != null ? clean(body.subject, 200) || row.subject : row.subject,
    body.preheader != null ? clean(body.preheader, 200) : row.preheader,
    body.eyebrow != null ? clean(body.eyebrow, 80) : row.eyebrow,
    body.title != null ? clean(body.title, 200) : row.title,
    body.body_html != null ? String(body.body_html).slice(0, 50_000) : row.body_html,
    body.cta_label != null ? clean(body.cta_label, 80) : row.cta_label,
    body.cta_url_token != null ? clean(body.cta_url_token, 40) : row.cta_url_token,
    body.security_note != null ? clean(body.security_note, 400) : row.security_note,
    user.id,
    row.id,
  ).run()
  const next = await getHqEmailTemplate(c.env, row.id)
  return c.json({ template: next ? publicRow(next) : null })
})

hqEmailTemplateRoutes.post('/email-templates/:id/restore', async (c) => {
  const user = c.get('user')
  if (!(await canManage(c.env, user))) return c.json({ error: 'forbidden' }, 403)
  const row = await getHqEmailTemplate(c.env, c.req.param('id') || '')
  if (!row) return c.json({ error: 'not found' }, 404)
  const catalog = hqEmailCatalogBySlug(row.slug)
  if (!catalog) return c.json({ error: 'this template has no system default' }, 400)
  await snapshotHqEmailTemplate(c.env, row, user.id, 'restore default')
  await c.env.DB.prepare(
    `UPDATE hq_email_templates SET
       name = ?, description = ?, subject = ?, preheader = ?, eyebrow = ?, title = ?, body_html = ?,
       cta_label = ?, cta_url_token = ?, security_note = ?, wrap_letterhead = ?, variable_schema_json = ?,
       updated_by_user_id = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).bind(
    catalog.name, catalog.description, catalog.subject, catalog.preheader, catalog.eyebrow, catalog.title,
    catalog.bodyHtml, catalog.ctaLabel || null, catalog.ctaUrlToken || null, catalog.securityNote || null,
    catalog.wrapLetterhead ?? 1, JSON.stringify(catalog.tokens), user.id, row.id,
  ).run()
  const next = await getHqEmailTemplate(c.env, row.id)
  return c.json({ template: next ? publicRow(next) : null })
})

hqEmailTemplateRoutes.post('/email-templates/:id/duplicate', async (c) => {
  const user = c.get('user')
  if (!(await canManage(c.env, user))) return c.json({ error: 'forbidden' }, 403)
  const row = await getHqEmailTemplate(c.env, c.req.param('id') || '')
  if (!row) return c.json({ error: 'not found' }, 404)
  const id = uuid()
  const name = `${row.name} copy`
  await c.env.DB.prepare(
    `INSERT INTO hq_email_templates (
       id, slug, name, category, description, is_system, enabled, wrap_letterhead, include_signature,
       subject, preheader, eyebrow, title, body_html, cta_label, cta_url_token, security_note,
       variable_schema_json, sort_order, created_by_user_id, updated_by_user_id
     ) VALUES (?, ?, ?, 'custom', ?, 0, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 300, ?, ?)`,
  ).bind(
    id, nextCustomSlug(name), name, row.description, row.wrap_letterhead, row.include_signature,
    row.subject, row.preheader, row.eyebrow, row.title, row.body_html, row.cta_label,
    row.cta_url_token, row.security_note, row.variable_schema_json, user.id, user.id,
  ).run()
  const next = await getHqEmailTemplate(c.env, id)
  return c.json({ template: next ? publicRow(next) : null }, 201)
})

hqEmailTemplateRoutes.delete('/email-templates/:id', async (c) => {
  const user = c.get('user')
  if (!(await canManage(c.env, user))) return c.json({ error: 'forbidden' }, 403)
  const row = await getHqEmailTemplate(c.env, c.req.param('id') || '')
  if (!row) return c.json({ error: 'not found' }, 404)
  if (row.is_system) return c.json({ error: 'system templates cannot be deleted; restore the default or turn them off' }, 400)
  await c.env.DB.prepare('DELETE FROM hq_email_templates WHERE id = ?').bind(row.id).run()
  return c.json({ ok: true })
})

hqEmailTemplateRoutes.post('/email-templates/:id/preview', async (c) => {
  const row = await getHqEmailTemplate(c.env, c.req.param('id') || '')
  if (!row) return c.json({ error: 'not found' }, 404)
  const body = await c.req.json<any>().catch(() => ({}))
  const vars = { ...HQ_EMAIL_SAMPLE_VARS, ...(body.vars && typeof body.vars === 'object' ? body.vars : {}) }
  const draft = body.draft && typeof body.draft === 'object' ? { ...row, ...body.draft } : row
  return c.json({ preview: renderHqEmailFromRow(draft, vars), vars })
})

hqEmailTemplateRoutes.post('/email-templates/:id/test', async (c) => {
  const user = c.get('user')
  if (!(await canManage(c.env, user))) return c.json({ error: 'forbidden' }, 403)
  const row = await getHqEmailTemplate(c.env, c.req.param('id') || '')
  if (!row) return c.json({ error: 'not found' }, 404)
  const rendered = renderHqEmailFromRow(row, {
    ...HQ_EMAIL_SAMPLE_VARS,
    first_name: (user.full_name || '').split(/\s+/)[0] || 'there',
    full_name: user.full_name || user.email,
    email: user.email,
  })
  if (rendered.skipped) return c.json({ error: 'this template is turned off' }, 409)
  await sendEmail(c.env, {
    to: user.email,
    subject: `[Test] ${rendered.subject}`,
    html: rendered.html,
    text: rendered.text,
    replyTo: 'orders@pinnaclemanagementventures.com',
    tags: [{ name: 'category', value: 'template_test' }, { name: 'template', value: row.slug.slice(0, 50) }],
  })
  return c.json({ ok: true })
})
