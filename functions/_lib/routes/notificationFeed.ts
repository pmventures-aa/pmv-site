import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireUser } from '../mid'

export const notificationFeedRoutes = new Hono<AppEnv>()
notificationFeedRoutes.use('*', requireUser)

// GET /admin/notifications/feed  or  /portal/notifications/feed
// Returns the caller's live notification stream, unread first.
notificationFeedRoutes.get('/notifications/feed', async (c) => {
  const user = c.get('user')
  const onlyUnread = c.req.query('unread') === '1'
  const limit = Math.min(100, Math.max(10, Number(c.req.query('limit')) || 40))
  const whereUnread = onlyUnread ? 'AND read_at IS NULL' : ''
  const rows = await c.env.DB.prepare(
    `SELECT id, kind, subject_type, subject_id, title, body, deep_link_path,
            actor_user_id, read_at, dismissed_at, created_at,
            (SELECT full_name FROM users WHERE id = notification_feed.actor_user_id) actor_name
     FROM notification_feed
     WHERE user_id = ? AND dismissed_at IS NULL ${whereUnread}
     ORDER BY (read_at IS NULL) DESC, created_at DESC
     LIMIT ?`
  ).bind(user.id, limit).all()
  const unreadRow = await c.env.DB.prepare(
    `SELECT COUNT(*) n FROM notification_feed WHERE user_id = ? AND read_at IS NULL AND dismissed_at IS NULL`
  ).bind(user.id).first<{ n: number }>()
  return c.json({
    notifications: (rows.results as any[]) || [],
    unread_count: Number(unreadRow?.n ?? 0),
  })
})

notificationFeedRoutes.post('/notifications/mark-read', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map((v: unknown) => String(v).slice(0, 40)) : []
  if (body?.all) {
    await c.env.DB.prepare(`UPDATE notification_feed SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`).bind(user.id).run()
    return c.json({ ok: true, all: true })
  }
  if (!ids.length) return c.json({ error: 'ids required' }, 400)
  const placeholders = ids.map(() => '?').join(',')
  await c.env.DB.prepare(
    `UPDATE notification_feed SET read_at = datetime('now') WHERE user_id = ? AND id IN (${placeholders}) AND read_at IS NULL`
  ).bind(user.id, ...ids).run()
  return c.json({ ok: true, count: ids.length })
})

notificationFeedRoutes.post('/notifications/dismiss', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map((v: unknown) => String(v).slice(0, 40)) : []
  if (!ids.length) return c.json({ error: 'ids required' }, 400)
  const placeholders = ids.map(() => '?').join(',')
  await c.env.DB.prepare(
    `UPDATE notification_feed SET dismissed_at = datetime('now') WHERE user_id = ? AND id IN (${placeholders})`
  ).bind(user.id, ...ids).run()
  return c.json({ ok: true })
})
