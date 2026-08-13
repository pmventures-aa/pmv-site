import { Hono } from 'hono'
import type { AppEnv, SessionUser } from '../types'
import { requireAdmin, requireOwner, requireStaff } from '../mid'
import { NAMED_PERMISSIONS, namedPermissionColumn, requireNamedPermission, resolveNamedPermission } from '../capabilities'
import { createInvite, rotateInviteToken, sendInviteEmail, recordInviteEmailResult, type InviteType } from '../invites'
import { stageVendorProfile, VendorInviteConflict } from '../vendorStaging'
import { logAudit, actorIp, actorUserAgent } from '../auditLog'
import { uuid } from '../crypto'
import { toDisplayCase } from '../../../shared/displayCase'

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
     WHERE status = 'pending' AND datetime(expires_at) <= datetime('now')`,
  ).run()
  const rows = await c.env.DB.prepare(
    `SELECT ai.*,inviter.full_name inviter_name,rd.name role_name,
            COALESCE(cp.business_name,client.full_name,client.email) client_name,
            staged.full_name staged_user_name, staged.status staged_user_status, staged.email staged_user_email
     FROM access_invites ai
     LEFT JOIN users inviter ON inviter.id = ai.invited_by_user_id
     LEFT JOIN role_definitions rd ON rd.id = ai.role_definition_id
     LEFT JOIN users client ON client.id = ai.client_user_id
     LEFT JOIN client_profiles cp ON cp.user_id = ai.client_user_id
     LEFT JOIN users staged ON staged.id = ai.staged_user_id
     ORDER BY ai.created_at DESC LIMIT 500`,
  ).all()
  return c.json({ invitations: rows.results || [], can_invite_staff: await isOwner(c, c.get('user')) })
})

// Role names are safe for an invitation manager to see, but only the Owner can
// create/edit roles or use one to provision a new staff identity.
invitationAdminRoutes.get('/invitation-role-options', requireStaff, requireNamedPermission('manage_invitations'), async (c) => {
  if (!(await isOwner(c, c.get('user')))) return c.json({ roles: [] })
  const rows = await c.env.DB.prepare(
    `SELECT id,name,party_type FROM role_definitions WHERE party_type IN ('employee','either') AND COALESCE(is_archived,0) = 0 ORDER BY name`,
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
    known_services?: string[]
    recipient_context?: string
    personal_note?: string
    lead_id?: string
    role_definition_id?: string | null
  }
  const body = await c.req.json<Body>().catch(() => ({} as Body))
  const inviteType = body.invite_type as InviteType
  if (!['vendor', 'client', 'staff'].includes(inviteType)) return c.json({ error: 'invite_type must be vendor, client, or staff' }, 400)
  if (inviteType === 'staff' && !(await isOwner(c, actor))) return c.json({ error: 'only the Pinnacle Owner can invite staff accounts' }, 403)

  const email = normEmail(body.email)
  if (!email || !email.includes('@')) return c.json({ error: 'valid email required' }, 400)
  const fullName = toDisplayCase(clean(body.full_name, 160))
  const roleDefinitionId = clean(body.role_definition_id, 80) || null
  if (inviteType === 'staff' && !roleDefinitionId) return c.json({ error: 'staff invitations require a role template' }, 400)
  if (roleDefinitionId) {
    const role = await c.env.DB.prepare('SELECT id,party_type FROM role_definitions WHERE id = ?').bind(roleDefinitionId).first<{ id: string; party_type: string }>()
    if (!role) return c.json({ error: 'role template not found' }, 404)
    if (inviteType === 'staff' && !['employee', 'either'].includes(role.party_type)) return c.json({ error: 'choose an internal-team role for a staff invitation' }, 400)
  }

  const allowedServices = new Set(['property_field', 'mobile_notary', 'ron', 'document_courier', 'merchant_technology', 'business_operations', 'bookkeeping_financial', 'other'])
  const knownServices = Array.isArray(body.known_services) ? [...new Set(body.known_services.map((value) => clean(value, 80)).filter((value) => allowedServices.has(value)))] : []
  const recipientContext = ['flexible', 'person', 'business'].includes(body.recipient_context || '') ? body.recipient_context! : 'flexible'
  const metadata = {
    vendor_category: clean(body.vendor_category, 120) || undefined,
    company_name: toDisplayCase(clean(body.company_name, 200)) || undefined,
    known_services: inviteType === 'vendor' ? knownServices : undefined,
    recipient_context: inviteType === 'vendor' ? recipientContext : undefined,
    personal_note: inviteType === 'vendor' ? clean(body.personal_note, 800) || undefined : undefined,
    lead_id: clean(body.lead_id, 120) || undefined,
  }

  let stagedUserId: string | null = null
  if (inviteType === 'vendor') {
    try {
      const staged = await stageVendorProfile(c.env, {
        email,
        fullName,
        vendorCategory: metadata.vendor_category,
        companyName: metadata.company_name,
      })
      stagedUserId = staged.userId
    } catch (err) {
      if (err instanceof VendorInviteConflict) return c.json({ error: err.message }, 409)
      throw err
    }
  }

  const invite = await createInvite(c.env, {
    inviteType,
    email,
    fullName,
    roleDefinitionId,
    invitedByUserId: actor.id,
    metadata,
    stagedUserId,
  })

  let emailStatus = 'sent'
  let emailError: string | null = null
  try {
    const providerId = await sendInviteEmail(c.env, { id: invite.id, invite_type: inviteType, email, full_name: fullName || null, metadata_json: JSON.stringify(metadata) }, invite.token, invite.expiresAt)
    await recordInviteEmailResult(c.env, invite.id, { status: 'sent', providerId })
  } catch (err) {
    emailStatus = 'failed'
    emailError = err instanceof Error ? err.message : 'email failed'
    await recordInviteEmailResult(c.env, invite.id, { status: 'failed', error: emailError })
  }

  await logAudit(c.env, {
    actorUserId: actor.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    action: 'record_created',
    entityType: 'access_invite',
    entityId: invite.id,
    after: { type: inviteType, email, expires_at: invite.expiresAt, lead_id: metadata.lead_id, staged_user_id: stagedUserId },
  })
  return c.json({ ok: true, id: invite.id, expires_at: invite.expiresAt, email_status: emailStatus, email_error: emailError, staged_user_id: stagedUserId }, 201)
})

invitationAdminRoutes.post('/invitations/:id/resend', requireStaff, requireNamedPermission('manage_invitations'), async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM access_invites WHERE id = ?').bind(c.req.param('id') || '').first<any>()
  if (!row) return c.json({ error: 'invitation not found' }, 404)
  if (row.invite_type === 'staff' && !(await isOwner(c, c.get('user')))) return c.json({ error: 'only the Pinnacle Owner can manage staff invitations' }, 403)
  if (row.status === 'accepted') return c.json({ error: 'accepted invitations cannot be resent' }, 400)

  let stagedUserId = row.staged_user_id as string | null
  if (row.invite_type === 'vendor' && !stagedUserId) {
    try {
      let metadata: Record<string, unknown> = {}
      try { metadata = JSON.parse(row.metadata_json || '{}') as Record<string, unknown> } catch { metadata = {} }
      const staged = await stageVendorProfile(c.env, {
        email: row.email,
        fullName: row.full_name,
        vendorCategory: typeof metadata.vendor_category === 'string' ? metadata.vendor_category : null,
        companyName: typeof metadata.company_name === 'string' ? metadata.company_name : null,
      })
      stagedUserId = staged.userId
      await c.env.DB.prepare("UPDATE access_invites SET staged_user_id = ?, updated_at = datetime('now') WHERE id = ?").bind(stagedUserId, row.id).run()
    } catch (err) {
      if (!(err instanceof VendorInviteConflict)) throw err
    }
  }

  const rotated = await rotateInviteToken(c.env, row.id)
  try {
    const providerId = await sendInviteEmail(c.env, row, rotated.token, rotated.expiresAt)
    await recordInviteEmailResult(c.env, row.id, { status: 'sent', providerId })
  } catch (err) {
    await recordInviteEmailResult(c.env, row.id, { status: 'failed', error: err instanceof Error ? err.message : 'email failed' })
    throw err
  }
  return c.json({ ok: true, expires_at: rotated.expiresAt, staged_user_id: stagedUserId })
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

function slugRoleKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80)
}

async function loadRoleCatalog(env: AppEnv['Bindings']) {
  const sql = `SELECT rd.*,COUNT(DISTINCT tm.user_id) assigned_users
     FROM role_definitions rd LEFT JOIN team_members tm ON tm.role_definition_id = rd.id
     GROUP BY rd.id`
  let roles
  try {
    roles = await env.DB.prepare(`${sql} ORDER BY COALESCE(rd.is_archived,0), rd.name`).all<any>()
  } catch {
    roles = await env.DB.prepare(`${sql} ORDER BY rd.name`).all<any>()
  }
  const grants = await env.DB.prepare(
    `SELECT role_id,permission_key FROM role_permissions WHERE granted = 1 ORDER BY permission_key`,
  ).all<{ role_id: string; permission_key: string }>()
  const byRole = new Map<string, string[]>()
  for (const grant of grants.results || []) {
    if (!byRole.has(grant.role_id)) byRole.set(grant.role_id, [])
    byRole.get(grant.role_id)!.push(grant.permission_key)
  }
  return (roles.results || []).map((role: any) => ({ ...role, permissions: byRole.get(role.id) || [] }))
}

// Role definitions and the permission catalog are Owner-controlled for writes.
// Admins may read them so Settings can show defaults and assign a template.
// A role may grant operational permissions to staff, but nobody can grant
// Owner authority through a template.
roleAdminRoutes.get('/permissions', requireAdmin, async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM permission_catalog ORDER BY category,label').all()
  return c.json({ permissions: rows.results || [] })
})

roleAdminRoutes.get('/roles', requireAdmin, async (c) => {
  return c.json({ roles: await loadRoleCatalog(c.env) })
})

roleAdminRoutes.get('/access-control', requireAdmin, async (c) => {
  const [permissions, roles, users] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM permission_catalog ORDER BY category,label').all(),
    loadRoleCatalog(c.env),
    c.env.DB.prepare(
      `SELECT u.id, u.email, u.role, u.full_name, u.status, u.created_at,
              tm.id team_member_id, tm.staff_role, tm.title,
              tm.can_reveal_payment_info, tm.can_manage_users, tm.can_manage_settings,
              tm.can_view_reports, tm.can_view_audit_log, tm.can_manage_communications, tm.is_owner,
              tm.party_type, tm.vendor_category, tm.role_definition_id, rd.name role_name, rd.role_key role_code
       FROM users u
       LEFT JOIN team_members tm ON tm.user_id = u.id
       LEFT JOIN role_definitions rd ON rd.id = tm.role_definition_id
       WHERE u.role IN ('staff', 'admin')
       ORDER BY u.full_name, u.email`,
    ).all<any>(),
  ])
  let overrideRows: { results?: { user_id: string; permission_key: string; granted: number }[] } = { results: [] }
  try {
    overrideRows = await c.env.DB.prepare(
      `SELECT tm.user_id, tmpo.permission_key, tmpo.granted
       FROM team_member_permission_overrides tmpo
       JOIN team_members tm ON tm.id = tmpo.team_member_id`,
    ).all<{ user_id: string; permission_key: string; granted: number }>()
  } catch {
    overrideRows = { results: [] }
  }

  const overridesByUser = new Map<string, Record<string, number>>()
  for (const row of overrideRows.results || []) {
    if (!overridesByUser.has(row.user_id)) overridesByUser.set(row.user_id, {})
    overridesByUser.get(row.user_id)![row.permission_key] = row.granted
  }
  const roleById = new Map(roles.map((role: any) => [role.id, role as { permissions: string[] }]))

  const people = (users.results || []).map((user: any) => {
    const rolePerms = new Set((roleById.get(user.role_definition_id)?.permissions || []) as string[])
    const userOverrides = overridesByUser.get(user.id) || {}
    const effective: Record<string, boolean> = {}
    const sources: Record<string, 'admin' | 'override' | 'direct' | 'role' | 'none'> = {}
    for (const key of NAMED_PERMISSIONS) {
      const column = namedPermissionColumn[key]
      const direct = column ? Number(user[column] || 0) : 0
      const override = key in userOverrides ? userOverrides[key] : null
      const granted = resolveNamedPermission({
        accountRole: user.role,
        override,
        directGrant: direct,
        roleGrant: rolePerms.has(key) ? 1 : 0,
      })
      effective[key] = granted
      if (user.role === 'admin') sources[key] = 'admin'
      else if (override === 0 || override === 1) sources[key] = 'override'
      else if (direct) sources[key] = 'direct'
      else if (rolePerms.has(key)) sources[key] = 'role'
      else sources[key] = 'none'
    }
    return {
      ...user,
      permission_overrides: userOverrides,
      effective_permissions: effective,
      permission_sources: sources,
    }
  })

  return c.json({
    permissions: permissions.results || [],
    roles,
    users: people,
    named_permissions: NAMED_PERMISSIONS,
  })
})

roleAdminRoutes.post('/roles', requireOwner, async (c) => {
  const actor = c.get('user')
  type Body = { name?: string; role_key?: string; description?: string; party_type?: string; permissions?: string[] }
  const body = await c.req.json<Body>().catch(() => ({} as Body))
  const name = toDisplayCase(clean(body.name, 120))
  if (!name) return c.json({ error: 'role name required' }, 400)
  const roleKey = slugRoleKey(clean(body.role_key, 80) || name)
  if (!roleKey) return c.json({ error: 'role key required' }, 400)
  const existing = await c.env.DB.prepare('SELECT id FROM role_definitions WHERE role_key = ?').bind(roleKey).first()
  if (existing) return c.json({ error: 'a role with that key already exists' }, 409)
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
  return c.json({ ok: true, id, role_key: roleKey }, 201)
})

roleAdminRoutes.patch('/roles/:id', requireOwner, async (c) => {
  type Body = { name?: string; role_key?: string; description?: string; party_type?: string; permissions?: string[]; is_archived?: boolean }
  const body = await c.req.json<Body>().catch(() => ({} as Body))
  const id = c.req.param('id') || ''
  const current = await c.env.DB.prepare('SELECT * FROM role_definitions WHERE id = ?').bind(id).first<any>()
  if (!current) return c.json({ error: 'role not found' }, 404)

  const name = toDisplayCase(clean(body.name, 120)) || current.name
  const description = body.description !== undefined ? clean(body.description, 500) || null : current.description
  const partyType = ['employee', 'vendor', 'either'].includes(body.party_type || '') ? body.party_type! : current.party_type
  const archived = body.is_archived === undefined ? Number(current.is_archived || 0) : (body.is_archived ? 1 : 0)
  let roleKey = current.role_key
  if (body.role_key !== undefined) {
    const nextKey = slugRoleKey(clean(body.role_key, 80) || name)
    if (!nextKey) return c.json({ error: 'role key required' }, 400)
    if (nextKey !== current.role_key) {
      const clash = await c.env.DB.prepare('SELECT id FROM role_definitions WHERE role_key = ? AND id != ?').bind(nextKey, id).first()
      if (clash) return c.json({ error: 'a role with that key already exists' }, 409)
      roleKey = nextKey
    }
  }

  const statements = [
    c.env.DB.prepare(
      `UPDATE role_definitions SET name = ?, role_key = ?, description = ?, party_type = ?, is_archived = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(name, roleKey, description, partyType, archived, id),
  ]
  if (roleKey !== current.role_key) {
    statements.push(c.env.DB.prepare(
      `UPDATE team_members SET staff_role = ? WHERE role_definition_id = ? AND (staff_role = ? OR staff_role IS NULL)`,
    ).bind(roleKey, id, current.role_key))
  }
  if (Array.isArray(body.permissions)) {
    const permissionKeys = [...new Set(body.permissions.map((value) => clean(value, 80)).filter(Boolean))]
    statements.push(c.env.DB.prepare('DELETE FROM role_permissions WHERE role_id = ?').bind(id))
    for (const permission of permissionKeys) {
      statements.push(c.env.DB.prepare(
        `INSERT INTO role_permissions(role_id,permission_key,granted)
         SELECT ?,permission_key,1 FROM permission_catalog WHERE permission_key = ?`,
      ).bind(id, permission))
    }
  }
  await c.env.DB.batch(statements)
  return c.json({ ok: true, role_key: roleKey })
})

roleAdminRoutes.delete('/roles/:id', requireOwner, async (c) => {
  const id = c.req.param('id') || ''
  const current = await c.env.DB.prepare(
    `SELECT rd.id, rd.is_system, COUNT(tm.user_id) assigned_users
     FROM role_definitions rd LEFT JOIN team_members tm ON tm.role_definition_id = rd.id
     WHERE rd.id = ? GROUP BY rd.id`,
  ).bind(id).first<{ id: string; is_system: number; assigned_users: number }>()
  if (!current) return c.json({ error: 'role not found' }, 404)
  if (current.is_system) return c.json({ error: 'starter templates cannot be deleted; archive or edit them instead' }, 400)
  if (current.assigned_users > 0) return c.json({ error: 'unassign this role from every user before deleting it' }, 400)
  await c.env.DB.prepare('DELETE FROM role_definitions WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

roleAdminRoutes.patch('/users/:id/role-definition', requireAdmin, async (c) => {
  type Body = { role_definition_id?: string | null; reset_overrides?: boolean }
  const body = await c.req.json<Body>().catch(() => ({} as Body))
  const userId = c.req.param('id') || ''
  const user = await c.env.DB.prepare(
    `SELECT u.id,u.role,tm.id team_member_id,tm.party_type FROM users u
     LEFT JOIN team_members tm ON tm.user_id = u.id WHERE u.id = ?`,
  ).bind(userId).first<{ id: string; role: string; team_member_id: string | null; party_type: string | null }>()
  if (!user || !['staff', 'admin'].includes(user.role)) return c.json({ error: 'staff account not found' }, 404)
  if (!user.team_member_id) return c.json({ error: 'team profile not found' }, 404)

  const roleDefinitionId = clean(body.role_definition_id, 80) || null
  let roleKey: string | null = null
  if (roleDefinitionId) {
    const role = await c.env.DB.prepare('SELECT id,party_type,role_key,is_archived FROM role_definitions WHERE id = ?').bind(roleDefinitionId).first<{ id: string; party_type: string; role_key: string; is_archived: number }>()
    if (!role) return c.json({ error: 'role not found' }, 404)
    if (role.is_archived) return c.json({ error: 'that role is archived' }, 400)
    if (role.party_type !== 'either' && role.party_type !== (user.party_type || 'employee')) {
      return c.json({ error: `this role is for ${role.party_type} accounts` }, 400)
    }
    roleKey = role.role_key
  }
  const statements = [
    c.env.DB.prepare('UPDATE team_members SET role_definition_id = ?, staff_role = COALESCE(?, staff_role) WHERE user_id = ?').bind(roleDefinitionId, roleKey, userId),
  ]
  if (body.reset_overrides !== false) {
    statements.push(c.env.DB.prepare('DELETE FROM team_member_permission_overrides WHERE team_member_id = ?').bind(user.team_member_id))
  }
  await c.env.DB.batch(statements)
  return c.json({ ok: true })
})
