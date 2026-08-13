import type { Env, SessionUser } from './types'
import { uuid } from './crypto'

export type SignatureKind = 'company' | 'personal' | 'support' | 'custom'

export interface EmailSignatureRow {
  id: string
  name: string
  slug: string | null
  kind: SignatureKind
  html: string
  owner_user_id: string | null
  is_default: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface SignaturePerson {
  name?: string | null
  title?: string | null
  email?: string | null
  phone?: string | null
}

const CREST_URL = 'https://www.pinnaclemanagementventures.com/logo-crest-transparent.png'
const SITE_URL = 'https://www.pinnaclemanagementventures.com'
const FIRM_PHONE = '(561) 388-7879'
const SUPPORT_EMAIL = 'support@pinnaclemanagementventures.com'
const GOLD = '#C8A96B'
const NAVY = '#0F1720'
const MUTED = '#64748B'
const BODY = '#334155'

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function brandedSignatureHtml(kind: SignatureKind, person?: SignaturePerson): string {
  const name = (person?.name || '').trim()
    || (kind === 'support' ? 'PMV Support' : 'Pinnacle Management Ventures')
  const title = (person?.title || '').trim()
    || (kind === 'support' ? 'Client Care' : kind === 'personal' ? 'Pinnacle Management Ventures' : 'Private Client Services')
  const email = (person?.email || '').trim()
    || (kind === 'support' ? SUPPORT_EMAIL : '')
  const phone = (person?.phone || '').trim() || FIRM_PHONE
  const firmLine = kind === 'personal' && name !== 'Pinnacle Management Ventures'
    ? `<p style="margin:2px 0 0;font-size:12px;color:${MUTED};">Pinnacle Management Ventures</p>`
    : ''

  const contactBits = [
    phone ? esc(phone) : '',
    email ? `<a href="mailto:${esc(email)}" style="color:${GOLD};text-decoration:none;">${esc(email)}</a>` : '',
    `<a href="${SITE_URL}" style="color:${GOLD};text-decoration:none;">pinnaclemanagementventures.com</a>`,
  ].filter(Boolean)

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0;border-collapse:collapse;font-family:Georgia,'Times New Roman',Times,serif;">
  <tr>
    <td style="padding:0 16px 0 0;vertical-align:top;border-right:2px solid ${GOLD};">
      <img src="${CREST_URL}" alt="Pinnacle Management Ventures" width="56" height="56" style="display:block;border:0;outline:none;"/>
    </td>
    <td style="padding:2px 0 0 16px;vertical-align:top;">
      <p style="margin:0;font-size:15px;line-height:1.3;font-weight:700;color:${NAVY};letter-spacing:.02em;">${esc(name)}</p>
      <p style="margin:4px 0 0;font-size:11px;line-height:1.4;color:${GOLD};letter-spacing:.14em;text-transform:uppercase;">${esc(title)}</p>
      ${firmLine}
      <p style="margin:10px 0 0;font-size:12px;line-height:1.7;color:${BODY};">${contactBits.join('<br/>')}</p>
    </td>
  </tr>
</table>`
}

export function appendSignature(bodyHtml: string, signatureHtml: string | null | undefined): string {
  const stripped = String(bodyHtml || '').replace(/<div[^>]*data-pmv-signature[\s\S]*$/i, '').trim()
  const sig = String(signatureHtml || '').trim()
  if (!sig) return stripped
  return `${stripped}<div data-pmv-signature="1" style="margin-top:18px">${sig}</div>`
}

export function htmlToPlainText(html: string): string {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
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
  const html = appendSignature(bodyHtml, sig?.html)
  return { html, text: htmlToPlainText(html) }
}

async function insertIfMissing(
  env: Env,
  row: { id: string; name: string; slug: string; kind: SignatureKind; html: string; isDefault: number; sortOrder: number },
) {
  const existing = await env.DB.prepare(
    `SELECT id FROM email_signatures WHERE slug = ? AND owner_user_id IS NULL LIMIT 1`,
  ).bind(row.slug).first()
  if (existing) return
  await env.DB.prepare(
    `INSERT INTO email_signatures (id, name, slug, kind, html, owner_user_id, is_default, sort_order)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).bind(row.id, row.name, row.slug, row.kind, row.html, row.isDefault, row.sortOrder).run()
}

export async function ensureSharedSignatures(env: Env): Promise<void> {
  await insertIfMissing(env, {
    id: 'sig-company',
    name: 'Pinnacle',
    slug: 'company',
    kind: 'company',
    html: brandedSignatureHtml('company'),
    isDefault: 1,
    sortOrder: 10,
  })
  await insertIfMissing(env, {
    id: 'sig-pmv-support',
    name: 'PMV Support',
    slug: 'pmv-support',
    kind: 'support',
    html: brandedSignatureHtml('support'),
    isDefault: 0,
    sortOrder: 20,
  })
}

export async function ensurePersonalSignature(env: Env, user: SessionUser): Promise<void> {
  const existing = await env.DB.prepare(
    `SELECT id FROM email_signatures WHERE owner_user_id = ? AND kind = 'personal' LIMIT 1`,
  ).bind(user.id).first()
  if (existing) return

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
  const html = (profile?.signature_html || '').trim()
    || brandedSignatureHtml('personal', {
      name,
      title: profile?.title,
      email: profile?.email || user.email,
      phone: profile?.phone,
    })

  await env.DB.prepare(
    `INSERT INTO email_signatures (id, name, slug, kind, html, owner_user_id, is_default, sort_order)
     VALUES (?, ?, NULL, 'personal', ?, ?, 0, 30)`,
  ).bind(uuid(), name || 'My signature', html, user.id).run()
}

export async function listSignaturesForUser(env: Env, user: SessionUser): Promise<EmailSignatureRow[]> {
  await ensureSharedSignatures(env)
  await ensurePersonalSignature(env, user)
  const rows = await env.DB.prepare(
    `SELECT * FROM email_signatures
     WHERE owner_user_id IS NULL OR owner_user_id = ?
     ORDER BY sort_order ASC, name ASC`,
  ).bind(user.id).all<EmailSignatureRow>()
  return (rows.results as EmailSignatureRow[]) || []
}
