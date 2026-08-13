import {
  CREST_ABSOLUTE_URL,
  CREST_CID,
  CREST_LETTERHEAD_HEIGHT,
  CREST_LETTERHEAD_WIDTH,
  CREST_PATH,
  FIRM_NAME,
  FIRM_PHONE,
  FIRM_PHONE_TEL,
  FIRM_REGION,
  FIRM_SITE_HOST,
  FIRM_TAGLINE,
  PUBLIC_SITE_URL,
  SUPPORT_EMAIL,
} from './letterhead'

export type SignatureKind = 'company' | 'personal' | 'support' | 'custom'

export interface SignaturePerson {
  name?: string | null
  title?: string | null
  email?: string | null
  phone?: string | null
}

export interface CrestInlineAttachment {
  path: string
  filename: string
  content_type: string
  content_id: string
}

export const SIG_MARK = '<!--pmv-sig:v4-->'

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function previewSignatureHtml(html: string): string {
  return String(html || '')
    .replace(/src=(["'])cid:[^"']+\1/gi, `src=$1${CREST_PATH}$1`)
    .replace(/https?:\/\/[^/"']+\/(logo-crest[^"'\s?]*)/gi, '/$1')
    .replace(/\/logo-crest-transparent\.png/gi, CREST_PATH)
}

export function rewriteCrestToCid(html: string): string {
  return previewSignatureHtml(html)
    .split(`src="${CREST_PATH}"`).join(`src="cid:${CREST_CID}"`)
    .split(`src='${CREST_PATH}'`).join(`src='cid:${CREST_CID}'`)
}

export function crestInlineAttachment(): CrestInlineAttachment {
  return {
    path: CREST_ABSOLUTE_URL,
    filename: 'logo-crest-letterhead.png',
    content_type: 'image/png',
    content_id: CREST_CID,
  }
}

export function withEmbeddedCrest(html: string): { html: string; attachments: CrestInlineAttachment[] } {
  const next = rewriteCrestToCid(html)
  if (!next.includes(`cid:${CREST_CID}`)) return { html, attachments: [] }
  return { html: next, attachments: [crestInlineAttachment()] }
}

function letterheadTable(personHtml: string): string {
  return `${SIG_MARK}
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:580px;border-collapse:collapse;color:#0a1728">
  <tr>
    <td style="padding:0 0 14px">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tr>
          <td valign="middle" style="width:90px;padding:0 16px 0 0">
            <img src="${CREST_PATH}" width="${CREST_LETTERHEAD_WIDTH}" height="${CREST_LETTERHEAD_HEIGHT}" alt="Pinnacle" style="display:block;border:0;outline:none;width:${CREST_LETTERHEAD_WIDTH}px;height:${CREST_LETTERHEAD_HEIGHT}px"/>
          </td>
          <td valign="middle" style="padding:0 12px 0 0">
            <div style="font-family:Georgia,'Times New Roman',Times,serif;font-size:18px;line-height:22px;letter-spacing:.04em;color:#0a1728">${FIRM_NAME}</div>
            <div style="margin-top:5px;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#5b6573">${FIRM_TAGLINE}</div>
          </td>
          <td valign="top" align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:#64748b;white-space:nowrap">
            ${FIRM_REGION}<br/>
            <a href="tel:${FIRM_PHONE_TEL}" style="color:#64748b;text-decoration:none">${FIRM_PHONE}</a><br/>
            <a href="${PUBLIC_SITE_URL}" style="color:#64748b;text-decoration:none">${FIRM_SITE_HOST}</a>
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
    || (kind === 'support' ? 'PMV Support' : kind === 'personal' ? '' : FIRM_NAME)
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
  return `<tr data-pmv-person="1" data-name="${esc(name)}" data-title="${esc(title)}" data-email="${esc(email)}" data-phone="${esc(phone)}"><td style="padding:16px 0 0">${lines.filter(Boolean).join('')}</td></tr>`
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
