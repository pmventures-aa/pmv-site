import type { Env, SessionUser } from './types'
import { uuid } from './crypto'

const COOKIE = 'pmv_session'
const TTL_SECONDS = 60 * 60 * 12 // 12h

export async function createSession(env: Env, user: SessionUser): Promise<string> {
  const token = uuid()
  await Promise.all([
    env.SESSIONS.put(`sess:${token}`, JSON.stringify(user), { expirationTtl: TTL_SECONDS }),
    env.SESSIONS.put(`usess:${user.id}:${token}`, '1', { expirationTtl: TTL_SECONDS }),
  ])
  return token
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${TTL_SECONDS}`
}

export function clearCookie(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}

export async function getUser(env: Env, request: Request): Promise<SessionUser | null> {
  const cookie = request.headers.get('Cookie') ?? ''
  const m = cookie.match(new RegExp(`${COOKIE}=([^;]+)`))
  if (!m) return null
  const token = m[1]
  const raw = await env.SESSIONS.get(`sess:${token}`)
  if (!raw) return null

  let cached: SessionUser
  try { cached = JSON.parse(raw) as SessionUser } catch {
    await env.SESSIONS.delete(`sess:${token}`)
    return null
  }

  // KV is only the session carrier. D1 remains authoritative for whether the
  // identity still exists, is active, and still has the same account role.
  // This closes the stale-session gap after an account is deleted even if an
  // external cleanup process cannot directly enumerate/delete KV keys.
  const live = await env.DB.prepare(
    `SELECT id,email,role,full_name,first_name,last_name,status FROM users WHERE id=?`,
  ).bind(cached.id).first<any>()
  if (!live || live.status !== 'active' || live.role !== cached.role || live.email !== cached.email) {
    await Promise.all([
      env.SESSIONS.delete(`sess:${token}`),
      env.SESSIONS.delete(`usess:${cached.id}:${token}`),
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
  await touchLastSeen(env, user.id)
  return user
}

const LAST_SEEN_THROTTLE_SECONDS = 5 * 60
async function touchLastSeen(env: Env, userId: string): Promise<void> {
  const key = `lastseen:${userId}`
  const marker = await env.SESSIONS.get(key)
  if (marker) return
  await Promise.all([
    env.SESSIONS.put(key, '1', { expirationTtl: LAST_SEEN_THROTTLE_SECONDS }),
    env.DB.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").bind(userId).run(),
  ])
}

export async function destroySession(env: Env, request: Request): Promise<void> {
  const cookie = request.headers.get('Cookie') ?? ''
  const m = cookie.match(new RegExp(`${COOKIE}=([^;]+)`))
  if (!m) return
  const token = m[1]
  const raw = await env.SESSIONS.get(`sess:${token}`)
  const user = raw ? (JSON.parse(raw) as SessionUser) : null
  await Promise.all([
    env.SESSIONS.delete(`sess:${token}`),
    user ? env.SESSIONS.delete(`usess:${user.id}:${token}`) : Promise.resolve(),
  ])
}

export async function revokeUserSessions(env: Env, userId: string): Promise<void> {
  const prefix = `usess:${userId}:`
  const list = await env.SESSIONS.list({ prefix })
  await Promise.all(
    list.keys.flatMap((k) => {
      const token = k.name.slice(prefix.length)
      return [env.SESSIONS.delete(`sess:${token}`), env.SESSIONS.delete(k.name)]
    }),
  )
}

const ACTIVATION_TTL_SECONDS = 60 * 60 * 24 // 24h

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
