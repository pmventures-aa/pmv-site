import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { uuid } from '../crypto'
import { activityInsert } from '../activity'
import { notifyStaff, escapeHtml } from '../email'
import { icsResponse, loadFeedAppointments, userIdForCalendarFeedToken } from '../calendarFeed'
import type { SessionUser } from '../types'
import { getAnotherBriefingQuote, getBriefingQuote } from '../briefingQuotes'

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
    website?: string // honeypot — real visitors never see or fill this field
  }>().catch(() => null)
  if (!body) return c.json({ error: 'invalid request body' }, 400)

  // Report success without ever writing the row, so bots get no signal
  // their submission was rejected and don't adapt.
  if (typeof body.website === 'string' && body.website.trim()) {
    return c.json({ ok: true }, 201)
  }

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

  let resolvedServiceKey = serviceKey
  if (serviceKey) {
    const svc = await c.env.DB.prepare('SELECT key FROM services WHERE key = ? AND active = 1').bind(serviceKey).first()
    if (!svc) resolvedServiceKey = null
  }

  const inquiryId = uuid()
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO contact_inquiries (id, name, email, phone, service_key, message) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(inquiryId, name, email, phone, resolvedServiceKey, message),
    activityInsert(c.env, { kind: 'inquiry_submitted', detail: { name, email, service_key: resolvedServiceKey } }),
  ])

  // No specific staff own an unassigned inquiry yet — always falls back to
  // the firm-wide notify address. Best-effort: never blocks the response.
  c.executionCtx.waitUntil(
    notifyStaff(c.env, {
      staffUserIds: [],
      kind: 'inquiry_submitted',
      subject: `New inquiry: ${name}`,
      html: `<p><strong>${escapeHtml(name)}</strong> (${escapeHtml(email)}${phone ? `, ${escapeHtml(phone)}` : ''}) submitted a new inquiry${resolvedServiceKey ? ` about ${escapeHtml(resolvedServiceKey)}` : ''}:</p><p>${escapeHtml(message)}</p>`,
    }),
  )

  return c.json({ ok: true }, 201)
})

publicRoutes.get('/calendar-feed/:token', async (c) => {
  const token = c.req.param('token') || ''
  const userId = await userIdForCalendarFeedToken(c.env.DB, token)
  if (!userId) return c.json({ error: 'invalid calendar link' }, 404)
  const user = await c.env.DB.prepare(
    'SELECT id, email, role, full_name, status FROM users WHERE id = ?',
  ).bind(userId).first<SessionUser & { status: string }>()
  if (!user || user.status === 'suspended') return c.json({ error: 'invalid calendar link' }, 404)
  const events = await loadFeedAppointments(c.env, user)
  return icsResponse(events, 'Pinnacle')
})

publicRoutes.get('/briefing-quote', async (c) => {
  const seed = (c.req.query('seed') || '').trim()
  const quote = await getBriefingQuote(c.env, seed)
  return c.json({ quote })
})

publicRoutes.get('/briefing-quote/another', async (c) => {
  const seed = (c.req.query('seed') || '').trim()
  const current = (c.req.query('current') || '').trim()
  const quote = await getAnotherBriefingQuote(c.env, current, seed)
  return c.json({ quote })
})
