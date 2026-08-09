import { Hono } from 'hono'
import type { AppEnv } from '../types'

export const unsubscribeRoutes = new Hono<AppEnv>()

function page(title: string, body: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Pinnacle Management Ventures</title></head><body style="margin:0;background:#07111f;color:#f8fafc;font-family:Arial,sans-serif"><main style="max-width:620px;margin:0 auto;padding:72px 24px"><div style="border:1px solid #263244;background:#0b1728;padding:32px"><p style="margin:0 0 10px;color:#d4a74f;font-size:12px;letter-spacing:.16em;text-transform:uppercase">Pinnacle Management Ventures</p><h1 style="margin:0 0 14px;font-size:28px">${title}</h1><p style="margin:0;color:#b9c2cf;line-height:1.7">${body}</p></div></main></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

unsubscribeRoutes.get('/unsubscribe/:token', async (c) => {
  const token = c.req.param('token') || ''
  const row = await c.env.DB.prepare('SELECT token, email, used_at FROM email_unsubscribe_tokens WHERE token = ?').bind(token).first<{ token: string; email: string; used_at: string | null }>()
  if (!row) return page('Link not recognized', 'This unsubscribe link is invalid or has expired. Contact Pinnacle if you need help changing your communication preferences.', 404)

  if (!row.used_at) {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE email_unsubscribe_tokens SET used_at = datetime('now') WHERE token = ?").bind(token),
      c.env.DB.prepare("UPDATE contact_inquiries SET email_status = 'unsubscribed', email_unsubscribed_at = datetime('now'), updated_at = datetime('now') WHERE lower(email) = lower(?)").bind(row.email),
      c.env.DB.prepare("UPDATE users SET marketing_email_status = 'unsubscribed', marketing_unsubscribed_at = datetime('now') WHERE lower(email) = lower(?)").bind(row.email),
    ])
  }

  return page('You’re unsubscribed', 'This email address will no longer receive marketing emails from Pinnacle Management Ventures. Account, service, billing, or other operational messages may still be sent when they are needed for an active relationship.')
})
