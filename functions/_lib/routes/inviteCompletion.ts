import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getInviteByToken } from '../invites'

export const inviteCompletionRoutes = new Hono<AppEnv>()

inviteCompletionRoutes.post('/invite/:token/complete-existing', async (c) => {
  const invite = await getInviteByToken(c.env, c.req.param('token') || '')
  if (!invite) return c.json({ error: 'invitation not found' }, 404)
  if (invite.status !== 'pending') return c.json({ ok: invite.status === 'accepted', status: invite.status })
  if (!['vendor', 'client'].includes(invite.invite_type)) return c.json({ error: 'this invitation uses a different acceptance flow' }, 400)

  const user = await c.env.DB.prepare('SELECT id, email, role, status FROM users WHERE email = ?').bind(invite.email).first<any>()
  if (!user) return c.json({ error: 'complete account signup first' }, 409)
  if (invite.invite_type === 'vendor' && user.role !== 'staff') return c.json({ error: 'vendor account does not match invitation' }, 409)
  if (invite.invite_type === 'client' && user.role !== 'client') return c.json({ error: 'client account does not match invitation' }, 409)

  await c.env.DB.prepare(
    `UPDATE access_invites SET status='accepted', accepted_by_user_id=?, accepted_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
  ).bind(user.id, invite.id).run()
  return c.json({ ok: true, status: 'accepted' })
})
