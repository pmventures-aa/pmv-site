import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireClient } from '../mid'
import { uuid } from '../crypto'

// Self-service endpoints for the authenticated client: profile + dynamic onboarding.
//
// requireClient is applied per-route (not via a top-level `.use('*', ...)`) because
// this sub-app and portalRoutes are both mounted at the same base path ('/portal' —
// see functions/api/[[route]].ts). A blanket wildcard middleware here would run for
// ANY /portal/* request — including ones only portalRoutes defines a handler for
// (e.g. /portal/matters) — and 403 every staff/admin request before portalRoutes
// ever got a chance to handle it.
export const selfRoutes = new Hono<AppEnv>()

// ---------- profile ----------
selfRoutes.get('/profile', requireClient, async (c) => {
  const user = c.get('user')
  const profile = await c.env.DB.prepare('SELECT * FROM client_profiles WHERE user_id = ?').bind(user.id).first()
  return c.json({ profile })
})

selfRoutes.patch('/profile', requireClient, async (c) => {
  const user = c.get('user')
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>))
  const fields: Record<string, string | null> = {}
  for (const key of ['business_name', 'entity_type', 'ein', 'state'] as const) {
    if (typeof body[key] === 'string') fields[key] = (body[key] as string).trim().slice(0, 200)
  }
  const cols = Object.keys(fields)
  if (cols.length === 0) return c.json({ error: 'no valid fields supplied' }, 400)
  const setClause = cols.map((k) => `${k} = ?`).join(', ')
  await c.env.DB.prepare(`UPDATE client_profiles SET ${setClause} WHERE user_id = ?`)
    .bind(...cols.map((k) => fields[k]), user.id)
    .run()
  return c.json({ ok: true })
})

// ---------- services catalog ----------
selfRoutes.get('/services-catalog', requireClient, async (c) => {
  const res = await c.env.DB.prepare('SELECT * FROM services WHERE active = 1 ORDER BY sort_order').all()
  return c.json({ services: res.results ?? [] })
})

// current client's enrolled/requested services
selfRoutes.get('/services', requireClient, async (c) => {
  const user = c.get('user')
  const res = await c.env.DB.prepare(
    `SELECT cs.*, s.name, s.description, s.category
     FROM client_services cs JOIN services s ON s.key = cs.service_key
     WHERE cs.client_user_id = ? ORDER BY cs.created_at DESC`,
  ).bind(user.id).all()
  return c.json({ services: res.results ?? [] })
})

// self-enroll in an additional service after onboarding
selfRoutes.post('/services', requireClient, async (c) => {
  const user = c.get('user')
  const { service_key } = await c.req.json<{ service_key: string }>().catch(() => ({ service_key: '' }))
  if (!service_key) return c.json({ error: 'service_key is required' }, 400)
  const svc = await c.env.DB.prepare('SELECT key FROM services WHERE key = ? AND active = 1').bind(service_key).first()
  if (!svc) return c.json({ error: 'unknown service' }, 404)
  await c.env.DB.prepare(
    `INSERT INTO client_services (id, client_user_id, service_key, status)
     VALUES (?, ?, ?, 'requested')
     ON CONFLICT(client_user_id, service_key) DO NOTHING`,
  ).bind(uuid(), user.id, service_key).run()
  return c.json({ ok: true })
})

// ---------- dynamic onboarding ----------
// Returns merged, ordered question list for the given services (comma-separated query param).
selfRoutes.get('/onboarding/questions', requireClient, async (c) => {
  const keys = (c.req.query('services') || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (keys.length === 0) return c.json({ questions: [] })
  const ph = keys.map(() => '?').join(',')
  const res = await c.env.DB.prepare(
    `SELECT * FROM onboarding_questions WHERE service_key IN (${ph}) ORDER BY service_key, sort_order`,
  ).bind(...keys).all()
  return c.json({ questions: res.results ?? [] })
})

// Current onboarding status + saved answers, for resuming the wizard.
selfRoutes.get('/onboarding', requireClient, async (c) => {
  const user = c.get('user')
  const profile = await c.env.DB.prepare(
    'SELECT onboarding_completed FROM client_profiles WHERE user_id = ?',
  ).bind(user.id).first<{ onboarding_completed: number }>()
  const services = await c.env.DB.prepare(
    'SELECT service_key, status FROM client_services WHERE client_user_id = ?',
  ).bind(user.id).all()
  const answers = await c.env.DB.prepare(
    'SELECT service_key, question_key, value FROM client_onboarding_responses WHERE client_user_id = ?',
  ).bind(user.id).all()
  return c.json({
    completed: !!profile?.onboarding_completed,
    services: (services.results ?? []).map((r: any) => r.service_key),
    answers: answers.results ?? [],
  })
})

// Submit (or update) the onboarding wizard: selected services + dynamic answers.
selfRoutes.post('/onboarding', requireClient, async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{
    services: string[]
    answers: Record<string, string>
  }>().catch(() => null)
  if (!body || !Array.isArray(body.services) || body.services.length === 0) {
    return c.json({ error: 'select at least one service' }, 400)
  }

  const validServices = await c.env.DB.prepare('SELECT key FROM services WHERE active = 1').all<{ key: string }>()
  const validKeys = new Set((validServices.results ?? []).map((r) => r.key))
  const services = body.services.filter((k) => validKeys.has(k))
  if (services.length === 0) return c.json({ error: 'no valid services selected' }, 400)

  const questions = await c.env.DB.prepare(
    `SELECT * FROM onboarding_questions WHERE service_key IN (${services.map(() => '?').join(',')})`,
  ).bind(...services).all<{ service_key: string; question_key: string; required: number }>()

  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {}
  const missing: string[] = []
  const stmts = []

  for (const svc of services) {
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO client_services (id, client_user_id, service_key, status)
         VALUES (?, ?, ?, 'requested')
         ON CONFLICT(client_user_id, service_key) DO NOTHING`,
      ).bind(uuid(), user.id, svc),
    )
  }

  for (const q of questions.results ?? []) {
    const compositeKey = `${q.service_key}.${q.question_key}`
    const value = answers[compositeKey]
    if (q.required && (value === undefined || value === null || String(value).trim() === '')) {
      missing.push(compositeKey)
      continue
    }
    if (value === undefined || value === null || String(value).trim() === '') continue
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO client_onboarding_responses (id, client_user_id, service_key, question_key, value)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(client_user_id, service_key, question_key) DO UPDATE SET value = excluded.value`,
      ).bind(uuid(), user.id, q.service_key, q.question_key, String(value)),
    )
  }

  if (missing.length > 0) {
    return c.json({ error: 'missing required answers', missing }, 400)
  }

  stmts.push(
    c.env.DB.prepare('UPDATE client_profiles SET onboarding_completed = 1 WHERE user_id = ?').bind(user.id),
  )
  stmts.push(
    c.env.DB.prepare(
      "INSERT INTO activity_events (id, actor_user_id, client_user_id, kind, detail) VALUES (?, ?, ?, 'onboarding_completed', ?)",
    ).bind(uuid(), user.id, user.id, JSON.stringify({ services })),
  )

  await c.env.DB.batch(stmts)
  return c.json({ ok: true })
})
