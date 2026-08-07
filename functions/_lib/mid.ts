import type { Context, Next } from 'hono'
import type { AppEnv } from './types'
import { getUser } from './session'

export async function requireUser(c: Context<AppEnv>, next: Next) {
  const user = await getUser(c.env, c.req.raw)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  c.set('user', user)
  await next()
}

export async function requireStaff(c: Context<AppEnv>, next: Next) {
  const user = await getUser(c.env, c.req.raw)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  if (user.role !== 'staff' && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  c.set('user', user)
  await next()
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const user = await getUser(c.env, c.req.raw)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  c.set('user', user)
  await next()
}

// Client-only self-service endpoints (profile, onboarding, self-enrollment).
export async function requireClient(c: Context<AppEnv>, next: Next) {
  const user = await getUser(c.env, c.req.raw)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  if (user.role !== 'client') return c.json({ error: 'client accounts only' }, 403)
  c.set('user', user)
  await next()
}

// Owner accounts only — a strict superset of admin (an Owner is always
// role='admin' AND team_members.is_owner=1). Reserved for the handful of
// actions the spec treats as more sensitive than ordinary admin work:
// permanently deleting a record after it's been archived. Every other
// admin check in this app is untouched by Owner existing at all.
export async function requireOwner(c: Context<AppEnv>, next: Next) {
  const user = await getUser(c.env, c.req.raw)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  const row = await c.env.DB.prepare('SELECT is_owner FROM team_members WHERE user_id = ?').bind(user.id).first<{ is_owner: number }>()
  if (!row?.is_owner) return c.json({ error: 'owner accounts only' }, 403)
  c.set('user', user)
  await next()
}
