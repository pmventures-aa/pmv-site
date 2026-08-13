import type { Env, SessionUser } from './types'
import { uuid } from './crypto'

const COOKIE = 'pmv_session'
const TTL_SECONDS = 60 * 60 * 12
const LAST_SEEN_THROTTLE_SECONDS = 5 * 60
const ACTIVATION_TTL_SECONDS = 60 * 60 * 24
const PASSWORD_RESET_TTL_SECONDS = 30 * 60

function cookieToken(request: Request): string | null {
  const cookie = request.headers.get('Cookie') ?? ''
  const match = cookie.match(new RegExp(`${COOKIE}=([^;]+)`))
  return match?.[1] || null
}

function requestGeo(request?: Request) {
  if (!request) return { city: null, region: null, country: null }
  const cf = (request as unknown as { cf?: Record<string, unknown> }).cf || {}
  const pick = (key: string) => typeof cf[key] === 'string' ? String(cf[key]).slice(0, 120) : null
  return { city: pick('city'), region: pick('region'), country: pick('country') }
}

function deviceLabel(userAgent: string | null): string {
  const ua = userAgent || ''
  const platform = /iPhone/i.test(ua) ? 'iPhone' : /iPad/i.test(ua) ? 'iPad' : /Android/i.test(ua) ? 'Android' : /Macintosh|Mac OS X/i.test(ua) ? 'Mac' : /Windows/i.test(ua) ? 'Windows PC' : /Linux/i.test(ua) ? 'Linux device' : 'Unknown device'
  const browser = /Edg\//i.test(ua) ? 'Edge' : /CriOS|Chrome\//i.test(ua) ? 'Chrome' : /FxiOS|Firefox\//i.test(ua) ? 'Firefox' : /Safari\//i.test(ua) ? 'Safari' : 'Browser'
  return `${browser} on ${platform}`
}

async function recordSession(env: Env, sessionId: string, user: SessionUser, request?: Request) {
  const ua = request?.headers.get('User-Agent') || null
  const ip = request?.headers.get('CF-Connecting-IP') || null
  const geo = requestGeo(request)
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString()
  try {
    await env.DB.prepare(
      `INSERT INTO auth_sessions(id,user_id,device_label,user_agent,ip_address,city,region,country,expires_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
    ).bind(sessionId, user.id, deviceLabel(ua), ua?.slice(0, 1000) || null, ip, geo.city, geo.region, geo.country, expiresAt).run()
  } catch (err) {
    console.error('[session] metadata write failed', err)
  }
}

export async function createSession(env: Env, user: SessionUser, request?: Request): Promise<string> {
  const token = uuid()
  const sessionId = uuid()
  await Promise.all([
    env.SESSIONS.put(`sess:${token}`, JSON.stringify(user), { expirationTtl: TTL_SECONDS }),
    env.SESSIONS.put(`usess:${user.id}:${token}`, '1', { expirationTtl: TTL_SECONDS }),
    env.SESSIONS.put(`sessmeta:${token}`, sessionId, { expirationTtl: TTL_SECONDS }),
    env.SESSIONS.put(`sid:${sessionId}`, token, { expirationTtl: TTL_SECONDS }),
    recordSession(env, sessionId, user, request),
  ])
  return token
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${TTL_SECONDS}`
}

export function clearCookie(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}

export async function currentSessionId(env: Env, request: Request): Promise<string | null> {
  const token = cookieToken(request)
  if (!token) return null
  return env.SESSIONS.get(`sessmeta:${token}`)
}

/** Cheap check used by the global impersonation denylist before getUser(). */
export async function activeImpersonationSessionId(env: Env, request: Request): Promise<string | null> {
  const token = cookieToken(request)
  if (!token) return null
  return env.SESSIONS.get(`impersonate:${token}`)
}

async function touchSession(env: Env, token: string, userId: string, request: Request): Promise<void> {
  const sessionId = await env.SESSIONS.get(`sessmeta:${token}`)
  if (!sessionId) return
  const key = `sessiontouch:${sessionId}`
  const marker = await env.SESSIONS.get(key)
  if (marker) return
  const ua = request.headers.get('User-Agent') || null
  const ip = request.headers.get('CF-Connecting-IP') || null
  const geo = requestGeo(request)
  await Promise.all([
    env.SESSIONS.put(key, '1', { expirationTtl: LAST_SEEN_THROTTLE_SECONDS }),
    env.DB.prepare(
      `UPDATE auth_sessions SET last_seen_at=datetime('now'),device_label=?,user_agent=?,ip_address=?,city=?,region=?,country=?
       WHERE id=? AND user_id=? AND revoked_at IS NULL`,
    ).bind(deviceLabel(ua), ua?.slice(0, 1000) || null, ip, geo.city, geo.region, geo.country, sessionId, userId).run().catch(() => undefined),
    // Presence heartbeat: mirror the touch on the users row so the presence
    // endpoint can compute green/yellow/red without joining across every
    // active session (see migration 0048_user_presence.sql).
    env.DB.prepare("UPDATE users SET last_seen_at=datetime('now') WHERE id=?").bind(userId).run().catch(() => undefined),
  ])
}

export async function getUser(env: Env, request: Request): Promise<SessionUser | null> {
  const token = cookieToken(request)
  if (!token) return null
  const raw = await env.SESSIONS.get(`sess:${token}`)
  if (!raw) return null

  let cached: SessionUser
  try { cached = JSON.parse(raw) as SessionUser } catch {
    await env.SESSIONS.delete(`sess:${token}`)
    return null
  }

  const live = await env.DB.prepare(
    `SELECT id,email,role,full_name,first_name,last_name,status FROM users WHERE id=?`,
  ).bind(cached.id).first<any>()
  if (!live || live.status !== 'active' || live.role !== cached.role || live.email !== cached.email) {
    const sessionId = await env.SESSIONS.get(`sessmeta:${token}`)
    await Promise.all([
      env.SESSIONS.delete(`sess:${token}`),
      env.SESSIONS.delete(`usess:${cached.id}:${token}`),
      env.SESSIONS.delete(`sessmeta:${token}`),
      sessionId ? env.SESSIONS.delete(`sid:${sessionId}`) : Promise.resolve(),
      sessionId ? env.DB.prepare("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,datetime('now')),revoke_reason='account state changed' WHERE id=?").bind(sessionId).run().catch(() => undefined) : Promise.resolve(),
    ])
    return null
  }

  const user: SessionUser = {
    id: live.id,
    email: live.email,
    role: live.role,
    full_name: live.full_name ?? null,
    first_name: live.first_name ?? null,
    last_name: live.last_name ?? null,
  }

  // Impersonation swap: if this cookie has an active impersonation record
  // in KV, load the target user and return that user with the owner's
  // id preserved in impersonated_by_user_id. Auth in every route stays
  // written against `user.id` which is now the target's id.
  const impersonationId = await env.SESSIONS.get(`impersonate:${token}`)
  if (impersonationId) {
    const imp = await env.DB.prepare(
      `SELECT id, owner_user_id, target_user_id, expires_at, ended_at
       FROM impersonation_sessions WHERE id = ?`
    ).bind(impersonationId).first<any>()
    if (imp && !imp.ended_at && new Date(imp.expires_at).getTime() > Date.now() && imp.owner_user_id === user.id) {
      const target = await env.DB.prepare(
        `SELECT id,email,role,full_name,first_name,last_name,status FROM users WHERE id=?`
      ).bind(imp.target_user_id).first<any>()
      if (target && target.status === 'active') {
        const impersonatedUser: SessionUser = {
          id: target.id,
          email: target.email,
          role: target.role,
          full_name: target.full_name ?? null,
          first_name: target.first_name ?? null,
          last_name: target.last_name ?? null,
          impersonated_by_user_id: user.id,
          impersonation_session_id: imp.id,
        }
        // Presence + session heartbeat remains on the OWNER so their
        // real activity graph stays intact; audit log below.
        await touchSession(env, token, user.id, request)
        return impersonatedUser
      }
    }
    // Expired / target invalid / stale KV row - clean it up.
    await env.SESSIONS.delete(`impersonate:${token}`)
  }

  await Promise.all([touchLastSeen(env, user.id), touchSession(env, token, user.id, request)])
  return user
}

// Public helper for impersonation routes - fetches the owner's cached
// SessionUser directly from KV without applying the impersonation swap.
// Used by /admin/impersonate/end so the caller can still be recognized
// as the owner even while their cookie has active impersonation on it.
export async function getRawOwnerFromCookie(env: Env, request: Request): Promise<{ token: string; owner: SessionUser } | null> {
  const token = cookieToken(request)
  if (!token) return null
  const raw = await env.SESSIONS.get(`sess:${token}`)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as SessionUser
    return { token, owner: parsed }
  } catch { return null }
}

async function touchLastSeen(env: Env, userId: string): Promise<void> {
  const key = `lastseen:${userId}`
  const marker = await env.SESSIONS.get(key)
  if (marker) return
  await Promise.all([
    env.SESSIONS.put(key, '1', { expirationTtl: LAST_SEEN_THROTTLE_SECONDS }),
    env.DB.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").bind(userId).run(),
  ])
}

export async function revokeSession(env: Env, sessionId: string, actorUserId?: string | null, reason = 'revoked'): Promise<{ userId: string | null; revoked: boolean }> {
  const row = await env.DB.prepare('SELECT user_id,revoked_at FROM auth_sessions WHERE id=?').bind(sessionId).first<{ user_id: string; revoked_at: string | null }>().catch(() => null)
  if (!row || row.revoked_at) return { userId: row?.user_id || null, revoked: false }
  const token = await env.SESSIONS.get(`sid:${sessionId}`)
  await Promise.all([
    token ? env.SESSIONS.delete(`sess:${token}`) : Promise.resolve(),
    token ? env.SESSIONS.delete(`usess:${row.user_id}:${token}`) : Promise.resolve(),
    token ? env.SESSIONS.delete(`sessmeta:${token}`) : Promise.resolve(),
    env.SESSIONS.delete(`sid:${sessionId}`),
    env.DB.prepare("UPDATE auth_sessions SET revoked_at=datetime('now'),revoked_by_user_id=?,revoke_reason=? WHERE id=? AND revoked_at IS NULL").bind(actorUserId || null, reason.slice(0, 200), sessionId).run(),
  ])
  return { userId: row.user_id, revoked: true }
}

export async function destroySession(env: Env, request: Request): Promise<void> {
  const token = cookieToken(request)
  if (!token) return
  const raw = await env.SESSIONS.get(`sess:${token}`)
  const user = raw ? (() => { try { return JSON.parse(raw) as SessionUser } catch { return null } })() : null
  const sessionId = await env.SESSIONS.get(`sessmeta:${token}`)
  await Promise.all([
    env.SESSIONS.delete(`sess:${token}`),
    user ? env.SESSIONS.delete(`usess:${user.id}:${token}`) : Promise.resolve(),
    env.SESSIONS.delete(`sessmeta:${token}`),
    sessionId ? env.SESSIONS.delete(`sid:${sessionId}`) : Promise.resolve(),
    sessionId ? env.DB.prepare("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,datetime('now')),revoked_by_user_id=?,revoke_reason=COALESCE(revoke_reason,'logout') WHERE id=?").bind(user?.id || null, sessionId).run().catch(() => undefined) : Promise.resolve(),
  ])
}

export async function revokeUserSessions(env: Env, userId: string, actorUserId?: string | null, exceptSessionId?: string | null): Promise<void> {
  const prefix = `usess:${userId}:`
  const list = await env.SESSIONS.list({ prefix })
  await Promise.all(
    list.keys.flatMap((k) => {
      const token = k.name.slice(prefix.length)
      return [
        (async () => {
          const sid = await env.SESSIONS.get(`sessmeta:${token}`)
          if (sid && sid === exceptSessionId) return
          await Promise.all([
            env.SESSIONS.delete(`sess:${token}`),
            env.SESSIONS.delete(k.name),
            env.SESSIONS.delete(`sessmeta:${token}`),
            sid ? env.SESSIONS.delete(`sid:${sid}`) : Promise.resolve(),
            sid ? env.DB.prepare("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,datetime('now')),revoked_by_user_id=?,revoke_reason='bulk revoke' WHERE id=?").bind(actorUserId || null, sid).run().catch(() => undefined) : Promise.resolve(),
          ])
        })(),
      ]
    }),
  )
  try {
    if (exceptSessionId) {
      await env.DB.prepare("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,datetime('now')),revoked_by_user_id=?,revoke_reason='bulk revoke' WHERE user_id=? AND revoked_at IS NULL AND id<>?").bind(actorUserId || null, userId, exceptSessionId).run()
    } else {
      await env.DB.prepare("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,datetime('now')),revoked_by_user_id=?,revoke_reason='bulk revoke' WHERE user_id=? AND revoked_at IS NULL").bind(actorUserId || null, userId).run()
    }
  } catch { /* rolling migration safety */ }
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function createActivationToken(env: Env, userId: string): Promise<string> {
  const reverseKey = `activate-user:${userId}`
  const previous = await env.SESSIONS.get(reverseKey)
  if (previous) await env.SESSIONS.delete(`activate:${previous}`)
  const token = randomToken()
  await Promise.all([
    env.SESSIONS.put(`activate:${token}`, userId, { expirationTtl: ACTIVATION_TTL_SECONDS }),
    env.SESSIONS.put(reverseKey, token, { expirationTtl: ACTIVATION_TTL_SECONDS }),
  ])
  return token
}

export async function consumeActivationToken(env: Env, token: string): Promise<string | null> {
  const userId = await env.SESSIONS.get(`activate:${token}`)
  if (!userId) return null
  const reverseKey = `activate-user:${userId}`
  const current = await env.SESSIONS.get(reverseKey)
  await Promise.all([
    env.SESSIONS.delete(`activate:${token}`),
    current === token ? env.SESSIONS.delete(reverseKey) : Promise.resolve(),
  ])
  return userId
}

export async function createPasswordResetToken(env: Env, userId: string): Promise<string> {
  const reverseKey = `pwreset-user:${userId}`
  const previous = await env.SESSIONS.get(reverseKey)
  if (previous) await env.SESSIONS.delete(`pwreset:${previous}`)
  const token = randomToken()
  await Promise.all([
    env.SESSIONS.put(`pwreset:${token}`, userId, { expirationTtl: PASSWORD_RESET_TTL_SECONDS }),
    env.SESSIONS.put(reverseKey, token, { expirationTtl: PASSWORD_RESET_TTL_SECONDS }),
  ])
  return token
}

export async function consumePasswordResetToken(env: Env, token: string): Promise<string | null> {
  const userId = await env.SESSIONS.get(`pwreset:${token}`)
  if (!userId) return null
  const reverseKey = `pwreset-user:${userId}`
  const current = await env.SESSIONS.get(reverseKey)
  await Promise.all([
    env.SESSIONS.delete(`pwreset:${token}`),
    current === token ? env.SESSIONS.delete(reverseKey) : Promise.resolve(),
  ])
  return userId
}
