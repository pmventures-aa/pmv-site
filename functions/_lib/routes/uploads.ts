import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireUser } from '../mid'
import { canAccessClient } from '../scope'
import { uuid } from '../crypto'
import { logActivity } from '../activity'

export const uploadRoutes = new Hono<AppEnv>()

const MAX_AVATAR_BYTES = 3 * 1024 * 1024 // 3MB
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

async function storeAvatar(env: AppEnv['Bindings'], userId: string, req: Request): Promise<{ error: string; status: number } | { key: string }> {
  if (!env.UPLOADS) return { error: 'photo uploads are not configured yet', status: 503 }

  const contentType = req.headers.get('Content-Type') || ''
  const ext = ALLOWED_TYPES[contentType]
  if (!ext) return { error: 'unsupported image type — use PNG, JPEG, or WebP', status: 400 }

  const body = await req.arrayBuffer()
  if (body.byteLength === 0) return { error: 'empty upload', status: 400 }
  if (body.byteLength > MAX_AVATAR_BYTES) return { error: 'image too large — 3MB max', status: 413 }

  const key = `avatars/${userId}/${uuid()}.${ext}`
  await env.UPLOADS.put(key, body, { httpMetadata: { contentType } })

  // Best-effort cleanup of the previous image so storage doesn't grow unbounded.
  const prev = await env.DB.prepare('SELECT avatar_key FROM users WHERE id = ?').bind(userId).first<{ avatar_key: string | null }>()
  await env.DB.prepare('UPDATE users SET avatar_key = ? WHERE id = ?').bind(key, userId).run()
  if (prev?.avatar_key) await env.UPLOADS.delete(prev.avatar_key).catch(() => {})

  return { key }
}

// Any signed-in user (client, staff, admin) sets their own avatar.
uploadRoutes.post('/me/avatar', requireUser, async (c) => {
  const user = c.get('user')
  const result = await storeAvatar(c.env, user.id, c.req.raw)
  if ('error' in result) return c.json({ error: result.error }, result.status as any)
  return c.json({ ok: true, key: result.key })
})

// Staff/admin sets a CLIENT's avatar on their behalf (e.g. during onboarding).
// Scoped like every other client-touching admin action — a staff member
// needs an assignment to this client, or to be a real admin.
uploadRoutes.post('/admin/clients/:id/avatar', requireUser, async (c) => {
  const user = c.get('user')
  if (user.role === 'client') return c.json({ error: 'forbidden' }, 403)
  const clientId = c.req.param('id') ?? ''
  const ok = await canAccessClient(c.env, user, clientId)
  if (!ok) return c.json({ error: 'forbidden' }, 403)

  const result = await storeAvatar(c.env, clientId, c.req.raw)
  if ('error' in result) return c.json({ error: result.error }, result.status as any)
  await logActivity(c.env, { actorUserId: user.id, clientUserId: clientId, kind: 'avatar_updated', detail: {} })
  return c.json({ ok: true, key: result.key })
})

// Public (no auth) — avatars aren't sensitive, and an <img src> can't send
// cookies cross-origin between the hq./client. subdomains anyway. Keyed by
// user id, same exposure level as every /admin/clients/:id URL already has.
uploadRoutes.get('/avatar/:userId', async (c) => {
  if (!c.env.UPLOADS) return c.json({ error: 'not found' }, 404)
  const userId = c.req.param('userId')
  const row = await c.env.DB.prepare('SELECT avatar_key FROM users WHERE id = ?').bind(userId).first<{ avatar_key: string | null }>()
  if (!row?.avatar_key) return c.json({ error: 'not found' }, 404)
  const obj = await c.env.UPLOADS.get(row.avatar_key)
  if (!obj) return c.json({ error: 'not found' }, 404)
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      // Short cache, not immutable — this URL is keyed by user id, not by
      // the underlying (versioned) R2 key, so it must reflect a re-upload
      // within a few minutes rather than caching the old photo forever.
      'Cache-Control': 'public, max-age=300',
    },
  })
})

// Public (no auth) — inline images embedded in Communications Center
// emails. Recipients' mail clients fetch these directly with no session,
// same reasoning as /avatar/:userId above. Keyed by a random per-upload
// filename (comms/<uuid>.<ext> in R2), so this one IS safe to cache
// immutably, unlike the avatar route.
uploadRoutes.get('/comms-images/:file', async (c) => {
  if (!c.env.UPLOADS) return c.json({ error: 'not found' }, 404)
  const file = c.req.param('file')
  if (!/^[a-zA-Z0-9-]+\.(png|jpe?g|webp|gif)$/.test(file)) return c.json({ error: 'not found' }, 404)
  const obj = await c.env.UPLOADS.get(`comms/${file}`)
  if (!obj) return c.json({ error: 'not found' }, 404)
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
})
