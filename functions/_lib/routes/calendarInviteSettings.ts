import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireUser } from '../mid'

// The entire settings surface for calendar invites: a single per-user
// toggle (default ON) available to any authenticated user (client or
// vendor). No connection flow, no provider selection.
export const calendarInviteSettingsRoutes = new Hono<AppEnv>()

calendarInviteSettingsRoutes.get('/me/calendar-invites', requireUser, async (c) => {
  const user = c.get('user')
  const row = await c.env.DB.prepare('SELECT calendar_invites_enabled FROM users WHERE id = ?')
    .bind(user.id).first<{ calendar_invites_enabled: number }>()
  return c.json({ enabled: Number(row?.calendar_invites_enabled ?? 1) === 1 })
})

calendarInviteSettingsRoutes.patch('/me/calendar-invites', requireUser, async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({})) as { enabled?: boolean }
  const enabled = body.enabled === false ? 0 : 1
  await c.env.DB.prepare('UPDATE users SET calendar_invites_enabled = ? WHERE id = ?')
    .bind(enabled, user.id).run()
  return c.json({ enabled: enabled === 1 })
})
