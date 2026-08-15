import { CREST_ABSOLUTE_URL, CREST_PATH as SHARED_CREST_PATH, PUBLIC_SITE_URL } from '../../shared/letterhead'
import {
  appendSignature,
  brandedSignatureHtml,
  htmlToPlainText,
  previewSignatureHtml,
  type SignatureKind,
  type SignaturePerson,
} from '../../shared/emailSignatureHtml'
import type { Env, SessionUser } from './types'
import { uuid } from './crypto'

export type { SignatureKind, SignaturePerson }
export {
  appendSignature,
  brandedSignatureHtml,
  htmlToPlainText,
  previewSignatureHtml,
}

export interface EmailSignatureRow {
  id: string
  name: string
  slug: string | null
  kind: SignatureKind
  html: string
  owner_user_id: string | null
  is_default: number
  sort_order: number
  created_at?: string
  updated_at?: string
  person_name?: string | null
  person_email?: string | null
  person_phone?: string | null
  person_title?: string | null
  party_type?: string | null
}

export interface SignatureRosterPerson {
  user_id: string
  full_name: string | null
  email: string
  phone: string | null
  title: string | null
  party_type: string
  signature_id: string | null
  html: string | null
}

export const SITE_URL = PUBLIC_SITE_URL
export const CREST_PATH = SHARED_CREST_PATH
export const CREST_ABSOLUTE = CREST_ABSOLUTE_URL

export function absolutizeSignatureAssets(html: string): string {
  return previewSignatureHtml(html)
    .split(`src="${CREST_PATH}"`).join(`src="${CREST_ABSOLUTE}"`)
    .split(`src='${CREST_PATH}'`).join(`src='${CREST_ABSOLUTE}'`)
}

export async function loadVisibleSignature(env: Env, userId: string, signatureId: string): Promise<EmailSignatureRow | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM email_signatures
     WHERE id = ? AND (owner_user_id IS NULL OR owner_user_id = ?)
     LIMIT 1`,
  ).bind(signatureId, userId).first<EmailSignatureRow>()
  return row || null
}

export async function applySelectedSignature(
  env: Env,
  userId: string,
  bodyHtml: string,
  signatureId: string | null | undefined,
): Promise<{ html: string; text: string }> {
  const id = typeof signatureId === 'string' ? signatureId.trim() : ''
  if (!id || id === 'none') {
    return { html: bodyHtml, text: htmlToPlainText(bodyHtml) }
  }
  const sig = await loadVisibleSignature(env, userId, id)
  const html = appendSignature(bodyHtml, sig?.html ? previewSignatureHtml(sig.html) : '')
  return { html, text: htmlToPlainText(html) }
}

async function upsertShared(
  env: Env,
  row: { id: string; name: string; slug: string; kind: SignatureKind; html: string; isDefault: number; sortOrder: number },
) {
  const existing = await env.DB.prepare(
    `SELECT id, html FROM email_signatures WHERE slug = ? AND owner_user_id IS NULL LIMIT 1`,
  ).bind(row.slug).first<{ id: string; html: string }>()
  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO email_signatures (id, name, slug, kind, html, owner_user_id, is_default, sort_order)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).bind(row.id, row.name, row.slug, row.kind, row.html, row.isDefault, row.sortOrder).run()
    return
  }
  if (!existing.html.includes('pmv-sig:v4')) {
    await env.DB.prepare(
      `UPDATE email_signatures SET html = ?, name = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(row.html, row.name, existing.id).run()
  }
}

export async function ensureSharedSignatures(env: Env): Promise<void> {
  await upsertShared(env, {
    id: 'sig-company',
    name: 'Pinnacle',
    slug: 'company',
    kind: 'company',
    html: brandedSignatureHtml('company'),
    isDefault: 1,
    sortOrder: 10,
  })
  await upsertShared(env, {
    id: 'sig-pmv-support',
    name: 'PMV Support',
    slug: 'pmv-support',
    kind: 'support',
    html: brandedSignatureHtml('support'),
    isDefault: 0,
    sortOrder: 20,
  })
}

export async function ensurePersonalSignature(env: Env, user: Pick<SessionUser, 'id' | 'email' | 'full_name'>): Promise<EmailSignatureRow | null> {
  const existing = await env.DB.prepare(
    `SELECT id, html FROM email_signatures WHERE owner_user_id = ? AND kind = 'personal' LIMIT 1`,
  ).bind(user.id).first<{ id: string; html: string }>()

  const profile = await env.DB.prepare(
    `SELECT u.full_name, u.email, u.phone, tm.title, tm.signature_html
     FROM users u
     LEFT JOIN team_members tm ON tm.user_id = u.id
     WHERE u.id = ?`,
  ).bind(user.id).first<{
    full_name: string | null
    email: string
    phone: string | null
    title: string | null
    signature_html: string | null
  }>()

  const name = (profile?.full_name || user.full_name || '').trim() || user.email
  const letterhead = brandedSignatureHtml('personal', {
    name,
    title: profile?.title,
    email: profile?.email || user.email,
    phone: profile?.phone,
  })

  if (!existing) {
    const html = (profile?.signature_html || '').trim().includes('pmv-sig:v4')
      ? profile!.signature_html!
      : letterhead
    const id = uuid()
    await env.DB.prepare(
      `INSERT INTO email_signatures (id, name, slug, kind, html, owner_user_id, is_default, sort_order)
       VALUES (?, ?, NULL, 'personal', ?, ?, 0, 30)`,
    ).bind(id, name || 'My signature', html, user.id).run()
    return env.DB.prepare(`SELECT * FROM email_signatures WHERE id = ?`).bind(id).first<EmailSignatureRow>()
  }

  if (!existing.html.includes('pmv-sig:v4')) {
    await env.DB.prepare(
      `UPDATE email_signatures SET html = ?, name = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(letterhead, name || 'My signature', existing.id).run()
  }
  return env.DB.prepare(`SELECT * FROM email_signatures WHERE id = ?`).bind(existing.id).first<EmailSignatureRow>()
}

export async function savePersonalLetterhead(
  env: Env,
  userId: string,
  person: SignaturePerson,
): Promise<EmailSignatureRow | null> {
  const name = (person.name || '').trim()
  const html = brandedSignatureHtml('personal', person)
  let existing = await env.DB.prepare(
    `SELECT id FROM email_signatures WHERE owner_user_id = ? AND kind = 'personal' LIMIT 1`,
  ).bind(userId).first<{ id: string }>()
  if (!existing) {
    const profile = await env.DB.prepare(
      `SELECT email, full_name FROM users WHERE id = ?`,
    ).bind(userId).first<{ email: string; full_name: string | null }>()
    if (!profile) return null
    const created = await ensurePersonalSignature(env, { id: userId, email: profile.email, full_name: profile.full_name })
    if (!created) return null
    existing = { id: created.id }
  }
  await env.DB.prepare(
    `UPDATE email_signatures SET name = ?, html = ?, updated_at = datetime('now') WHERE id = ?`,
  ).bind(name || 'My signature', html, existing.id).run()
  await env.DB.prepare(
    `UPDATE team_members SET title = ?, signature_html = ? WHERE user_id = ?`,
  ).bind((person.title || '').trim() || null, html, userId).run()
  return loadSignatureRow(env, existing.id)
}

export async function ensureRosterSignatures(env: Env): Promise<void> {
  await ensureSharedSignatures(env)
  const rows = await env.DB.prepare(
    `SELECT u.id, u.email, u.full_name
     FROM users u
     WHERE u.role IN ('staff', 'admin') AND u.status = 'active'`,
  ).all<{ id: string; email: string; full_name: string | null }>()
  for (const row of rows.results || []) {
    await ensurePersonalSignature(env, row)
  }
}

export async function listSignatureRoster(env: Env): Promise<SignatureRosterPerson[]> {
  await ensureRosterSignatures(env)
  const rows = await env.DB.prepare(
    `SELECT u.id AS user_id, u.full_name, u.email, u.phone,
            COALESCE(tm.title, '') AS title,
            COALESCE(tm.party_type, 'employee') AS party_type,
            s.id AS signature_id, s.html
     FROM users u
     LEFT JOIN team_members tm ON tm.user_id = u.id
     LEFT JOIN email_signatures s ON s.owner_user_id = u.id AND s.kind = 'personal'
     WHERE u.role IN ('staff', 'admin') AND u.status = 'active'
     ORDER BY CASE WHEN COALESCE(tm.party_type, 'employee') = 'vendor' THEN 1 ELSE 0 END, u.full_name, u.email`,
  ).all<SignatureRosterPerson>()
  return (rows.results as SignatureRosterPerson[]) || []
}

const SIGNATURE_LIST_SQL = `SELECT s.*,
       u.full_name AS person_name,
       u.email AS person_email,
       u.phone AS person_phone,
       tm.title AS person_title,
       tm.party_type AS party_type
FROM email_signatures s
LEFT JOIN users u ON u.id = s.owner_user_id
LEFT JOIN team_members tm ON tm.user_id = s.owner_user_id`

export async function listSignaturesForUser(env: Env, user: SessionUser): Promise<EmailSignatureRow[]> {
  await ensureSharedSignatures(env)
  await ensurePersonalSignature(env, user)
  const rows = await env.DB.prepare(
    `${SIGNATURE_LIST_SQL}
     WHERE s.owner_user_id IS NULL OR s.owner_user_id = ?
     ORDER BY s.sort_order ASC, s.name ASC`,
  ).bind(user.id).all<EmailSignatureRow>()
  return (rows.results as EmailSignatureRow[]) || []
}

export async function loadSignatureRow(env: Env, id: string): Promise<EmailSignatureRow | null> {
  return env.DB.prepare(
    `${SIGNATURE_LIST_SQL} WHERE s.id = ? LIMIT 1`,
  ).bind(id).first<EmailSignatureRow>()
}

export function letterheadTemplates(user: SessionUser, person?: SignaturePerson): Record<'company' | 'support' | 'personal', string> {
  return {
    company: brandedSignatureHtml('company'),
    support: brandedSignatureHtml('support'),
    personal: brandedSignatureHtml('personal', person || { name: user.full_name, email: user.email }),
  }
}
