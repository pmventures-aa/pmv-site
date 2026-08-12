import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { requireOwner, requireUser } from '../mid'
import { uuid } from '../crypto'
import { getRawOwnerFromCookie } from '../session'
import { logActivity } from '../activity'

export const impersonationRoutes = new Hono<AppEnv>()

const IMPERSONATION_TTL_MINUTES = 45
const clean = (v: unknown, n: number) => typeof v === 'string' ? v.trim().slice(0, n) : ''

// Cookie helper - we need the raw token to key the KV `impersonate:<token>`
// record against the owner's session.
function cookieToken(request: Request): string | null {
  const cookie = request.headers.get('Cookie') ?? ''
  const match = cookie.match(/pmv_session=([^;]+)/)
  return match?.[1] || null
}

async function logImpersonationEvent(env: Env, sessionId: string, action: string, extra?: { path?: string; method?: string; status_code?: number; detail?: unknown }) {
  try {
    await env.DB.prepare(
      `INSERT INTO impersonation_events (id, impersonation_session_id, action, path, method, status_code, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(uuid(), sessionId, action, extra?.path ?? null, extra?.method ?? null, extra?.status_code ?? null,
      extra?.detail ? JSON.stringify(extra.detail).slice(0, 2000) : null).run()
  } catch (err) { console.error('[impersonation] event log failed', err) }
}

// POST /admin/impersonate  { target_user_id, reason }
impersonationRoutes.post('/impersonate', requireOwner, async (c) => {
  const owner = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  const targetUserId = clean(body?.target_user_id, 40)
  const reason = clean(body?.reason, 500)
  if (!targetUserId) return c.json({ error: 'target_user_id required' }, 400)
  if (reason.length < 8) return c.json({ error: 'reason required (min 8 chars)' }, 400)
  if (targetUserId === owner.id) return c.json({ error: 'cannot impersonate yourself' }, 400)

  const target = await c.env.DB.prepare(`SELECT id,email,role,status FROM users WHERE id = ?`).bind(targetUserId).first<any>()
  if (!target || target.status !== 'active') return c.json({ error: 'target not found or inactive' }, 404)

  const token = cookieToken(c.req.raw)
  if (!token) return c.json({ error: 'no active session' }, 400)

  // End any prior impersonation on this same cookie first so KV state stays sane.
  const priorId = await c.env.SESSIONS.get(`impersonate:${token}`)
  if (priorId) {
    await c.env.DB.prepare(
      `UPDATE impersonation_sessions SET ended_at = COALESCE(ended_at, datetime('now')), ended_reason = COALESCE(ended_reason, 'superseded') WHERE id = ?`
    ).bind(priorId).run().catch(() => undefined)
    await c.env.SESSIONS.delete(`impersonate:${token}`)
  }

  const sessionId = uuid()
  const ip = c.req.header('CF-Connecting-IP') || null
  const userAgent = c.req.header('User-Agent') || null
  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MINUTES * 60_000).toISOString().replace('T', ' ').slice(0, 19)

  await c.env.DB.prepare(
    `INSERT INTO impersonation_sessions (id, owner_user_id, target_user_id, reason, ip, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(sessionId, owner.id, targetUserId, reason, ip, userAgent, expiresAt).run()

  // Bind the impersonation to the owner's cookie via KV. TTL matches so
  // KV eviction acts as a safety-net timeout.
  await c.env.SESSIONS.put(`impersonate:${token}`, sessionId, { expirationTtl: IMPERSONATION_TTL_MINUTES * 60 })

  await logImpersonationEvent(c.env, sessionId, 'started', { detail: { reason, target_email: target.email, target_role: target.role } })
  try {
    await logActivity(c.env, {
      actorUserId: owner.id,
      kind: 'impersonation.started',
      detail: { impersonation_session_id: sessionId, target_user_id: targetUserId, target_email: target.email, reason },
    })
  } catch {}

  return c.json({
    ok: true,
    impersonation_session_id: sessionId,
    target: { id: target.id, email: target.email, role: target.role },
    expires_at: expiresAt,
  }, 201)
})

// POST /admin/impersonate/end
// This endpoint bypasses requireOwner because the SessionUser returned by
// getUser during impersonation is the TARGET, not the owner. We look up
// the owner from the cookie directly, confirm the impersonation binding,
// and end it.
impersonationRoutes.post('/impersonate/end', requireUser, async (c) => {
  const token = cookieToken(c.req.raw)
  if (!token) return c.json({ error: 'no active session' }, 400)
  const sessionId = await c.env.SESSIONS.get(`impersonate:${token}`)
  if (!sessionId) return c.json({ ok: true, note: 'no impersonation active' })
  const impersonated = c.get('user')
  await c.env.DB.prepare(
    `UPDATE impersonation_sessions SET ended_at = COALESCE(ended_at, datetime('now')), ended_reason = COALESCE(ended_reason, 'manual') WHERE id = ?`
  ).bind(sessionId).run().catch(() => undefined)
  await c.env.SESSIONS.delete(`impersonate:${token}`)
  await logImpersonationEvent(c.env, sessionId, 'ended', { detail: { ended_reason: 'manual', target_id: impersonated.id } })
  try {
    await logActivity(c.env, {
      actorUserId: impersonated.impersonated_by_user_id || null,
      kind: 'impersonation.ended',
      detail: { impersonation_session_id: sessionId, target_user_id: impersonated.id, ended_reason: 'manual' },
    })
  } catch {}
  return c.json({ ok: true })
})

// GET /admin/impersonate/status - probe from the frontend to render the banner.
impersonationRoutes.get('/impersonate/status', requireUser, async (c) => {
  const user = c.get('user')
  if (!user.impersonation_session_id) return c.json({ active: false })
  const raw = await getRawOwnerFromCookie(c.env, c.req.raw)
  const row = await c.env.DB.prepare(
    `SELECT id, owner_user_id, target_user_id, reason, started_at, expires_at,
            (SELECT email FROM users WHERE id = owner_user_id) owner_email,
            (SELECT full_name FROM users WHERE id = owner_user_id) owner_name
     FROM impersonation_sessions WHERE id = ?`
  ).bind(user.impersonation_session_id).first<any>()
  return c.json({
    active: true,
    session_id: user.impersonation_session_id,
    owner_email: row?.owner_email || raw?.owner.email,
    owner_name: row?.owner_name || raw?.owner.full_name,
    target_email: user.email,
    target_name: user.full_name,
    reason: row?.reason,
    started_at: row?.started_at,
    expires_at: row?.expires_at,
  })
})

// GET /admin/impersonate/history?target_user_id=... - audit surface for owners.
impersonationRoutes.get('/impersonate/history', requireOwner, async (c) => {
  const targetId = c.req.query('target_user_id')
  const clauses: string[] = []
  const params: any[] = []
  if (targetId) { clauses.push('target_user_id = ?'); params.push(targetId) }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.owner_user_id, s.target_user_id, s.reason, s.ip, s.user_agent,
            s.started_at, s.expires_at, s.ended_at, s.ended_reason,
            (SELECT full_name FROM users WHERE id = s.owner_user_id) owner_name,
            (SELECT email FROM users WHERE id = s.owner_user_id) owner_email,
            (SELECT full_name FROM users WHERE id = s.target_user_id) target_name,
            (SELECT email FROM users WHERE id = s.target_user_id) target_email,
            (SELECT COUNT(*) FROM impersonation_events WHERE impersonation_session_id = s.id) event_count,
            (SELECT COUNT(*) FROM impersonation_events WHERE impersonation_session_id = s.id AND action = 'blocked') blocked_count
     FROM impersonation_sessions s ${where}
     ORDER BY s.started_at DESC LIMIT 200`
  ).bind(...params).all()
  return c.json({ sessions: (rows.results as any[]) || [] })
})

impersonationRoutes.get('/impersonate/history/:id/events', requireOwner, async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, action, path, method, status_code, detail, created_at
     FROM impersonation_events WHERE impersonation_session_id = ? ORDER BY created_at DESC LIMIT 500`
  ).bind(c.req.param('id')).all()
  return c.json({ events: (rows.results as any[]) || [] })
})
