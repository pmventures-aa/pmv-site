import { Hono } from 'hono'
import type { AppEnv, SessionUser } from '../types'
import { uuid, hashPassword } from '../crypto'
import { createSession, sessionCookie } from '../session'
import { getInviteByToken } from '../invites'
import { logAudit, actorIp, actorUserAgent } from '../auditLog'

export const invitationPublicRoutes = new Hono<AppEnv>()

function clean(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

invitationPublicRoutes.get('/invite/:token', async (c) => {
  const token = c.req.param('token') || ''
  const invite = await getInviteByToken(c.env, token)
  if (!invite) return c.json({ error: 'invitation not found' }, 404)

  let clientName: string | null = null
  if (invite.client_user_id) {
    const row = await c.env.DB.prepare(
      `SELECT COALESCE(cp.business_name, u.full_name, u.email) AS name
       FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id
       WHERE u.id = ?`,
    ).bind(invite.client_user_id).first<{ name: string | null }>()
    clientName = row?.name || null
  }

  let metadata: Record<string, unknown> = {}
  try { metadata = JSON.parse(invite.metadata_json || '{}') as Record<string, unknown> } catch { metadata = {} }

  let roleName: string | null = null
  if (invite.role_definition_id) {
    const role = await c.env.DB.prepare('SELECT name FROM role_definitions WHERE id = ?').bind(invite.role_definition_id).first<{ name: string }>()
    roleName = role?.name || null
  }

  return c.json({
    invite: {
      id: invite.id,
      invite_type: invite.invite_type,
      email: invite.email,
      full_name: invite.full_name,
      status: invite.status,
      expires_at: invite.expires_at,
      client_name: clientName,
      role_name: roleName,
      metadata,
    },
  })
})

invitationPublicRoutes.post('/invite/:token/accept-trusted', async (c) => {
  const token = c.req.param('token') || ''
  const invite = await getInviteByToken(c.env, token)
  if (!invite || invite.invite_type !== 'trusted_contact') return c.json({ error: 'trusted contact invitation not found' }, 404)
  if (invite.status !== 'pending') return c.json({ error: `this invitation is ${invite.status}` }, 400)
  if (!invite.client_user_id) return c.json({ error: 'invalid trusted contact invitation' }, 400)

  type Body = { full_name?: string; password?: string }
  const body = await c.req.json<Body>().catch(() => ({} as Body))
  const fullName = clean(body.full_name || invite.full_name, 160)
  const password = body.password || ''
  if (!fullName) return c.json({ error: 'full name is required' }, 400)
  if (password.length < 10) return c.json({ error: 'password must be at least 10 characters' }, 400)

  const existing = await c.env.DB.prepare('SELECT id, role, status FROM users WHERE email = ?').bind(invite.email).first<{ id: string; role: string; status: string }>()
  if (existing && (existing.role !== 'trusted_contact' || existing.status !== 'active')) {
    return c.json({ error: 'that email already belongs to another Pinnacle account' }, 409)
  }

  const userId = existing?.id || uuid()
  const passwordHash = await hashPassword(password, c.env.SESSION_SECRET)
  if (existing) {
    await c.env.DB.prepare("UPDATE users SET full_name = ?, password_hash = ?, status = 'active' WHERE id = ?").bind(fullName, passwordHash, userId).run()
  } else {
    await c.env.DB.prepare(
      `INSERT INTO users(id,email,password_hash,role,full_name,two_factor_enabled,status)
       VALUES(?,?,?,'trusted_contact',?,0,'active')`,
    ).bind(userId, invite.email, passwordHash, fullName).run()
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE trusted_contacts
       SET contact_user_id = ?, full_name = ?, status = 'active', accepted_at = datetime('now'), updated_at = datetime('now')
       WHERE invite_id = ? AND client_user_id = ?`,
    ).bind(userId, fullName, invite.id, invite.client_user_id),
    c.env.DB.prepare(
      `UPDATE access_invites
       SET status = 'accepted', accepted_by_user_id = ?, accepted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
    ).bind(userId, invite.id),
  ])

  const sessionUser: SessionUser = { id: userId, email: invite.email, role: 'trusted_contact', full_name: fullName }
  const session = await createSession(c.env, sessionUser)
  c.header('Set-Cookie', sessionCookie(session))
  await logAudit(c.env, {
    actorUserId: userId,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    action: 'record_created',
    entityType: 'trusted_contact',
    entityId: invite.id,
    after: { client_user_id: invite.client_user_id, email: invite.email },
  })
  return c.json({ ok: true, user: sessionUser })
})

invitationPublicRoutes.post('/invite/:token/accept-staff', async (c) => {
  const token = c.req.param('token') || ''
  const invite = await getInviteByToken(c.env, token)
  if (!invite || invite.invite_type !== 'staff' || invite.status !== 'pending') {
    return c.json({ error: 'staff invitation is invalid or expired' }, 400)
  }

  type Body = { full_name?: string; password?: string }
  const body = await c.req.json<Body>().catch(() => ({} as Body))
  const fullName = clean(body.full_name || invite.full_name, 160)
  const password = body.password || ''
  if (!fullName || password.length < 10) return c.json({ error: 'name and a 10+ character password are required' }, 400)

  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(invite.email).first()
  if (exists) return c.json({ error: 'an account with that email already exists' }, 409)

  const userId = uuid()
  const passwordHash = await hashPassword(password, c.env.SESSION_SECRET)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users(id,email,password_hash,role,full_name,two_factor_enabled,status)
       VALUES(?,?,?,'staff',?,0,'active')`,
    ).bind(userId, invite.email, passwordHash, fullName),
    c.env.DB.prepare(
      `INSERT INTO team_members(id,user_id,staff_role,title,party_type,role_definition_id)
       VALUES(?,?,'support_specialist',?,'employee',?)`,
    ).bind(uuid(), userId, fullName, invite.role_definition_id),
    c.env.DB.prepare(
      `UPDATE access_invites
       SET status = 'accepted', accepted_by_user_id = ?, accepted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
    ).bind(userId, invite.id),
  ])

  const sessionUser: SessionUser = { id: userId, email: invite.email, role: 'staff', full_name: fullName }
  const session = await createSession(c.env, sessionUser)
  c.header('Set-Cookie', sessionCookie(session))
  return c.json({ ok: true, user: sessionUser })
})
