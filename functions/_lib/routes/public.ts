import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { uuid } from '../crypto'

const CONTACT_MAX_PER_HOUR = 10

export const publicRoutes = new Hono<AppEnv>()

async function contactThrottled(env: AppEnv['Bindings'], ip: string): Promise<boolean> {
  const k = `contact:${ip}`
  const cur = parseInt((await env.SESSIONS.get(k)) || '0', 10)
  if (cur >= CONTACT_MAX_PER_HOUR) return true
  await env.SESSIONS.put(k, String(cur + 1), { expirationTtl: 3600 })
  return false
}

publicRoutes.post('/contact', async (c) => {
  const body = await c.req.json<{
    name: string
    email: string
    phone?: string
    service_key?: string
    message: string
  }>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request body' }, 400)

  const name = (body.name || '').trim().slice(0, 200)
  const email = (body.email || '').trim().toLowerCase().slice(0, 200)
  const message = (body.message || '').trim().slice(0, 4000)
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : null
  const serviceKey = typeof body.service_key === 'string' && body.service_key ? body.service_key : null

  if (!name) return c.json({ error: 'name is required' }, 400)
  if (!email || !email.includes('@')) return c.json({ error: 'a valid email is required' }, 400)
  if (!message) return c.json({ error: 'please tell us what you need help with' }, 400)

  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  if (await contactThrottled(c.env, ip)) {
    return c.json({ error: 'too many requests — try again later or email us directly' }, 429)
  }

  if (serviceKey) {
    const svc = await c.env.DB.prepare('SELECT key FROM services WHERE key = ? AND active = 1').bind(serviceKey).first()
    if (!svc) {
      await c.env.DB.prepare(
        `INSERT INTO contact_inquiries (id, name, email, phone, service_key, message) VALUES (?, ?, ?, ?, NULL, ?)`,
      ).bind(uuid(), name, email, phone, message).run()
      return c.json({ ok: true }, 201)
    }
  }

  await c.env.DB.prepare(
    `INSERT INTO contact_inquiries (id, name, email, phone, service_key, message) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(uuid(), name, email, phone, serviceKey, message).run()

  return c.json({ ok: true }, 201)
})
