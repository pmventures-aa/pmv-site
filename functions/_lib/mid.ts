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
