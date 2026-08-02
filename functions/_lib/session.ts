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

// ---------- one-time account-activation tokens (KV-backed) ----------
// Used to let a newly created account (bootstrap admin, or any future
// admin-invited user with no initial password) set its own password via a
// link, instead of the system generating/emailing a password. Single-use:
// consumeActivationToken deletes the KV entry on first successful read.
const ACTIVATION_TTL_SECONDS = 60 * 60 * 48 // 48h

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  // base64url, no padding — safe to put directly in a URL query string
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function createActivationToken(env: Env, userId: string): Promise<string> {
  const token = randomToken()
  await env.SESSIONS.put(`activate:${token}`, userId, { expirationTtl: ACTIVATION_TTL_SECONDS })
  return token
}

export async function consumeActivationToken(env: Env, token: string): Promise<string | null> {
  const userId = await env.SESSIONS.get(`activate:${token}`)
  if (!userId) return null
  await env.SESSIONS.delete(`activate:${token}`)
  return userId
}
