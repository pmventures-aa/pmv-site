import type { Env } from './types'
import { uuid } from './crypto'
import { renderPinnacleEmailLayout } from './emailTemplates/layout'
import {
  HQ_EMAIL_CATALOG,
  HQ_EMAIL_SAMPLE_VARS,
  hqEmailCatalogBySlug,
  hqEmailTextFromHtml,
  mergeHqTemplateHtml,
  mergeHqTemplatePlain,
  slugifyHqEmailName,
  type HqEmailCategory,
} from '../../shared/hqEmailTemplates'

export type HqEmailTemplateRow = {
  id: string
  slug: string
  name: string
  category: HqEmailCategory
  description: string | null
  is_system: number
  enabled: number
  wrap_letterhead: number
  include_signature: number
  subject: string
  preheader: string | null
  eyebrow: string | null
  title: string | null
  body_html: string
  cta_label: string | null
  cta_url_token: string | null
  security_note: string | null
  variable_schema_json: string | null
  sort_order: number
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: string
  updated_at: string
}

export type RenderedHqEmail = {
  subject: string
  html: string
  text: string
  skipped: boolean
}

const SELECT_COLS = `id, slug, name, category, description, is_system, enabled, wrap_letterhead, include_signature,
  subject, preheader, eyebrow, title, body_html, cta_label, cta_url_token, security_note, variable_schema_json,
  sort_order, created_by_user_id, updated_by_user_id, created_at, updated_at`

export function catalogTokens(slug: string): string[] {
  return hqEmailCatalogBySlug(slug)?.tokens || ['first_name']
}

function rowFromCatalog(entry: ReturnType<typeof hqEmailCatalogBySlug>, id: string): Omit<HqEmailTemplateRow, 'created_at' | 'updated_at'> | null {
  if (!entry) return null
  return {
    id,
    slug: entry.slug,
    name: entry.name,
    category: entry.category,
    description: entry.description,
    is_system: 1,
    enabled: 1,
    wrap_letterhead: entry.wrapLetterhead ?? 1,
    include_signature: 0,
    subject: entry.subject,
    preheader: entry.preheader,
    eyebrow: entry.eyebrow,
    title: entry.title,
    body_html: entry.bodyHtml,
    cta_label: entry.ctaLabel || null,
    cta_url_token: entry.ctaUrlToken || null,
    security_note: entry.securityNote || null,
    variable_schema_json: JSON.stringify(entry.tokens),
    sort_order: entry.sortOrder,
    created_by_user_id: null,
    updated_by_user_id: null,
  }
}

export async function ensureHqEmailTemplates(env: Env): Promise<void> {
  try {
    for (const entry of HQ_EMAIL_CATALOG) {
      const existing = await env.DB.prepare('SELECT id FROM hq_email_templates WHERE slug = ?').bind(entry.slug).first()
      if (existing) continue
      const id = uuid()
      const row = rowFromCatalog(entry, id)
      if (!row) continue
      await env.DB.prepare(
        `INSERT INTO hq_email_templates (
           id, slug, name, category, description, is_system, enabled, wrap_letterhead, include_signature,
           subject, preheader, eyebrow, title, body_html, cta_label, cta_url_token, security_note,
           variable_schema_json, sort_order
         ) VALUES (?, ?, ?, ?, ?, 1, 1, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        row.id, row.slug, row.name, row.category, row.description, row.wrap_letterhead,
        row.subject, row.preheader, row.eyebrow, row.title, row.body_html, row.cta_label,
        row.cta_url_token, row.security_note, row.variable_schema_json, row.sort_order,
      ).run()
    }

    const events = await env.DB.prepare(
      `SELECT event_key, label, category, description FROM notification_event_catalog WHERE active = 1`,
    ).all<{ event_key: string; label: string; category: string; description: string | null }>()
    for (const event of events.results || []) {
      const slug = `notify_${event.event_key}`
      const existing = await env.DB.prepare('SELECT id FROM hq_email_templates WHERE slug = ?').bind(slug).first()
      if (existing) continue
      const override = await env.DB.prepare(
        'SELECT subject, preheader, eyebrow, title, body_html, cta_label, enabled FROM notification_template_overrides WHERE event_key = ?',
      ).bind(event.event_key).first<{
        subject: string | null; preheader: string | null; eyebrow: string | null; title: string | null
        body_html: string | null; cta_label: string | null; enabled: number | null
      }>().catch(() => null)
      await env.DB.prepare(
        `INSERT INTO hq_email_templates (
           id, slug, name, category, description, is_system, enabled, wrap_letterhead, include_signature,
           subject, preheader, eyebrow, title, body_html, cta_label, cta_url_token, variable_schema_json, sort_order
         ) VALUES (?, ?, ?, 'notification', ?, 1, ?, 1, 0, ?, ?, ?, ?, ?, NULL, NULL, ?, 200)`,
      ).bind(
        uuid(),
        slug,
        event.label,
        event.description || `Staff notification: ${event.category}`,
        override?.enabled === 0 ? 0 : 1,
        override?.subject || '{{event_subject}}',
        override?.preheader || '{{event_subject}}',
        override?.eyebrow || 'Pinnacle HQ notification',
        override?.title || '{{event_subject}}',
        override?.body_html || '{{event_body}}',
        JSON.stringify(['event_subject', 'event_body', 'first_name']),
      ).run()
    }
  } catch (err) {
    console.error('[hq-email-templates] ensure failed', err)
  }
}

export async function listHqEmailTemplates(env: Env): Promise<HqEmailTemplateRow[]> {
  await ensureHqEmailTemplates(env)
  const res = await env.DB.prepare(
    `SELECT ${SELECT_COLS} FROM hq_email_templates ORDER BY sort_order ASC, name ASC`,
  ).all<HqEmailTemplateRow>()
  return (res.results || []) as HqEmailTemplateRow[]
}

export async function getHqEmailTemplate(env: Env, id: string): Promise<HqEmailTemplateRow | null> {
  await ensureHqEmailTemplates(env)
  return await env.DB.prepare(`SELECT ${SELECT_COLS} FROM hq_email_templates WHERE id = ?`).bind(id).first<HqEmailTemplateRow>()
}

export async function getHqEmailTemplateBySlug(env: Env, slug: string): Promise<HqEmailTemplateRow | null> {
  await ensureHqEmailTemplates(env)
  return await env.DB.prepare(`SELECT ${SELECT_COLS} FROM hq_email_templates WHERE slug = ?`).bind(slug).first<HqEmailTemplateRow>()
}

export function renderHqEmailFromRow(row: {
  enabled: number
  wrap_letterhead: number
  subject: string
  preheader: string | null
  eyebrow: string | null
  title: string | null
  body_html: string
  cta_label: string | null
  cta_url_token: string | null
  security_note: string | null
}, vars: Record<string, string>): RenderedHqEmail {
  if (row.enabled === 0) return { subject: '', html: '', text: '', skipped: true }
  const subject = mergeHqTemplatePlain(row.subject, vars)
  const preheader = mergeHqTemplatePlain(row.preheader || subject, vars)
  const eyebrow = mergeHqTemplatePlain(row.eyebrow || '', vars)
  const title = mergeHqTemplatePlain(row.title || subject, vars)
  const bodyHtml = mergeHqTemplateHtml(row.body_html, vars)
  const ctaLabel = row.cta_label ? mergeHqTemplatePlain(row.cta_label, vars) : ''
  const token = row.cta_url_token || 'action_url'
  const ctaUrl = vars[token] || vars.action_url || ''
  const html = row.wrap_letterhead
    ? renderPinnacleEmailLayout({
      preheader,
      eyebrow: eyebrow || undefined,
      title: title || subject,
      bodyHtml,
      cta: ctaLabel && ctaUrl ? { label: ctaLabel, url: ctaUrl } : undefined,
      securityNote: row.security_note ? mergeHqTemplatePlain(row.security_note, vars) : undefined,
    })
    : bodyHtml
  const textParts = [hqEmailTextFromHtml(bodyHtml)]
  if (ctaLabel && ctaUrl) textParts.push(`${ctaLabel}: ${ctaUrl}`)
  return { subject, html, text: textParts.filter(Boolean).join('\n\n'), skipped: false }
}

export async function renderHqEmailBySlug(env: Env, slug: string, vars: Record<string, string>): Promise<RenderedHqEmail | null> {
  const row = await getHqEmailTemplateBySlug(env, slug)
  if (row) return renderHqEmailFromRow(row, vars)
  const catalog = hqEmailCatalogBySlug(slug)
  if (!catalog) return null
  return renderHqEmailFromRow({
    enabled: 1,
    wrap_letterhead: catalog.wrapLetterhead ?? 1,
    subject: catalog.subject,
    preheader: catalog.preheader,
    eyebrow: catalog.eyebrow,
    title: catalog.title,
    body_html: catalog.bodyHtml,
    cta_label: catalog.ctaLabel || null,
    cta_url_token: catalog.ctaUrlToken || null,
    security_note: catalog.securityNote || null,
  }, vars)
}

export async function renderHqEmailOrFallback(
  env: Env,
  slug: string,
  vars: Record<string, string>,
  fallback: { subject: string; html: string; text: string },
): Promise<{ subject: string; html: string; text: string }> {
  try {
    const stored = await renderHqEmailBySlug(env, slug, vars)
    if (stored && !stored.skipped) return { subject: stored.subject, html: stored.html, text: stored.text }
  } catch (err) {
    console.error('[hq-email-templates] render failed', err)
  }
  return fallback
}

export async function snapshotHqEmailTemplate(env: Env, row: HqEmailTemplateRow, actorUserId: string | null, note?: string): Promise<void> {
  const last = await env.DB.prepare(
    'SELECT MAX(version_number) AS n FROM hq_email_template_versions WHERE template_id = ?',
  ).bind(row.id).first<{ n: number | null }>()
  const version = Number(last?.n || 0) + 1
  await env.DB.prepare(
    `INSERT INTO hq_email_template_versions (id, template_id, version_number, snapshot_json, change_note, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(uuid(), row.id, version, JSON.stringify(row), note || null, actorUserId).run()
}

export function nextCustomSlug(name: string): string {
  return `custom_${slugifyHqEmailName(name)}_${Math.random().toString(36).slice(2, 6)}`
}

export { HQ_EMAIL_SAMPLE_VARS, slugifyHqEmailName }
