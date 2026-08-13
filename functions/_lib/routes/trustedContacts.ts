import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireClient, requireUser } from '../mid'
import { createInvite, rotateInviteToken, sendInviteEmail, recordInviteEmailResult } from '../invites'
import { normalizeTrustedPermissions, TRUSTED_SECTION_LABELS, TRUSTED_SECTIONS, trustedAccess, trustedContexts, type TrustedSection } from '../trustedAccess'
import { uuid } from '../crypto'

export const trustedContactRoutes = new Hono<AppEnv>()

function clean(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}
function normEmail(value: unknown): string {
  return clean(value, 254).toLowerCase()
}

trustedContactRoutes.get('/trusted-contacts', requireClient, async (c) => {
  const user = c.get('user')
  await c.env.DB.prepare(
    `UPDATE access_invites SET status = 'expired', updated_at = datetime('now')
     WHERE invite_type = 'trusted_contact' AND client_user_id = ? AND status = 'pending' AND expires_at <= datetime('now')`,
  ).bind(user.id).run()

  const rows = await c.env.DB.prepare(
    `SELECT tc.id,tc.email,tc.full_name,tc.relationship_label,tc.status,tc.permissions_json,tc.accepted_at,tc.revoked_at,tc.created_at,
            ai.id invite_id,ai.status invite_status,ai.expires_at,ai.created_at invited_at
     FROM trusted_contacts tc LEFT JOIN access_invites ai ON ai.id = tc.invite_id
     WHERE tc.client_user_id = ? ORDER BY tc.created_at DESC`,
  ).bind(user.id).all<Record<string, unknown>>()

  const trusted = (rows.results || []).map((row) => {
    let rawPermissions: unknown = {}
    try { rawPermissions = JSON.parse(String(row.permissions_json || '{}')) } catch { rawPermissions = {} }
    return {
      ...row,
      permissions: normalizeTrustedPermissions(rawPermissions),
      permissions_json: undefined,
      invite_status: row.status === 'active' ? 'accepted' : row.invite_status,
    }
  })
  return c.json({ trusted_contacts: trusted, sections: TRUSTED_SECTIONS.map((key) => ({ key, label: TRUSTED_SECTION_LABELS[key] })) })
})

trustedContactRoutes.post('/trusted-contacts/invite', requireClient, async (c) => {
  const user = c.get('user')
  type Body = { email?: string; full_name?: string; relationship_label?: string; permissions?: unknown }
  const body = await c.req.json<Body>().catch(() => ({} as Body))
  const email = normEmail(body.email)
  const fullName = clean(body.full_name, 160)
  const relationshipLabel = clean(body.relationship_label, 120)
  const permissions = normalizeTrustedPermissions(body.permissions)

  if (!email || !email.includes('@')) return c.json({ error: 'a valid email is required' }, 400)
  if (!fullName) return c.json({ error: 'full name is required' }, 400)
  if (!Object.values(permissions).some((value) => value !== 'none')) return c.json({ error: 'grant at least one section' }, 400)
  if (email === user.email.toLowerCase()) return c.json({ error: 'you cannot invite your own email as a Trusted Contact' }, 400)

  const prior = await c.env.DB.prepare(
    'SELECT id,status,invite_id FROM trusted_contacts WHERE client_user_id = ? AND email = ?',
  ).bind(user.id, email).first<{ id: string; status: string; invite_id: string | null }>()
  if (prior?.status === 'active') return c.json({ error: 'this Trusted Contact already has active access' }, 409)
  if (prior) {
    await c.env.DB.prepare('DELETE FROM trusted_contacts WHERE id = ?').bind(prior.id).run()
    if (prior.invite_id) {
      await c.env.DB.prepare(
        `UPDATE access_invites SET status = 'revoked', revoked_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ? AND status = 'pending'`,
      ).bind(prior.invite_id).run()
    }
  }

  const invite = await createInvite(c.env, {
    inviteType: 'trusted_contact',
    email,
    fullName,
    clientUserId: user.id,
    invitedByUserId: user.id,
    metadata: { relationship_label: relationshipLabel, permissions },
  })
  const trustedId = uuid()
  await c.env.DB.prepare(
    `INSERT INTO trusted_contacts(id,client_user_id,invite_id,email,full_name,relationship_label,status,permissions_json)
     VALUES(?,?,?,?,?,?,'invited',?)`,
  ).bind(trustedId, user.id, invite.id, email, fullName, relationshipLabel || null, JSON.stringify(permissions)).run()

  const profile = await c.env.DB.prepare('SELECT business_name FROM client_profiles WHERE user_id = ?').bind(user.id).first<{ business_name: string | null }>()
  const clientName = profile?.business_name || user.full_name || user.email
  try {
    const providerId = await sendInviteEmail(c.env, { id: invite.id, invite_type: 'trusted_contact', email, full_name: fullName, client_name: clientName }, invite.token, invite.expiresAt)
    await recordInviteEmailResult(c.env, invite.id, { status: 'sent', providerId })
    return c.json({ ok: true, id: trustedId, invite_id: invite.id, expires_at: invite.expiresAt, email_status: 'sent' }, 201)
  } catch (err) {
    await recordInviteEmailResult(c.env, invite.id, { status: 'failed', error: err instanceof Error ? err.message : 'email failed' })
    return c.json({ ok: true, id: trustedId, invite_id: invite.id, expires_at: invite.expiresAt, email_status: 'failed', error: err instanceof Error ? err.message : 'email failed' }, 201)
  }
})

trustedContactRoutes.patch('/trusted-contacts/:id', requireClient, async (c) => {
  const user = c.get('user')
  const current = await c.env.DB.prepare(
    'SELECT id,permissions_json,relationship_label FROM trusted_contacts WHERE id = ? AND client_user_id = ?',
  ).bind(c.req.param('id') || '', user.id).first<{ id: string; permissions_json: string; relationship_label: string | null }>()
  if (!current) return c.json({ error: 'Trusted Contact not found' }, 404)

  type Body = { permissions?: unknown; relationship_label?: string }
  const body = await c.req.json<Body>().catch(() => ({} as Body))
  let existingPermissions: unknown = {}
  try { existingPermissions = JSON.parse(current.permissions_json || '{}') } catch { existingPermissions = {} }
  const permissions = body.permissions !== undefined ? normalizeTrustedPermissions(body.permissions) : normalizeTrustedPermissions(existingPermissions)
  const relationship = body.relationship_label !== undefined ? clean(body.relationship_label, 120) : current.relationship_label
  await c.env.DB.prepare(
    `UPDATE trusted_contacts SET permissions_json = ?, relationship_label = ?, updated_at = datetime('now') WHERE id = ?`,
  ).bind(JSON.stringify(permissions), relationship || null, current.id).run()
  return c.json({ ok: true })
})

trustedContactRoutes.post('/trusted-contacts/:id/resend', requireClient, async (c) => {
  const user = c.get('user')
  const row = await c.env.DB.prepare(
    `SELECT tc.id,tc.email,tc.full_name,ai.id access_invite_id
     FROM trusted_contacts tc JOIN access_invites ai ON ai.id = tc.invite_id
     WHERE tc.id = ? AND tc.client_user_id = ? AND tc.status = 'invited'`,
  ).bind(c.req.param('id') || '', user.id).first<{ id: string; email: string; full_name: string | null; access_invite_id: string }>()
  if (!row) return c.json({ error: 'pending invitation not found' }, 404)

  const rotated = await rotateInviteToken(c.env, row.access_invite_id)
  const profile = await c.env.DB.prepare('SELECT business_name FROM client_profiles WHERE user_id = ?').bind(user.id).first<{ business_name: string | null }>()
  try {
    const providerId = await sendInviteEmail(c.env, {
      id: row.access_invite_id,
      invite_type: 'trusted_contact',
      email: row.email,
      full_name: row.full_name,
      client_name: profile?.business_name || user.full_name || user.email,
    }, rotated.token, rotated.expiresAt)
    await recordInviteEmailResult(c.env, row.access_invite_id, { status: 'sent', providerId })
  } catch (err) {
    await recordInviteEmailResult(c.env, row.access_invite_id, { status: 'failed', error: err instanceof Error ? err.message : 'email failed' })
    throw err
  }
  return c.json({ ok: true, expires_at: rotated.expiresAt })
})

trustedContactRoutes.post('/trusted-contacts/:id/revoke', requireClient, async (c) => {
  const user = c.get('user')
  const row = await c.env.DB.prepare(
    'SELECT id,invite_id FROM trusted_contacts WHERE id = ? AND client_user_id = ?',
  ).bind(c.req.param('id') || '', user.id).first<{ id: string; invite_id: string | null }>()
  if (!row) return c.json({ error: 'Trusted Contact not found' }, 404)

  const statements = [
    c.env.DB.prepare(
      `UPDATE trusted_contacts SET status = 'revoked', revoked_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    ).bind(row.id),
  ]
  if (row.invite_id) {
    statements.push(c.env.DB.prepare(
      `UPDATE access_invites SET status = 'revoked', revoked_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND status = 'pending'`,
    ).bind(row.invite_id))
  }
  await c.env.DB.batch(statements)
  return c.json({ ok: true })
})

trustedContactRoutes.get('/trusted/context', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role !== 'trusted_contact') return c.json({ error: 'trusted contact accounts only' }, 403)
  return c.json({ relationships: await trustedContexts(c.env, user) })
})

trustedContactRoutes.get('/trusted/:clientId/:section', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role !== 'trusted_contact') return c.json({ error: 'trusted contact accounts only' }, 403)
  const clientId = c.req.param('clientId') || ''
  const section = c.req.param('section') as TrustedSection
  if (!TRUSTED_SECTIONS.includes(section)) return c.json({ error: 'unknown section' }, 404)
  const access = await trustedAccess(c.env, user, clientId, section, 'view')
  if (!access) return c.json({ error: 'forbidden' }, 403)

  if (section === 'business_profile') {
    const [account, profile] = await Promise.all([
      c.env.DB.prepare('SELECT full_name,email,phone FROM users WHERE id = ?').bind(clientId).first(),
      c.env.DB.prepare('SELECT business_name,entity_type,ein,state FROM client_profiles WHERE user_id = ?').bind(clientId).first(),
    ])
    return c.json({ mode: access.permissions[section], account, profile })
  }
  if (section === 'services') {
    const rows = await c.env.DB.prepare(
      `SELECT cs.id,cs.service_key,cs.status,s.name FROM client_services cs LEFT JOIN services s ON s.key = cs.service_key
       WHERE cs.client_user_id = ? ORDER BY s.name`,
    ).bind(clientId).all()
    return c.json({ mode: access.permissions[section], rows: rows.results || [] })
  }
  if (section === 'documents') {
    const rows = await c.env.DB.prepare(
      `SELECT id,category,file_name,review_status,content_type,size_bytes,created_at FROM client_documents
       WHERE client_user_id = ? AND COALESCE(visibility,'client') != 'internal' AND archived_at IS NULL ORDER BY created_at DESC`,
    ).bind(clientId).all()
    return c.json({ mode: access.permissions[section], rows: rows.results || [] })
  }
  if (section === 'billing') {
    const rows = await c.env.DB.prepare(
      `SELECT id,invoice_number,title,amount_cents,currency,status,due_date,issue_date,created_at FROM invoices
       WHERE client_user_id = ? AND archived_at IS NULL ORDER BY created_at DESC`,
    ).bind(clientId).all()
    return c.json({ mode: access.permissions[section], rows: rows.results || [] })
  }
  if (section === 'tasks') {
    const rows = await c.env.DB.prepare(
      `SELECT id,title,status,due_date,created_at FROM client_tasks WHERE client_user_id = ? AND archived_at IS NULL ORDER BY created_at DESC`,
    ).bind(clientId).all()
    return c.json({ mode: access.permissions[section], rows: rows.results || [] })
  }
  if (section === 'calendar') {
    const rows = await c.env.DB.prepare(
      `SELECT id,title,starts_at,status,created_at FROM appointments WHERE client_user_id = ? ORDER BY starts_at DESC`,
    ).bind(clientId).all()
    return c.json({ mode: access.permissions[section], rows: rows.results || [] })
  }
  if (section === 'messages') {
    const rows = await c.env.DB.prepare(
      `SELECT id,subject,body,created_at,sender_user_id FROM secure_messages WHERE client_user_id = ? ORDER BY created_at DESC LIMIT 100`,
    ).bind(clientId).all()
    return c.json({ mode: access.permissions[section], rows: rows.results || [] })
  }
  const rows = await c.env.DB.prepare(
    `SELECT id,subject,status,priority,created_at FROM support_tickets
     WHERE client_user_id = ? AND archived_at IS NULL ORDER BY created_at DESC`,
  ).bind(clientId).all()
  return c.json({ mode: access.permissions[section], rows: rows.results || [] })
})

trustedContactRoutes.patch('/trusted/:clientId/business_profile', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role !== 'trusted_contact') return c.json({ error: 'trusted contact accounts only' }, 403)
  const clientId = c.req.param('clientId') || ''
  if (!(await trustedAccess(c.env, user, clientId, 'business_profile', 'edit'))) return c.json({ error: 'edit access not granted' }, 403)

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>))
  for (const key of ['business_name', 'entity_type', 'ein', 'state'] as const) {
    if (typeof body[key] === 'string') {
      await c.env.DB.prepare(`UPDATE client_profiles SET ${key} = ? WHERE user_id = ?`).bind(clean(body[key], 200) || null, clientId).run()
    }
  }
  if (typeof body.phone === 'string') {
    await c.env.DB.prepare('UPDATE users SET phone = ? WHERE id = ?').bind(clean(body.phone, 50) || null, clientId).run()
  }
  return c.json({ ok: true })
})

trustedContactRoutes.patch('/trusted/:clientId/tasks/:taskId', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role !== 'trusted_contact') return c.json({ error: 'trusted contact accounts only' }, 403)
  const clientId = c.req.param('clientId') || ''
  if (!(await trustedAccess(c.env, user, clientId, 'tasks', 'edit'))) return c.json({ error: 'edit access not granted' }, 403)

  type Body = { status?: string }
  const body = await c.req.json<Body>().catch(() => ({} as Body))
  const status = body.status && ['pending', 'in_progress', 'done'].includes(body.status) ? body.status : null
  if (!status) return c.json({ error: 'invalid status' }, 400)
  await c.env.DB.prepare('UPDATE client_tasks SET status = ? WHERE id = ? AND client_user_id = ?').bind(status, c.req.param('taskId') || '', clientId).run()
  return c.json({ ok: true })
})
