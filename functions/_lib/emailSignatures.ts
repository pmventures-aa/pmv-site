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

export const SITE_URL = 'https://www.pinnaclemanagementventures.com'
export const CREST_PATH = '/logo-crest-transparent.png'
export const CREST_ABSOLUTE = `${SITE_URL}${CREST_PATH}`
const FIRM_PHONE = '(561) 388-7879'
const SUPPORT_EMAIL = 'support@pinnaclemanagementventures.com'
const SIG_MARK = '<!--pmv-sig:v2-->'

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function previewSignatureHtml(html: string): string {
  return String(html || '').replace(/https?:\/\/[^/"']+\/(logo-crest[^"'\s?]*)/gi, '/$1')
}

export function absolutizeSignatureAssets(html: string): string {
  return previewSignatureHtml(html)
    .split(`src="${CREST_PATH}"`).join(`src="${CREST_ABSOLUTE}"`)
    .split(`src='${CREST_PATH}'`).join(`src='${CREST_ABSOLUTE}'`)
}

function letterheadTable(personHtml: string): string {
  return `${SIG_MARK}
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:580px;border-collapse:collapse;color:#0a1728">
  <tr>
    <td style="padding:0 0 14px">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tr>
          <td valign="middle" style="width:72px;padding:0 18px 0 0">
            <img src="${CREST_PATH}" width="64" height="64" alt="Pinnacle Management Ventures" style="display:block;border:0;width:64px;height:64px"/>
          </td>
          <td valign="middle" style="padding:0 12px 0 0">
            <div style="font-family:Georgia,'Times New Roman',Times,serif;font-size:18px;line-height:22px;letter-spacing:.04em;color:#0a1728">Pinnacle Management Ventures</div>
            <div style="margin-top:5px;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#5b6573">Property · Documents · Operations</div>
          </td>
          <td valign="top" align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:#64748b;white-space:nowrap">
            South Florida<br/>
            <a href="tel:+15613887879" style="color:#64748b;text-decoration:none">${FIRM_PHONE}</a><br/>
            <a href="${SITE_URL}" style="color:#64748b;text-decoration:none">pinnaclemanagementventures.com</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="height:1px;line-height:1px;font-size:0;background:#c9c3b4">&nbsp;</td>
  </tr>
  ${personHtml}
</table>`
}

function personBlock(kind: SignatureKind, person?: SignaturePerson): string {
  const name = (person?.name || '').trim()
    || (kind === 'support' ? 'PMV Support' : kind === 'personal' ? '' : 'Pinnacle Management Ventures')
  const title = (person?.title || '').trim()
    || (kind === 'support' ? 'Client Care' : kind === 'company' ? 'Private Client Services' : '')
  const email = (person?.email || '').trim()
    || (kind === 'support' ? SUPPORT_EMAIL : '')
  const phone = (person?.phone || '').trim()
  if (!name && !title && !email) return ''

  const lines = [
    name ? `<div style="font-family:Georgia,'Times New Roman',Times,serif;font-size:15px;line-height:20px;color:#0a1728">${esc(name)}</div>` : '',
    title ? `<div style="margin-top:3px;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#9a7838">${esc(title)}</div>` : '',
  ]
  const contact: string[] = []
  if (phone) contact.push(`<a href="tel:${esc(phone.replace(/[^\d+]/g, ''))}" style="color:#334155;text-decoration:none">${esc(phone)}</a>`)
  if (email) contact.push(`<a href="mailto:${esc(email)}" style="color:#334155;text-decoration:none">${esc(email)}</a>`)
  if (contact.length) {
    lines.push(`<div style="margin-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#334155">${contact.join(' · ')}</div>`)
  }
  return `<tr><td style="padding:16px 0 0">${lines.filter(Boolean).join('')}</td></tr>`
}

export function brandedSignatureHtml(kind: SignatureKind, person?: SignaturePerson): string {
  return letterheadTable(kind === 'company' ? '' : personBlock(kind, person))
}

export function appendSignature(bodyHtml: string, signatureHtml: string | null | undefined): string {
  const stripped = String(bodyHtml || '').replace(/<div[^>]*data-pmv-signature[\s\S]*$/i, '').trim()
  const sig = String(signatureHtml || '').trim()
  if (!sig) return stripped
  return `${stripped}<div data-pmv-signature="1" style="margin-top:28px;padding-top:4px">${sig}</div>`
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
  const html = appendSignature(bodyHtml, sig?.html ? absolutizeSignatureAssets(sig.html) : '')
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
  if (!existing.html.includes('pmv-sig:v2')) {
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

export async function ensurePersonalSignature(env: Env, user: SessionUser): Promise<void> {
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
    const html = (profile?.signature_html || '').trim().includes('pmv-sig:v2')
      ? profile!.signature_html!
      : letterhead
    await env.DB.prepare(
      `INSERT INTO email_signatures (id, name, slug, kind, html, owner_user_id, is_default, sort_order)
       VALUES (?, ?, NULL, 'personal', ?, ?, 0, 30)`,
    ).bind(uuid(), name || 'My signature', html, user.id).run()
    return
  }

  if (!existing.html.includes('pmv-sig:v2')) {
    await env.DB.prepare(
      `UPDATE email_signatures SET html = ?, name = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(letterhead, name || 'My signature', existing.id).run()
  }
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

export function letterheadTemplates(user: SessionUser): Record<'company' | 'support' | 'personal', string> {
  return {
    company: brandedSignatureHtml('company'),
    support: brandedSignatureHtml('support'),
    personal: brandedSignatureHtml('personal', { name: user.full_name, email: user.email }),
  }
}
