import type { Env, SessionUser } from './types'
import { uuid } from './crypto'

const COOKIE = 'pmv_session'
const TTL_SECONDS = 60 * 60 * 12 // 12h

export async function createSession(env: Env, user: SessionUser): Promise<string> {
  const token = uuid()
  await env.SESSIONS.put(`sess:${token}`, JSON.stringify(user), { expirationTtl: TTL_SECONDS })
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
  const raw = await env.SESSIONS.get(`sess:${m[1]}`)
  return raw ? (JSON.parse(raw) as SessionUser) : null
}

export async function destroySession(env: Env, request: Request): Promise<void> {
  const cookie = request.headers.get('Cookie') ?? ''
  const m = cookie.match(new RegExp(`${COOKIE}=([^;]+)`))
  if (m) await env.SESSIONS.delete(`sess:${m[1]}`)
}
