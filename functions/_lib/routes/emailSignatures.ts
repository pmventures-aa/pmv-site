import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { uuid } from '../crypto'
import { hasCapability } from '../capabilities'
import {
  brandedSignatureHtml,
  letterheadTemplates,
  listSignaturesForUser,
  type SignatureKind,
} from '../emailSignatures'

export const emailSignatureRoutes = new Hono<AppEnv>()
emailSignatureRoutes.use('*', requireStaff)

const KINDS = new Set<SignatureKind>(['company', 'personal', 'support', 'custom'])
const SHARED_KINDS = new Set<SignatureKind>(['company', 'support'])
const PROTECTED_SLUGS = new Set(['company', 'pmv-support'])

const clean = (v: unknown, n: number) => typeof v === 'string' ? v.trim().slice(0, n) : ''

emailSignatureRoutes.get('/email-signatures', async (c) => {
  const user = c.get('user')
  const signatures = await listSignaturesForUser(c.env, user)
  return c.json({ signatures, templates: letterheadTemplates(user) })
})

emailSignatureRoutes.post('/email-signatures', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  const name = clean(body?.name, 80)
  if (!name) return c.json({ error: 'name required' }, 400)
  const kind = (clean(body?.kind, 20) || 'custom') as SignatureKind
  if (!KINDS.has(kind)) return c.json({ error: 'invalid kind' }, 400)
  const html = clean(body?.html, 20_000) || brandedSignatureHtml(kind, {
    name: user.full_name,
    email: user.email,
  })
  const canManageShared = await hasCapability(c.env, user, 'can_manage_communications')
    || await hasCapability(c.env, user, 'can_manage_settings')
    || user.role === 'admin'
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

  const row = await c.env.DB.prepare(`SELECT * FROM email_signatures WHERE id = ?`).bind(id).first()
  return c.json({ signature: row }, 201)
})

emailSignatureRoutes.patch('/email-signatures/:id', async (c) => {
  const user = c.get('user')
  const row = await c.env.DB.prepare(`SELECT * FROM email_signatures WHERE id = ?`).bind(c.req.param('id')).first<any>()
  if (!row) return c.json({ error: 'not found' }, 404)
  const isOwner = row.owner_user_id === user.id
  const isShared = !row.owner_user_id
  const canManageShared = await hasCapability(c.env, user, 'can_manage_communications')
    || await hasCapability(c.env, user, 'can_manage_settings')
    || user.role === 'admin'
  if (isShared && !canManageShared) return c.json({ error: 'forbidden' }, 403)
  if (!isShared && !isOwner && !canManageShared) return c.json({ error: 'forbidden' }, 403)

  const body = await c.req.json<any>().catch(() => null)
  const name = body?.name != null ? clean(body.name, 80) : row.name
  if (!name) return c.json({ error: 'name required' }, 400)
  const html = body?.html != null ? clean(body.html, 20_000) : row.html
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
  const next = await c.env.DB.prepare(`SELECT * FROM email_signatures WHERE id = ?`).bind(row.id).first()
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
  const canManageShared = await hasCapability(c.env, user, 'can_manage_communications')
    || await hasCapability(c.env, user, 'can_manage_settings')
    || user.role === 'admin'
  const isOwner = row.owner_user_id === user.id
  if (!isOwner && !canManageShared) return c.json({ error: 'forbidden' }, 403)
  await c.env.DB.prepare(`DELETE FROM email_signatures WHERE id = ?`).bind(row.id).run()
  return c.json({ ok: true })
})
