import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { uuid } from '../crypto'
import { hasCapability, hasNamedPermission } from '../capabilities'
import {
  brandedSignatureHtml,
  ensurePersonalSignature,
  letterheadTemplates,
  listSignatureRoster,
  listSignaturesForUser,
  loadSignatureRow,
  savePersonalLetterhead,
  type SignatureKind,
  type SignaturePerson,
} from '../emailSignatures'

export const emailSignatureRoutes = new Hono<AppEnv>()
emailSignatureRoutes.use('*', requireStaff)

const KINDS = new Set<SignatureKind>(['company', 'personal', 'support', 'custom'])
const SHARED_KINDS = new Set<SignatureKind>(['company', 'support'])
const PROTECTED_SLUGS = new Set(['company', 'pmv-support'])

const clean = (v: unknown, n: number) => typeof v === 'string' ? v.trim().slice(0, n) : ''

function readPerson(body: any): SignaturePerson | null {
  if (!body?.person || typeof body.person !== 'object') return null
  return {
    name: clean(body.person.name, 80),
    title: clean(body.person.title, 80),
    email: clean(body.person.email, 120),
    phone: clean(body.person.phone, 40),
  }
}

async function canManageRoster(env: AppEnv['Bindings'], user: AppEnv['Variables']['user']) {
  return user.role === 'admin'
    || await hasCapability(env, user, 'can_manage_communications')
    || await hasCapability(env, user, 'can_manage_users')
    || await hasNamedPermission(env, user, 'manage_team')
}

emailSignatureRoutes.get('/email-signatures', async (c) => {
  const user = c.get('user')
  const signatures = await listSignaturesForUser(c.env, user)
  const manage = await canManageRoster(c.env, user)
  const roster = manage ? await listSignatureRoster(c.env) : []
  const mine = signatures.find((row) => row.kind === 'personal' && row.owner_user_id === user.id)
  return c.json({
    signatures,
    templates: letterheadTemplates(user, {
      name: mine?.person_name || user.full_name,
      title: mine?.person_title,
      email: mine?.person_email || user.email,
      phone: mine?.person_phone,
    }),
    roster,
    can_manage_roster: manage,
  })
})

emailSignatureRoutes.post('/email-signatures/roster/:userId', async (c) => {
  const user = c.get('user')
  const targetId = c.req.param('userId')
  if (targetId !== user.id && !(await canManageRoster(c.env, user))) return c.json({ error: 'forbidden' }, 403)
  const target = await c.env.DB.prepare(
    `SELECT id, email, full_name, role FROM users WHERE id = ? AND role IN ('staff', 'admin') LIMIT 1`,
  ).bind(targetId).first<{ id: string; email: string; full_name: string | null; role: string }>()
  if (!target) return c.json({ error: 'not found' }, 404)
  let signature = await ensurePersonalSignature(c.env, target)
  const body = await c.req.json<any>().catch(() => null)
  const person = readPerson(body)
  if (person) {
    signature = await savePersonalLetterhead(c.env, targetId, {
      name: person.name || target.full_name || target.email,
      title: person.title,
      email: person.email || target.email,
      phone: person.phone,
    })
  }
  return c.json({ signature })
})

emailSignatureRoutes.post('/email-signatures', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  const name = clean(body?.name, 80)
  if (!name) return c.json({ error: 'name required' }, 400)
  const kind = (clean(body?.kind, 20) || 'custom') as SignatureKind
  if (!KINDS.has(kind)) return c.json({ error: 'invalid kind' }, 400)
  const person = readPerson(body)
  const html = clean(body?.html, 20_000) || brandedSignatureHtml(kind, person || {
    name: user.full_name,
    email: user.email,
  })
  const canManageShared = await canManageRoster(c.env, user)
  const shared = SHARED_KINDS.has(kind) || body?.shared === true
  if (shared && !canManageShared) return c.json({ error: 'forbidden' }, 403)

  const id = uuid()
  const isDefault = body?.is_default ? 1 : 0
  const ownerId = shared ? null : user.id
  if (isDefault) {
    if (ownerId) {
      await c.env.DB.prepare(
        `UPDATE email_signatures SET is_default = 0 WHERE owner_user_id = ?`,
      ).bind(ownerId).run()
    } else {
      await c.env.DB.prepare(
        `UPDATE email_signatures SET is_default = 0 WHERE owner_user_id IS NULL`,
      ).run()
    }
  }
  await c.env.DB.prepare(
    `INSERT INTO email_signatures (id, name, slug, kind, html, owner_user_id, is_default, sort_order)
     VALUES (?, ?, NULL, ?, ?, ?, ?, 100)`,
  ).bind(id, name, kind, html, ownerId, isDefault).run()

  const row = await loadSignatureRow(c.env, id)
  return c.json({ signature: row }, 201)
})

emailSignatureRoutes.patch('/email-signatures/:id', async (c) => {
  const user = c.get('user')
  const row = await c.env.DB.prepare(`SELECT * FROM email_signatures WHERE id = ?`).bind(c.req.param('id')).first<any>()
  if (!row) return c.json({ error: 'not found' }, 404)
  const isOwner = row.owner_user_id === user.id
  const isShared = !row.owner_user_id
  const canManageShared = await canManageRoster(c.env, user)
  if (isShared && !canManageShared) return c.json({ error: 'forbidden' }, 403)
  if (!isShared && !isOwner && !canManageShared) return c.json({ error: 'forbidden' }, 403)

  const body = await c.req.json<any>().catch(() => null)
  const person = readPerson(body)
  let html = body?.html != null ? clean(body.html, 20_000) : row.html
  let name = body?.name != null ? clean(body.name, 80) : row.name
  if (person && (row.kind === 'personal' || row.kind === 'support')) {
    html = brandedSignatureHtml(row.kind, person)
    if (person.name) name = person.name
  }
  if (!name) return c.json({ error: 'name required' }, 400)
  if (!html) return c.json({ error: 'html required' }, 400)
  const isDefault = body?.is_default == null ? row.is_default : (body.is_default ? 1 : 0)

  if (isDefault) {
    if (row.owner_user_id) {
      await c.env.DB.prepare(
        `UPDATE email_signatures SET is_default = 0 WHERE owner_user_id = ? AND id != ?`,
      ).bind(row.owner_user_id, row.id).run()
    } else {
      await c.env.DB.prepare(
        `UPDATE email_signatures SET is_default = 0 WHERE owner_user_id IS NULL AND id != ?`,
      ).bind(row.id).run()
    }
  }

  await c.env.DB.prepare(
    `UPDATE email_signatures SET name = ?, html = ?, is_default = ?, updated_at = datetime('now') WHERE id = ?`,
  ).bind(name, html, isDefault, row.id).run()
  if (person && row.kind === 'personal' && row.owner_user_id) {
    await c.env.DB.prepare(
      `UPDATE team_members SET title = ?, signature_html = ? WHERE user_id = ?`,
    ).bind((person.title || '').trim() || null, html, row.owner_user_id).run()
  }
  const next = await loadSignatureRow(c.env, row.id)
  return c.json({ signature: next })
})

emailSignatureRoutes.delete('/email-signatures/:id', async (c) => {
  const user = c.get('user')
  const row = await c.env.DB.prepare(`SELECT * FROM email_signatures WHERE id = ?`).bind(c.req.param('id')).first<any>()
  if (!row) return c.json({ error: 'not found' }, 404)
  if (row.slug && PROTECTED_SLUGS.has(row.slug) && !row.owner_user_id) {
    return c.json({ error: 'default signatures cannot be deleted' }, 400)
  }
  if (row.kind === 'personal' && row.owner_user_id === user.id) {
    return c.json({ error: 'your personal signature cannot be deleted' }, 400)
  }
  const canManageShared = await canManageRoster(c.env, user)
  const isOwner = row.owner_user_id === user.id
  if (!isOwner && !canManageShared) return c.json({ error: 'forbidden' }, 403)
  await c.env.DB.prepare(`DELETE FROM email_signatures WHERE id = ?`).bind(row.id).run()
  return c.json({ ok: true })
})
