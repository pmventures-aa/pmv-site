import { Hono } from 'hono'
import type { AppEnv, SessionUser } from '../types'
import { requireOwner, requireStaff } from '../mid'
import { requireNamedPermission } from '../capabilities'
import { createInvite, rotateInviteToken, sendInviteEmail, type InviteType } from '../invites'
import { logAudit, actorIp, actorUserAgent } from '../auditLog'
import { uuid } from '../crypto'

export const invitationAdminRoutes = new Hono<AppEnv>()
export const roleAdminRoutes = new Hono<AppEnv>()

function clean(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}
function normEmail(value: unknown): string {
  return clean(value, 254).toLowerCase()
}
async function isOwner(c: { env: AppEnv['Bindings'] }, user: SessionUser): Promise<boolean> {
  if (user.role !== 'admin') return false
  const row = await c.env.DB.prepare('SELECT is_owner FROM team_members WHERE user_id = ?').bind(user.id).first<{ is_owner: number }>()
  return !!row?.is_owner
}

invitationAdminRoutes.get('/invitations', requireStaff, requireNamedPermission('manage_invitations'), async (c) => {
  await c.env.DB.prepare(
    `UPDATE access_invites SET status = 'expired', updated_at = datetime('now')
     WHERE status = 'pending' AND expires_at <= datetime('now')`,
  ).run()
  const rows = await c.env.DB.prepare(
    `SELECT ai.*,inviter.full_name inviter_name,rd.name role_name,
            COALESCE(cp.business_name,client.full_name,client.email) client_name
     FROM access_invites ai
     LEFT JOIN users inviter ON inviter.id = ai.invited_by_user_id
     LEFT JOIN role_definitions rd ON rd.id = ai.role_definition_id
     LEFT JOIN users client ON client.id = ai.client_user_id
     LEFT JOIN client_profiles cp ON cp.user_id = ai.client_user_id
     ORDER BY ai.created_at DESC LIMIT 500`,
  ).all()
  return c.json({ invitations: rows.results || [], can_invite_staff: await isOwner(c, c.get('user')) })
})

// Role names are safe for an invitation manager to see, but only the Owner can
// create/edit roles or use one to provision a new staff identity.
invitationAdminRoutes.get('/invitation-role-options', requireStaff, requireNamedPermission('manage_invitations'), async (c) => {
  if (!(await isOwner(c, c.get('user')))) return c.json({ roles: [] })
  const rows = await c.env.DB.prepare(
    `SELECT id,name,party_type FROM role_definitions WHERE party_type IN ('employee','either') ORDER BY name`,
  ).all()
  return c.json({ roles: rows.results || [] })
})

invitationAdminRoutes.post('/invitations', requireStaff, requireNamedPermission('manage_invitations'), async (c) => {
  const actor = c.get('user')
  type Body = {
    invite_type?: string
    email?: string
    full_name?: string
    vendor_category?: string
    company_name?: string
    lead_id?: string
    role_definition_id?: string | null
  }
  const body = await c.req.json<Body>().catch(() => ({} as Body))
  const inviteType = body.invite_type as InviteType
  if (!['vendor', 'client', 'staff'].includes(inviteType)) return c.json({ error: 'invite_type must be vendor, client, or staff' }, 400)
  if (inviteType === 'staff' && !(await isOwner(c, actor))) return c.json({ error: 'only the Pinnacle Owner can invite staff accounts' }, 403)

  const email = normEmail(body.email)
  if (!email || !email.includes('@')) return c.json({ error: 'valid email required' }, 400)
  const fullName = clean(body.full_name, 160)
  const roleDefinitionId = clean(body.role_definition_id, 80) || null
  if (inviteType === 'staff' && !roleDefinitionId) return c.json({ error: 'staff invitations require a role template' }, 400)
  if (roleDefinitionId) {
    const role = await c.env.DB.prepare('SELECT id,party_type FROM role_definitions WHERE id = ?').bind(roleDefinitionId).first<{ id: string; party_type: string }>()
    if (!role) return c.json({ error: 'role template not found' }, 404)
    if (inviteType === 'staff' && !['employee', 'either'].includes(role.party_type)) return c.json({ error: 'choose an employee role for a staff invitation' }, 400)
  }

  const metadata = {
    vendor_category: clean(body.vendor_category, 120) || undefined,
    company_name: clean(body.company_name, 200) || undefined,
    lead_id: clean(body.lead_id, 120) || undefined,
  }
  const invite = await createInvite(c.env, {
    inviteType,
    email,
    fullName,
    roleDefinitionId,
    invitedByUserId: actor.id,
    metadata,
  })

  let emailStatus = 'sent'
  let emailError: string | null = null
  try {
    await sendInviteEmail(c.env, { id: invite.id, invite_type: inviteType, email, full_name: fullName || null }, invite.token, invite.expiresAt)
  } catch (err) {
    emailStatus = 'failed'
    emailError = err instanceof Error ? err.message : 'email failed'
  }

  await logAudit(c.env, {
    actorUserId: actor.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    action: 'record_created',
    entityType: 'access_invite',
    entityId: invite.id,
    after: { type: inviteType, email, expires_at: invite.expiresAt, lead_id: metadata.lead_id },
  })
  return c.json({ ok: true, id: invite.id, expires_at: invite.expiresAt, email_status: emailStatus, email_error: emailError }, 201)
})

invitationAdminRoutes.post('/invitations/:id/resend', requireStaff, requireNamedPermission('manage_invitations'), async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM access_invites WHERE id = ?').bind(c.req.param('id') || '').first<any>()
  if (!row) return c.json({ error: 'invitation not found' }, 404)
  if (row.invite_type === 'staff' && !(await isOwner(c, c.get('user')))) return c.json({ error: 'only the Pinnacle Owner can manage staff invitations' }, 403)
  if (row.status === 'accepted') return c.json({ error: 'accepted invitations cannot be resent' }, 400)
  const rotated = await rotateInviteToken(c.env, row.id)
  await sendInviteEmail(c.env, row, rotated.token, rotated.expiresAt)
  return c.json({ ok: true, expires_at: rotated.expiresAt })
})

invitationAdminRoutes.post('/invitations/:id/revoke', requireStaff, requireNamedPermission('manage_invitations'), async (c) => {
  const row = await c.env.DB.prepare('SELECT invite_type FROM access_invites WHERE id = ?').bind(c.req.param('id') || '').first<{ invite_type: string }>()
  if (!row) return c.json({ error: 'invitation not found' }, 404)
  if (row.invite_type === 'staff' && !(await isOwner(c, c.get('user')))) return c.json({ error: 'only the Pinnacle Owner can manage staff invitations' }, 403)
  await c.env.DB.prepare(
    `UPDATE access_invites SET status = 'revoked', revoked_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND status != 'accepted'`,
  ).bind(c.req.param('id') || '').run()
  return c.json({ ok: true })
})

// Role definitions and the permission catalog are Owner-controlled. A role may
// grant operational permissions to staff, but nobody can grant Owner authority
// through this system.
roleAdminRoutes.get('/permissions', requireOwner, async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM permission_catalog ORDER BY category,label').all()
  return c.json({ permissions: rows.results || [] })
})

roleAdminRoutes.get('/roles', requireOwner, async (c) => {
  const roles = await c.env.DB.prepare(
    `SELECT rd.*,COUNT(DISTINCT tm.user_id) assigned_users
     FROM role_definitions rd LEFT JOIN team_members tm ON tm.role_definition_id = rd.id
     GROUP BY rd.id ORDER BY rd.name`,
  ).all<any>()
  const grants = await c.env.DB.prepare(
    `SELECT role_id,permission_key FROM role_permissions WHERE granted = 1 ORDER BY permission_key`,
  ).all<{ role_id: string; permission_key: string }>()
  const byRole = new Map<string, string[]>()
  for (const grant of grants.results || []) {
    if (!byRole.has(grant.role_id)) byRole.set(grant.role_id, [])
    byRole.get(grant.role_id)!.push(grant.permission_key)
  }
  return c.json({ roles: (roles.results || []).map((role: any) => ({ ...role, permissions: byRole.get(role.id) || [] })) })
})

roleAdminRoutes.post('/roles', requireOwner, async (c) => {
  const actor = c.get('user')
  type Body = { name?: string; role_key?: string; description?: string; party_type?: string; permissions?: string[] }
  const body = await c.req.json<Body>().catch(() => ({} as Body))
  const name = clean(body.name, 120)
  if (!name) return c.json({ error: 'role name required' }, 400)
  const generatedKey = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const roleKey = clean(body.role_key || generatedKey, 80)
  const partyType = ['employee', 'vendor', 'either'].includes(body.party_type || '') ? body.party_type! : 'employee'
  const permissionKeys = Array.isArray(body.permissions) ? [...new Set(body.permissions.map((value) => clean(value, 80)).filter(Boolean))] : []
  const id = uuid()

  const statements = [
    c.env.DB.prepare(
      `INSERT INTO role_definitions(id,role_key,name,description,party_type,is_system,created_by_user_id)
       VALUES(?,?,?,?,?,0,?)`,
    ).bind(id, roleKey, name, clean(body.description, 500) || null, partyType, actor.id),
  ]
  for (const permission of permissionKeys) {
    statements.push(c.env.DB.prepare(
      `INSERT INTO role_permissions(role_id,permission_key,granted)
       SELECT ?,permission_key,1 FROM permission_catalog WHERE permission_key = ?`,
    ).bind(id, permission))
  }
  await c.env.DB.batch(statements)
  return c.json({ ok: true, id }, 201)
})

roleAdminRoutes.patch('/roles/:id', requireOwner, async (c) => {
  type Body = { name?: string; description?: string; party_type?: string; permissions?: string[] }
  const body = await c.req.json<Body>().catch(() => ({} as Body))
  const id = c.req.param('id') || ''
  const current = await c.env.DB.prepare('SELECT * FROM role_definitions WHERE id = ?').bind(id).first<any>()
  if (!current) return c.json({ error: 'role not found' }, 404)

  const name = clean(body.name, 120) || current.name
  const description = body.description !== undefined ? clean(body.description, 500) || null : current.description
  const partyType = ['employee', 'vendor', 'either'].includes(body.party_type || '') ? body.party_type! : current.party_type
  const permissionKeys = Array.isArray(body.permissions) ? [...new Set(body.permissions.map((value) => clean(value, 80)).filter(Boolean))] : []
  const statements = [
    c.env.DB.prepare(
      `UPDATE role_definitions SET name = ?, description = ?, party_type = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(name, description, partyType, id),
    c.env.DB.prepare('DELETE FROM role_permissions WHERE role_id = ?').bind(id),
  ]
  for (const permission of permissionKeys) {
    statements.push(c.env.DB.prepare(
      `INSERT INTO role_permissions(role_id,permission_key,granted)
       SELECT ?,permission_key,1 FROM permission_catalog WHERE permission_key = ?`,
    ).bind(id, permission))
  }
  await c.env.DB.batch(statements)
  return c.json({ ok: true })
})

roleAdminRoutes.patch('/users/:id/role-definition', requireOwner, async (c) => {
  type Body = { role_definition_id?: string | null }
  const body = await c.req.json<Body>().catch(() => ({} as Body))
  const userId = c.req.param('id') || ''
  const user = await c.env.DB.prepare(
    `SELECT u.id,u.role,tm.id team_member_id,tm.party_type FROM users u
     LEFT JOIN team_members tm ON tm.user_id = u.id WHERE u.id = ?`,
  ).bind(userId).first<{ id: string; role: string; team_member_id: string | null; party_type: string | null }>()
  if (!user || !['staff', 'admin'].includes(user.role)) return c.json({ error: 'staff account not found' }, 404)
  if (!user.team_member_id) return c.json({ error: 'team profile not found' }, 404)

  const roleDefinitionId = clean(body.role_definition_id, 80) || null
  if (roleDefinitionId) {
    const role = await c.env.DB.prepare('SELECT id,party_type FROM role_definitions WHERE id = ?').bind(roleDefinitionId).first<{ id: string; party_type: string }>()
    if (!role) return c.json({ error: 'role not found' }, 404)
    if (role.party_type !== 'either' && role.party_type !== (user.party_type || 'employee')) {
      return c.json({ error: `this role is for ${role.party_type} accounts` }, 400)
    }
  }
  await c.env.DB.prepare('UPDATE team_members SET role_definition_id = ? WHERE user_id = ?').bind(roleDefinitionId, userId).run()
  return c.json({ ok: true })
})
