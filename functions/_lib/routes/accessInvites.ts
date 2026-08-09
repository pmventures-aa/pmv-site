import { Hono } from 'hono'
import type { AppEnv, SessionUser } from '../types'
import { requireClient, requireOwner, requireUser } from '../mid'
import { uuid, hashPassword } from '../crypto'
import { createSession, sessionCookie } from '../session'
import { createInvite, getInviteByToken, rotateInviteToken, sendInviteEmail, type InviteType } from '../invites'
import { normalizeTrustedPermissions, TRUSTED_SECTION_LABELS, TRUSTED_SECTIONS, trustedAccess, trustedContexts, type TrustedSection } from '../trustedAccess'
import { sendEmailStrict, escapeHtml } from '../email'
import { logAudit, actorIp, actorUserAgent } from '../auditLog'

export const invitationPublicRoutes = new Hono<AppEnv>()
export const trustedContactRoutes = new Hono<AppEnv>()
export const invitationAdminRoutes = new Hono<AppEnv>()

const emailNorm = (v: unknown) => typeof v === 'string' ? v.trim().toLowerCase().slice(0, 254) : ''
const text = (v: unknown, n = 200) => typeof v === 'string' ? v.trim().slice(0, n) : ''

async function publicInviteShape(c: any, token: string) {
  const invite = await getInviteByToken(c.env, token)
  if (!invite) return null
  let clientName: string | null = null
  if (invite.client_user_id) {
    const row = await c.env.DB.prepare(
      `SELECT COALESCE(cp.business_name, u.full_name, u.email) AS name
       FROM users u LEFT JOIN client_profiles cp ON cp.user_id=u.id WHERE u.id=?`,
    ).bind(invite.client_user_id).first<{ name: string }>()
    clientName = row?.name || null
  }
  let metadata: Record<string, unknown> = {}
  try { metadata = JSON.parse(invite.metadata_json || '{}') } catch { metadata = {} }
  return {
    id: invite.id,
    invite_type: invite.invite_type,
    email: invite.email,
    full_name: invite.full_name,
    status: invite.status,
    expires_at: invite.expires_at,
    client_name: clientName,
    metadata,
  }
}

invitationPublicRoutes.get('/invite/:token', async (c) => {
  const invite = await publicInviteShape(c, c.req.param('token') || '')
  if (!invite) return c.json({ error: 'invitation not found' }, 404)
  return c.json({ invite })
})

// Trusted Contact acceptance is intentionally separate from normal client signup.
// The new account has role='trusted_contact' and receives only the delegated
// client relationship stored in trusted_contacts.
invitationPublicRoutes.post('/invite/:token/accept-trusted', async (c) => {
  const token = c.req.param('token') || ''
  const invite = await getInviteByToken(c.env, token)
  if (!invite || invite.invite_type !== 'trusted_contact') return c.json({ error: 'trusted contact invitation not found' }, 404)
  if (invite.status !== 'pending') return c.json({ error: `this invitation is ${invite.status}` }, 400)
  if (!invite.client_user_id) return c.json({ error: 'invalid trusted contact invitation' }, 400)
  const body = await c.req.json<{ full_name?: string; password?: string }>().catch(() => ({}))
  const fullName = text(body.full_name || invite.full_name, 160)
  if (!fullName) return c.json({ error: 'full name is required' }, 400)
  if (!body.password || body.password.length < 10) return c.json({ error: 'password must be at least 10 characters' }, 400)

  const existing = await c.env.DB.prepare('SELECT id, role, status FROM users WHERE email=?').bind(invite.email).first<any>()
  if (existing && (existing.role !== 'trusted_contact' || existing.status !== 'active')) {
    return c.json({ error: 'that email already belongs to another Pinnacle account' }, 409)
  }
  const userId = existing?.id || uuid()
  const passwordHash = await hashPassword(body.password, c.env.SESSION_SECRET)
  if (existing) {
    await c.env.DB.prepare("UPDATE users SET full_name=?, password_hash=?, status='active' WHERE id=?").bind(fullName, passwordHash, userId).run()
  } else {
    await c.env.DB.prepare(
      `INSERT INTO users(id,email,password_hash,role,full_name,two_factor_enabled,status)
       VALUES(?,?,?,'trusted_contact',?,0,'active')`,
    ).bind(userId, invite.email, passwordHash, fullName).run()
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE trusted_contacts SET contact_user_id=?, full_name=?, status='active', accepted_at=datetime('now'), updated_at=datetime('now')
       WHERE invite_id=? AND client_user_id=?`,
    ).bind(userId, fullName, invite.id, invite.client_user_id),
    c.env.DB.prepare(
      `UPDATE access_invites SET status='accepted', accepted_by_user_id=?, accepted_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
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

// ----- Client-owned Trusted Contacts -----
trustedContactRoutes.get('/trusted-contacts', requireClient, async (c) => {
  const user = c.get('user')
  await c.env.DB.prepare("UPDATE access_invites SET status='expired', updated_at=datetime('now') WHERE invite_type='trusted_contact' AND client_user_id=? AND status='pending' AND expires_at <= datetime('now')").bind(user.id).run()
  const rows = await c.env.DB.prepare(
    `SELECT tc.id, tc.email, tc.full_name, tc.relationship_label, tc.status, tc.permissions_json, tc.accepted_at, tc.revoked_at, tc.created_at,
            ai.id invite_id, ai.status invite_status, ai.expires_at, ai.created_at invited_at
     FROM trusted_contacts tc LEFT JOIN access_invites ai ON ai.id=tc.invite_id
     WHERE tc.client_user_id=? ORDER BY tc.created_at DESC`,
  ).bind(user.id).all<any>()
  return c.json({
    trusted_contacts: (rows.results || []).map((r) => ({
      ...r,
      permissions: normalizeTrustedPermissions(JSON.parse(r.permissions_json || '{}')),
      permissions_json: undefined,
      invite_status: r.status === 'active' ? 'accepted' : r.invite_status,
    })),
    sections: TRUSTED_SECTIONS.map((key) => ({ key, label: TRUSTED_SECTION_LABELS[key] })),
  })
})

trustedContactRoutes.post('/trusted-contacts/invite', requireClient, async (c) => {
  const user = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request body' }, 400)
  const email = emailNorm(body.email)
  const fullName = text(body.full_name, 160)
  const relationshipLabel = text(body.relationship_label, 120)
  const permissions = normalizeTrustedPermissions(body.permissions)
  if (!email || !email.includes('@')) return c.json({ error: 'a valid email is required' }, 400)
  if (!fullName) return c.json({ error: 'full name is required' }, 400)
  if (!Object.values(permissions).some((v) => v !== 'none')) return c.json({ error: 'grant at least one section' }, 400)
  if (email === user.email.toLowerCase()) return c.json({ error: 'you cannot invite your own email as a Trusted Contact' }, 400)

  const prior = await c.env.DB.prepare('SELECT id, status, invite_id FROM trusted_contacts WHERE client_user_id=? AND email=?').bind(user.id, email).first<any>()
  if (prior?.status === 'active') return c.json({ error: 'this Trusted Contact already has active access' }, 409)
  if (prior) {
    await c.env.DB.prepare('DELETE FROM trusted_contacts WHERE id=?').bind(prior.id).run()
    if (prior.invite_id) await c.env.DB.prepare("UPDATE access_invites SET status='revoked', revoked_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status='pending'").bind(prior.invite_id).run()
  }

  const invite = await createInvite(c.env, {
    inviteType: 'trusted_contact', email, fullName, clientUserId: user.id, invitedByUserId: user.id,
    metadata: { relationship_label: relationshipLabel, permissions },
  })
  const trustedId = uuid()
  await c.env.DB.prepare(
    `INSERT INTO trusted_contacts(id,client_user_id,invite_id,email,full_name,relationship_label,status,permissions_json)
     VALUES(?,?,?,?,?,?,'invited',?)`,
  ).bind(trustedId, user.id, invite.id, email, fullName, relationshipLabel || null, JSON.stringify(permissions)).run()
  let clientName = user.full_name || user.email
  const profile = await c.env.DB.prepare('SELECT business_name FROM client_profiles WHERE user_id=?').bind(user.id).first<{ business_name: string | null }>()
  if (profile?.business_name) clientName = profile.business_name
  try {
    await sendInviteEmail(c.env, { id: invite.id, invite_type: 'trusted_contact', email, full_name: fullName, client_name: clientName }, invite.token, invite.expiresAt)
  } catch (err) {
    return c.json({ ok: true, id: trustedId, invite_id: invite.id, email_status: 'failed', error: err instanceof Error ? err.message : 'email failed' }, 201)
  }
  return c.json({ ok: true, id: trustedId, invite_id: invite.id, expires_at: invite.expiresAt, email_status: 'sent' }, 201)
})

trustedContactRoutes.patch('/trusted-contacts/:id', requireClient, async (c) => {
  const user = c.get('user')
  const current = await c.env.DB.prepare('SELECT * FROM trusted_contacts WHERE id=? AND client_user_id=?').bind(c.req.param('id'), user.id).first<any>()
  if (!current) return c.json({ error: 'Trusted Contact not found' }, 404)
  const body = await c.req.json<any>().catch(() => ({}))
  const permissions = body.permissions ? normalizeTrustedPermissions(body.permissions) : normalizeTrustedPermissions(JSON.parse(current.permissions_json || '{}'))
  const relationship = body.relationship_label !== undefined ? text(body.relationship_label, 120) : current.relationship_label
  await c.env.DB.prepare("UPDATE trusted_contacts SET permissions_json=?, relationship_label=?, updated_at=datetime('now') WHERE id=?").bind(JSON.stringify(permissions), relationship || null, current.id).run()
  return c.json({ ok: true })
})

trustedContactRoutes.post('/trusted-contacts/:id/resend', requireClient, async (c) => {
  const user = c.get('user')
  const row = await c.env.DB.prepare(
    `SELECT tc.*, ai.id access_invite_id FROM trusted_contacts tc JOIN access_invites ai ON ai.id=tc.invite_id
     WHERE tc.id=? AND tc.client_user_id=? AND tc.status='invited'`,
  ).bind(c.req.param('id'), user.id).first<any>()
  if (!row) return c.json({ error: 'pending invitation not found' }, 404)
  const rotated = await rotateInviteToken(c.env, row.access_invite_id)
  const profile = await c.env.DB.prepare('SELECT business_name FROM client_profiles WHERE user_id=?').bind(user.id).first<{ business_name: string | null }>()
  await sendInviteEmail(c.env, {
    id: row.access_invite_id, invite_type: 'trusted_contact', email: row.email, full_name: row.full_name,
    client_name: profile?.business_name || user.full_name || user.email,
  }, rotated.token, rotated.expiresAt)
  return c.json({ ok: true, expires_at: rotated.expiresAt })
})

trustedContactRoutes.post('/trusted-contacts/:id/revoke', requireClient, async (c) => {
  const user = c.get('user')
  const row = await c.env.DB.prepare('SELECT * FROM trusted_contacts WHERE id=? AND client_user_id=?').bind(c.req.param('id'), user.id).first<any>()
  if (!row) return c.json({ error: 'Trusted Contact not found' }, 404)
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE trusted_contacts SET status='revoked', revoked_at=datetime('now'), updated_at=datetime('now') WHERE id=?").bind(row.id),
    ...(row.invite_id ? [c.env.DB.prepare("UPDATE access_invites SET status='revoked', revoked_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status='pending'").bind(row.invite_id)] : []),
  ])
  return c.json({ ok: true })
})

// ----- Trusted Contact data surface -----
trustedContactRoutes.get('/trusted/context', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role !== 'trusted_contact') return c.json({ error: 'trusted contact accounts only' }, 403)
  return c.json({ relationships: await trustedContexts(c.env, user) })
})

trustedContactRoutes.get('/trusted/:clientId/:section', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role !== 'trusted_contact') return c.json({ error: 'trusted contact accounts only' }, 403)
  const section = c.req.param('section') as TrustedSection
  if (!TRUSTED_SECTIONS.includes(section)) return c.json({ error: 'unknown section' }, 404)
  const clientId = c.req.param('clientId')
  const access = await trustedAccess(c.env, user, clientId, section, 'view')
  if (!access) return c.json({ error: 'forbidden' }, 403)

  if (section === 'business_profile') {
    const [account, profile] = await Promise.all([
      c.env.DB.prepare('SELECT full_name,email,phone FROM users WHERE id=?').bind(clientId).first(),
      c.env.DB.prepare('SELECT business_name,entity_type,ein,state FROM client_profiles WHERE user_id=?').bind(clientId).first(),
    ])
    return c.json({ mode: access.permissions[section], account, profile })
  }
  if (section === 'services') {
    const rows = await c.env.DB.prepare(`SELECT cs.id,cs.service_key,cs.status,s.name FROM client_services cs LEFT JOIN services s ON s.key=cs.service_key WHERE cs.client_user_id=? ORDER BY s.name`).bind(clientId).all()
    return c.json({ mode: access.permissions[section], rows: rows.results || [] })
  }
  if (section === 'documents') {
    const rows = await c.env.DB.prepare(`SELECT id,category,file_name,review_status,content_type,size_bytes,created_at FROM client_documents WHERE client_user_id=? AND COALESCE(visibility,'client')!='internal' AND archived_at IS NULL ORDER BY created_at DESC`).bind(clientId).all()
    return c.json({ mode: access.permissions[section], rows: rows.results || [] })
  }
  if (section === 'billing') {
    const rows = await c.env.DB.prepare(`SELECT id,invoice_number,title,amount_cents,currency,status,due_date,issue_date,created_at FROM invoices WHERE client_user_id=? AND archived_at IS NULL ORDER BY created_at DESC`).bind(clientId).all()
    return c.json({ mode: access.permissions[section], rows: rows.results || [] })
  }
  if (section === 'tasks') {
    const rows = await c.env.DB.prepare(`SELECT id,title,status,due_date,created_at FROM client_tasks WHERE client_user_id=? AND archived_at IS NULL ORDER BY created_at DESC`).bind(clientId).all()
    return c.json({ mode: access.permissions[section], rows: rows.results || [] })
  }
  if (section === 'calendar') {
    const rows = await c.env.DB.prepare(`SELECT id,title,starts_at,status,created_at FROM appointments WHERE client_user_id=? ORDER BY starts_at DESC`).bind(clientId).all()
    return c.json({ mode: access.permissions[section], rows: rows.results || [] })
  }
  if (section === 'messages') {
    const rows = await c.env.DB.prepare(`SELECT id,subject,body,created_at,sender_user_id FROM secure_messages WHERE client_user_id=? ORDER BY created_at DESC LIMIT 100`).bind(clientId).all()
    return c.json({ mode: access.permissions[section], rows: rows.results || [] })
  }
  const rows = await c.env.DB.prepare(`SELECT id,subject,status,priority,created_at FROM support_tickets WHERE client_user_id=? AND archived_at IS NULL ORDER BY created_at DESC`).bind(clientId).all()
  return c.json({ mode: access.permissions[section], rows: rows.results || [] })
})

trustedContactRoutes.patch('/trusted/:clientId/business_profile', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role !== 'trusted_contact') return c.json({ error: 'trusted contact accounts only' }, 403)
  const clientId = c.req.param('clientId')
  if (!(await trustedAccess(c.env, user, clientId, 'business_profile', 'edit'))) return c.json({ error: 'edit access not granted' }, 403)
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}))
  for (const key of ['business_name','entity_type','ein','state'] as const) {
    if (typeof body[key] === 'string') await c.env.DB.prepare(`UPDATE client_profiles SET ${key}=? WHERE user_id=?`).bind(text(body[key], 200) || null, clientId).run()
  }
  if (typeof body.phone === 'string') await c.env.DB.prepare('UPDATE users SET phone=? WHERE id=?').bind(text(body.phone, 50) || null, clientId).run()
  return c.json({ ok: true })
})

trustedContactRoutes.patch('/trusted/:clientId/tasks/:taskId', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role !== 'trusted_contact') return c.json({ error: 'trusted contact accounts only' }, 403)
  const clientId = c.req.param('clientId')
  if (!(await trustedAccess(c.env, user, clientId, 'tasks', 'edit'))) return c.json({ error: 'edit access not granted' }, 403)
  const body = await c.req.json<{ status?: string }>().catch(() => ({}))
  const status = ['pending','in_progress','done'].includes(body.status || '') ? body.status : null
  if (!status) return c.json({ error: 'invalid status' }, 400)
  await c.env.DB.prepare('UPDATE client_tasks SET status=? WHERE id=? AND client_user_id=?').bind(status, c.req.param('taskId'), clientId).run()
  return c.json({ ok: true })
})

// ----- Owner invitation center + dynamic roles -----
invitationAdminRoutes.get('/invitations', requireOwner, async (c) => {
  await c.env.DB.prepare("UPDATE access_invites SET status='expired', updated_at=datetime('now') WHERE status='pending' AND expires_at <= datetime('now')").run()
  const rows = await c.env.DB.prepare(
    `SELECT ai.*, inviter.full_name inviter_name, rd.name role_name,
            COALESCE(cp.business_name, client.full_name, client.email) client_name
     FROM access_invites ai
     LEFT JOIN users inviter ON inviter.id=ai.invited_by_user_id
     LEFT JOIN role_definitions rd ON rd.id=ai.role_definition_id
     LEFT JOIN users client ON client.id=ai.client_user_id
     LEFT JOIN client_profiles cp ON cp.user_id=ai.client_user_id
     ORDER BY ai.created_at DESC LIMIT 500`,
  ).all()
  return c.json({ invitations: rows.results || [] })
})

invitationAdminRoutes.post('/invitations', requireOwner, async (c) => {
  const actor = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request body' }, 400)
  const type = body.invite_type as InviteType
  if (!['vendor','client','staff'].includes(type)) return c.json({ error: 'invite_type must be vendor, client, or staff' }, 400)
  const email = emailNorm(body.email)
  if (!email || !email.includes('@')) return c.json({ error: 'valid email required' }, 400)
  const fullName = text(body.full_name, 160)
  const metadata = {
    vendor_category: text(body.vendor_category, 120) || undefined,
    company_name: text(body.company_name, 200) || undefined,
    lead_id: text(body.lead_id, 120) || undefined,
  }
  const invite = await createInvite(c.env, {
    inviteType: type, email, fullName, roleDefinitionId: text(body.role_definition_id, 80) || null,
    invitedByUserId: actor.id, metadata,
  })
  const row = { id: invite.id, invite_type: type, email, full_name: fullName || null }
  let emailStatus = 'sent'
  let emailError: string | null = null
  try { await sendInviteEmail(c.env, row, invite.token, invite.expiresAt) } catch (err) { emailStatus='failed'; emailError=err instanceof Error ? err.message : 'email failed' }
  await logAudit(c.env, { actorUserId: actor.id, actorIp: actorIp(c.req.raw), actorUserAgent: actorUserAgent(c.req.raw), action: 'record_created', entityType: 'access_invite', entityId: invite.id, after: { type, email, expires_at: invite.expiresAt } })
  return c.json({ ok: true, id: invite.id, expires_at: invite.expiresAt, email_status: emailStatus, email_error: emailError }, 201)
})

invitationAdminRoutes.post('/invitations/:id/resend', requireOwner, async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM access_invites WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!row) return c.json({ error: 'invitation not found' }, 404)
  if (row.status === 'accepted') return c.json({ error: 'accepted invitations cannot be resent' }, 400)
  const rotated = await rotateInviteToken(c.env, row.id)
  await sendInviteEmail(c.env, row, rotated.token, rotated.expiresAt)
  return c.json({ ok: true, expires_at: rotated.expiresAt })
})

invitationAdminRoutes.post('/invitations/:id/revoke', requireOwner, async (c) => {
  await c.env.DB.prepare("UPDATE access_invites SET status='revoked', revoked_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status!='accepted'").bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

invitationAdminRoutes.get('/permissions', requireOwner, async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM permission_catalog ORDER BY category,label').all()
  return c.json({ permissions: rows.results || [] })
})

invitationAdminRoutes.get('/roles', requireOwner, async (c) => {
  const roles = await c.env.DB.prepare(
    `SELECT rd.*, COUNT(DISTINCT tm.user_id) assigned_users
     FROM role_definitions rd LEFT JOIN team_members tm ON tm.role_definition_id=rd.id
     GROUP BY rd.id ORDER BY rd.name`,
  ).all<any>()
  const grants = await c.env.DB.prepare('SELECT role_id,permission_key,granted FROM role_permissions WHERE granted=1').all<any>()
  const byRole = new Map<string,string[]>()
  for (const g of grants.results || []) { if (!byRole.has(g.role_id)) byRole.set(g.role_id, []); byRole.get(g.role_id)!.push(g.permission_key) }
  return c.json({ roles: (roles.results || []).map((r:any) => ({ ...r, permissions: byRole.get(r.id) || [] })) })
})

invitationAdminRoutes.post('/roles', requireOwner, async (c) => {
  const actor = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request body' }, 400)
  const name = text(body.name, 120)
  if (!name) return c.json({ error: 'role name required' }, 400)
  const key = text(body.role_key || name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''), 80)
  const id = uuid()
  const permissionKeys = Array.isArray(body.permissions) ? body.permissions.map((v:any)=>text(v,80)).filter(Boolean) : []
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO role_definitions(id,role_key,name,description,party_type,is_system,created_by_user_id) VALUES(?,?,?,?,?,0,?)`).bind(id,key,name,text(body.description,500)||null,['employee','vendor','either'].includes(body.party_type)?body.party_type:'employee',actor.id),
    ...permissionKeys.map((p:string)=>c.env.DB.prepare(`INSERT INTO role_permissions(role_id,permission_key,granted) SELECT ?,permission_key,1 FROM permission_catalog WHERE permission_key=?`).bind(id,p)),
  ])
  return c.json({ ok:true,id },201)
})

invitationAdminRoutes.patch('/roles/:id', requireOwner, async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const current = await c.env.DB.prepare('SELECT * FROM role_definitions WHERE id=?').bind(c.req.param('id')).first<any>()
  if (!current) return c.json({ error:'role not found' },404)
  const permissions = Array.isArray(body.permissions) ? body.permissions.map((v:any)=>text(v,80)).filter(Boolean) : []
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE role_definitions SET name=?,description=?,party_type=?,updated_at=datetime('now') WHERE id=?`).bind(text(body.name,120)||current.name, body.description!==undefined?text(body.description,500)||null:current.description, ['employee','vendor','either'].includes(body.party_type)?body.party_type:current.party_type,current.id),
    c.env.DB.prepare('DELETE FROM role_permissions WHERE role_id=?').bind(current.id),
    ...permissions.map((p:string)=>c.env.DB.prepare(`INSERT INTO role_permissions(role_id,permission_key,granted) SELECT ?,permission_key,1 FROM permission_catalog WHERE permission_key=?`).bind(current.id,p)),
  ])
  return c.json({ ok:true })
})

invitationAdminRoutes.patch('/users/:id/role-definition', requireOwner, async (c) => {
  const body = await c.req.json<{ role_definition_id?: string | null }>().catch(() => ({}))
  const user = await c.env.DB.prepare(`SELECT u.id,u.role,tm.id team_member_id FROM users u LEFT JOIN team_members tm ON tm.user_id=u.id WHERE u.id=?`).bind(c.req.param('id')).first<any>()
  if (!user || !['staff','admin'].includes(user.role)) return c.json({ error:'staff account not found' },404)
  if (!user.team_member_id) return c.json({ error:'team profile not found' },404)
  if (body.role_definition_id) {
    const role = await c.env.DB.prepare('SELECT id FROM role_definitions WHERE id=?').bind(body.role_definition_id).first()
    if (!role) return c.json({ error:'role not found' },404)
  }
  await c.env.DB.prepare("UPDATE team_members SET role_definition_id=? WHERE user_id=?").bind(body.role_definition_id || null,user.id).run()
  return c.json({ ok:true })
})

// Staff invite acceptance page can provision a staff account from a database-defined role.
invitationPublicRoutes.post('/invite/:token/accept-staff', async (c) => {
  const token = c.req.param('token') || ''
  const invite = await getInviteByToken(c.env, token)
  if (!invite || invite.invite_type !== 'staff' || invite.status !== 'pending') return c.json({ error:'staff invitation is invalid or expired' },400)
  const body = await c.req.json<{ full_name?:string; password?:string }>().catch(()=>({}))
  const fullName = text(body.full_name || invite.full_name,160)
  if (!fullName || !body.password || body.password.length<10) return c.json({ error:'name and a 10+ character password are required' },400)
  const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(invite.email).first()
  if (exists) return c.json({ error:'an account with that email already exists' },409)
  const id=uuid(), hash=await hashPassword(body.password,c.env.SESSION_SECRET)
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO users(id,email,password_hash,role,full_name,two_factor_enabled,status) VALUES(?,?,?,'staff',?,0,'active')`).bind(id,invite.email,hash,fullName),
    c.env.DB.prepare(`INSERT INTO team_members(id,user_id,staff_role,title,party_type,role_definition_id) VALUES(?,?,'support_specialist',?,'employee',?)`).bind(uuid(),id,fullName,invite.role_definition_id),
    c.env.DB.prepare(`UPDATE access_invites SET status='accepted',accepted_by_user_id=?,accepted_at=datetime('now'),updated_at=datetime('now') WHERE id=?`).bind(id,invite.id),
  ])
  const sessionUser: SessionUser={id,email:invite.email,role:'staff',full_name:fullName}
  const session=await createSession(c.env,sessionUser); c.header('Set-Cookie',sessionCookie(session))
  return c.json({ok:true,user:sessionUser})
})

// Optional notification when a client changes delegated access. Kept here so
// all invitation/access mail uses the same sender and visual language.
export async function sendTrustedAccessChanged(env: AppEnv['Bindings'], email: string, clientName: string) {
  await sendEmailStrict(env, {
    to: email,
    subject: `Your Trusted Contact access was updated by ${clientName}`,
    html: `<p>${escapeHtml(clientName)} updated the sections you can access through their Pinnacle Client Portal.</p><p>Sign in to review your current access.</p>`,
    text: `${clientName} updated the sections you can access through their Pinnacle Client Portal. Sign in to review your current access.`,
  })
}
