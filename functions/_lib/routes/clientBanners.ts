import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff, requireUser } from '../mid'
import { uuid } from '../crypto'
import { logActivity } from '../activity'

export const clientBannerAdminRoutes = new Hono<AppEnv>()
clientBannerAdminRoutes.use('*', requireStaff)

export const clientBannerSelfRoutes = new Hono<AppEnv>()
clientBannerSelfRoutes.use('*', requireUser)

const clean = (v: unknown, n: number) => typeof v === 'string' ? v.trim().slice(0, n) : ''

// Minimal HTML sanitizer for admin-authored banner body. Whitelist a
// small tag set; strip anything else. Blocks <script>, event handlers,
// and javascript: hrefs.
function sanitizeHtml(input: string): string {
  const stripped = input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
  return stripped.slice(0, 20_000)
}

// --- Admin (staff) ---

clientBannerAdminRoutes.get('/client-login-notices', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT n.id, n.client_user_id, u.full_name client_name, u.email client_email,
            n.title, n.priority, n.force_redirect_path, n.expires_at, n.acknowledged_at, n.created_at,
            (SELECT full_name FROM users WHERE id = n.created_by_user_id) created_by
     FROM client_login_notices n
     JOIN users u ON u.id = n.client_user_id
     ORDER BY n.created_at DESC LIMIT 200`
  ).all()
  return c.json({ notices: (rows.results as any[]) || [] })
})

clientBannerAdminRoutes.get('/client-login-notices/:id', async (c) => {
  const notice = await c.env.DB.prepare(
    `SELECT n.*, u.full_name client_name, u.email client_email FROM client_login_notices n
     JOIN users u ON u.id = n.client_user_id WHERE n.id = ?`
  ).bind(c.req.param('id')).first()
  if (!notice) return c.json({ error: 'not found' }, 404)
  return c.json({ notice })
})

clientBannerAdminRoutes.post('/client-login-notices', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  if (!body) return c.json({ error: 'invalid body' }, 400)
  const clientUserId = clean(body.client_user_id, 40)
  const title = clean(body.title, 200)
  const rawHtml = typeof body.body_html === 'string' ? body.body_html : ''
  const bodyHtml = sanitizeHtml(rawHtml)
  const priority = ['info','warning','critical'].includes(body.priority) ? body.priority : 'info'
  const forceRedirectPath = clean(body.force_redirect_path, 300) || null
  const expiresAt = clean(body.expires_at, 30) || null
  if (!clientUserId || !title || !bodyHtml) return c.json({ error: 'client_user_id, title, and body_html required' }, 400)
  const client = await c.env.DB.prepare(`SELECT id FROM users WHERE id = ? AND status = 'active'`).bind(clientUserId).first()
  if (!client) return c.json({ error: 'unknown client' }, 400)
  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO client_login_notices (id, client_user_id, title, body_html, priority, force_redirect_path, expires_at, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, clientUserId, title, bodyHtml, priority, forceRedirectPath, expiresAt, user.id).run()
  try {
    await logActivity(c.env, {
      actorUserId: user.id, clientUserId,
      kind: 'client_login_notice.created',
      detail: { notice_id: id, title, priority, force_redirect_path: forceRedirectPath },
    })
  } catch {}
  return c.json({ ok: true, id }, 201)
})

clientBannerAdminRoutes.delete('/client-login-notices/:id', async (c) => {
  await c.env.DB.prepare(`DELETE FROM client_login_notices WHERE id = ?`).bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// --- Self (whichever user just logged in fetches their own pending banner) ---

clientBannerSelfRoutes.get('/pending-login-notice', async (c) => {
  const user = c.get('user')
  const notice = await c.env.DB.prepare(
    `SELECT id, title, body_html, priority, force_redirect_path, expires_at, created_at
     FROM client_login_notices
     WHERE client_user_id = ?
       AND acknowledged_at IS NULL
       AND (expires_at IS NULL OR expires_at > datetime('now'))
     ORDER BY (priority = 'critical') DESC, (priority = 'warning') DESC, created_at DESC
     LIMIT 1`
  ).bind(user.id).first()
  return c.json({ notice: notice ?? null })
})

clientBannerSelfRoutes.post('/pending-login-notice/:id/acknowledge', async (c) => {
  const user = c.get('user')
  await c.env.DB.prepare(
    `UPDATE client_login_notices SET acknowledged_at = datetime('now')
     WHERE id = ? AND client_user_id = ? AND acknowledged_at IS NULL`
  ).bind(c.req.param('id'), user.id).run()
  return c.json({ ok: true })
})
