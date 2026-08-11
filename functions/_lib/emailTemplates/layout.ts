import { escapeHtml } from '../email'

export interface EmailCta {
  label: string
  url: string
}

export interface EmailLayoutInput {
  preheader: string
  eyebrow?: string
  title: string
  bodyHtml: string
  cta?: EmailCta
  securityNote?: string
}

const SITE_URL = 'https://www.pinnaclemanagementventures.com'
const LOGO_URL = `${SITE_URL}/logo-crest-transparent.png`
const SUPPORT_PHONE = '(561) 388-7879'

export function renderPinnacleEmailLayout(input: EmailLayoutInput): string {
  const preheader = escapeHtml(input.preheader)
  const eyebrow = input.eyebrow ? escapeHtml(input.eyebrow) : ''
  const title = escapeHtml(input.title)
  const cta = input.cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 14px"><tr><td bgcolor="#d7b56d" style="border-radius:7px"><a href="${escapeHtml(input.cta.url)}" style="display:inline-block;padding:14px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:20px;color:#07111f;text-decoration:none;border-radius:7px">${escapeHtml(input.cta.label)}</a></td></tr></table>
       <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#738197">Button not working? Copy and paste this link into your browser:<br><a href="${escapeHtml(input.cta.url)}" style="color:#b89653;word-break:break-all">${escapeHtml(input.cta.url)}</a></p>`
    : ''
  const security = input.securityNote
    ? `<tr><td style="padding:0 34px 30px"><div style="border-top:1px solid #e4e8ee;padding-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6f7784"><strong style="color:#293546">Account security:</strong> ${escapeHtml(input.securityNote)}</div></td></tr>`
    : ''

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#07111f">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#07111f">
    <tr><td align="center" style="padding:30px 14px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px">
        <tr><td align="center" style="padding:4px 0 22px">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 10px"><tr><td bgcolor="#fffefa" style="width:72px;height:72px;border-radius:12px;border:1px solid #e7e2d8" align="center" valign="middle"><img src="${LOGO_URL}" width="58" height="58" alt="Pinnacle Management Ventures" style="display:block;width:58px;height:58px;object-fit:contain;margin:0 auto"></td></tr></table>
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:24px;color:#ffffff;letter-spacing:.2px">Pinnacle Management Ventures</div>
          <div style="margin-top:5px;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;letter-spacing:1.8px;text-transform:uppercase;color:#d7b56d">Professional support. One call away.</div>
        </td></tr>
        <tr><td bgcolor="#ffffff" style="border-radius:12px;overflow:hidden">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr><td style="height:5px;background:#d7b56d;font-size:0;line-height:0">&nbsp;</td></tr>
            <tr><td style="padding:34px 34px 10px">
              ${eyebrow ? `<div style="margin-bottom:10px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;line-height:14px;letter-spacing:1.5px;text-transform:uppercase;color:#9a7838">${eyebrow}</div>` : ''}
              <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:500;line-height:38px;color:#0b1728">${title}</h1>
            </td></tr>
            <tr><td style="padding:12px 34px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#344153">
              ${input.bodyHtml}
              ${cta}
            </td></tr>
            ${security}
          </table>
        </td></tr>
        <tr><td align="center" style="padding:22px 18px 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:18px;color:#8793a5">
          <strong style="color:#c8d0dc">Pinnacle Management Ventures</strong><br>
          Professional Services &amp; Business Consulting<br>
          <a href="tel:+15613887879" style="color:#d7b56d;text-decoration:none">${SUPPORT_PHONE}</a> &nbsp;·&nbsp; <a href="${SITE_URL}" style="color:#d7b56d;text-decoration:none">pinnaclemanagementventures.com</a><br>
          This is a transactional account message from Pinnacle Management Ventures.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
