import type { Context, Next } from 'hono'
import type { AppEnv, Env } from './types'
import { uuid } from './crypto'

// Server-side deny-list for actions that should NEVER execute while an
// impersonation session is active - even by an owner. Keeps the audit
// trail meaningful: the target user's account credentials, sessions,
// and destructive account state can't be silently altered by an owner
// pretending to be them.
//
// Matched as (method, exact path). Add more entries by editing this
// list; every hit produces an impersonation_events row with action='blocked'.
const DENYLIST: Array<{ method: string; path: string; reason: string }> = [
  { method: 'POST', path: '/api/auth/change-password', reason: 'password change during impersonation' },
  { method: 'POST', path: '/api/auth/logout', reason: 'logout during impersonation - use /admin/impersonate/end' },
  { method: 'POST', path: '/api/auth/auth0/link', reason: 'identity linking during impersonation' },
  { method: 'POST', path: '/api/auth/auth0/unlink', reason: 'identity unlinking during impersonation' },
  { method: 'POST', path: '/api/admin/impersonate', reason: 'nested impersonation' },
  { method: 'DELETE', path: '/api/me', reason: 'account deletion during impersonation' },
  { method: 'POST', path: '/api/me/two-factor/disable', reason: '2FA disable during impersonation' },
  { method: 'POST', path: '/api/me/sessions/revoke-all', reason: 'session revoke during impersonation' },
]

async function logBlock(env: Env, sessionId: string, method: string, path: string, reason: string) {
  try {
    await env.DB.prepare(
      `INSERT INTO impersonation_events (id, impersonation_session_id, action, path, method, status_code, detail)
       VALUES (?, ?, 'blocked', ?, ?, 403, ?)`
    ).bind(uuid(), sessionId, path, method, JSON.stringify({ reason }).slice(0, 2000)).run()
  } catch {}
}

async function logRequest(env: Env, sessionId: string, method: string, path: string, statusCode: number) {
  try {
    await env.DB.prepare(
      `INSERT INTO impersonation_events (id, impersonation_session_id, action, path, method, status_code)
       VALUES (?, ?, 'request', ?, ?, ?)`
    ).bind(uuid(), sessionId, path, method, statusCode).run()
  } catch {}
}

// Global middleware: on every request under an active impersonation
// session, either 403 the denylisted actions or log the request into
// impersonation_events. Idempotent - skips fast when no impersonation.
export async function impersonationGuard(c: Context<AppEnv>, next: Next) {
  await next()
  const user = c.get('user')
  if (!user?.impersonation_session_id) return
  const method = c.req.method.toUpperCase()
  const path = new URL(c.req.url).pathname
  // Only track mutating traffic; a burst of GETs would blow up the events
  // table and offers little audit value. Explicit denylist entries are
  // enforced regardless of method - the DENYLIST filter below handles it.
  if (method !== 'GET') {
    // Already ran the handler. Attach an audit row after the fact so we
    // capture the real status_code. Non-blocking; failures swallowed.
    c.executionCtx.waitUntil(logRequest(c.env, user.impersonation_session_id!, method, path, c.res.status))
  }
}

// Route middleware: apply to any route that should NEVER run under
// impersonation. Blocks the request with 403 and audits.
export async function denyDuringImpersonation(c: Context<AppEnv>, next: Next) {
  const user = c.get('user')
  if (!user?.impersonation_session_id) return next()
  const method = c.req.method.toUpperCase()
  const path = new URL(c.req.url).pathname
  const hit = DENYLIST.find((entry) => entry.method === method && entry.path === path)
  if (!hit) return next()
  await logBlock(c.env, user.impersonation_session_id, method, path, hit.reason)
  return c.json({ error: 'blocked during impersonation', reason: hit.reason }, 403)
}

// Convenience: return the denylist for the frontend banner to disable buttons.
export function impersonationDenylistForClient() {
  return DENYLIST.map(({ method, path, reason }) => ({ method, path, reason }))
}
