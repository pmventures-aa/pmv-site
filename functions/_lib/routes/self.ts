import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireClient } from '../mid'
import { uuid, hashPassword, verifyPassword, encryptSensitive } from '../crypto'
import { MIN_PASSWORD } from './auth'
import { activityInsert } from '../activity'
import { notifyStaff, escapeHtml } from '../email'
import { rejectCardPayload } from '../../../shared/cardBrandCompliance'

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
  stmts.push(activityInsert(c.env, { actorUserId: user.id, clientUserId: user.id, kind: 'onboarding_completed', detail: { services } }))

  await c.env.DB.batch(stmts)
  return c.json({ ok: true })
})

// ---------- security: self-service password change ----------
const PWCHANGE_MAX_FAILS = 5
const PWCHANGE_LOCKOUT_SECONDS = 15 * 60

selfRoutes.post('/change-password', requireClient, async (c) => {
  const user = c.get('user')
  const { current_password, new_password } = await c.req
    .json<{ current_password: string; new_password: string }>()
    .catch(() => ({ current_password: '', new_password: '' }))
  if (!current_password || !new_password) return c.json({ error: 'current and new password are required' }, 400)
  if (new_password.length < MIN_PASSWORD) return c.json({ error: `password must be at least ${MIN_PASSWORD} characters` }, 400)

  const failKey = `pwchange_fail:${user.id}`
  const fails = parseInt((await c.env.SESSIONS.get(failKey)) || '0', 10)
  if (fails >= PWCHANGE_MAX_FAILS) {
    return c.json({ error: 'too many attempts — try again in 15 minutes' }, 429)
  }

  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string | null }>()
  const ok = row?.password_hash ? await verifyPassword(current_password, row.password_hash, c.env.SESSION_SECRET) : false
  if (!ok) {
    await c.env.SESSIONS.put(failKey, String(fails + 1), { expirationTtl: PWCHANGE_LOCKOUT_SECONDS })
    return c.json({ error: 'current password is incorrect' }, 401)
  }
  await c.env.SESSIONS.delete(failKey)

  const hash = await hashPassword(new_password, c.env.SESSION_SECRET)
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, user.id).run()
  return c.json({ ok: true })
})

selfRoutes.post('/set-initial-password', requireClient, async (c) => {
  const user = c.get('user')
  const { new_password } = await c.req.json<{ new_password?: string }>().catch(() => ({ new_password: '' }))
  const password = String(new_password || '')
  if (password.length < MIN_PASSWORD) return c.json({ error: `password must be at least ${MIN_PASSWORD} characters` }, 400)
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string | null }>()
  if (row?.password_hash) return c.json({ error: 'a password is already set on this account' }, 409)
  const hash = await hashPassword(password, c.env.SESSION_SECRET)
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, user.id).run()
  return c.json({ ok: true })
})

// ---------- my team: staff assigned to this client ----------
selfRoutes.get('/team', requireClient, async (c) => {
  const user = c.get('user')
  const res = await c.env.DB.prepare(
    `SELECT u.id, u.full_name, u.email, u.phone, tm.staff_role, tm.title
     FROM staff_assignments sa
     JOIN users u ON u.id = sa.staff_user_id
     LEFT JOIN team_members tm ON tm.user_id = u.id
     WHERE sa.client_user_id = ?
     ORDER BY u.full_name`,
  ).bind(user.id).all()
  return c.json({ team: res.results ?? [] })
})

// ---------- notifications: this client's own activity feed ----------
const CLIENT_ACTIVITY_SEEN_KEY = (userId: string) => `client_activity_seen:${userId}`

selfRoutes.get('/notifications', requireClient, async (c) => {
  const user = c.get('user')
  const res = await c.env.DB.prepare(
    `SELECT ae.*, actor.full_name AS actor_name, actor.email AS actor_email,
            cu.full_name AS client_name, cu.email AS client_email
     FROM activity_events ae
     LEFT JOIN users actor ON actor.id = ae.actor_user_id
     LEFT JOIN users cu ON cu.id = ae.client_user_id
     WHERE ae.client_user_id = ?
     ORDER BY ae.created_at DESC LIMIT 100`,
  ).bind(user.id).all()
  return c.json({ events: res.results ?? [] })
})

selfRoutes.get('/notifications/unread-count', requireClient, async (c) => {
  const user = c.get('user')
  const seen = (await c.env.SESSIONS.get(CLIENT_ACTIVITY_SEEN_KEY(user.id))) || '1970-01-01T00:00:00.000Z'
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) n FROM activity_events WHERE client_user_id = ? AND created_at > ?`,
  ).bind(user.id, seen).first<{ n: number }>()
  return c.json({ count: row?.n ?? 0 })
})

selfRoutes.post('/notifications/mark-seen', requireClient, async (c) => {
  const user = c.get('user')
  await c.env.SESSIONS.put(CLIENT_ACTIVITY_SEEN_KEY(user.id), new Date().toISOString())
  return c.json({ ok: true })
})

// ---------- payment methods: ACH only, never card PAN/CVV (see crypto.ts) ----------
// List view is always masked — routing/account numbers are encrypted at rest
// and this endpoint never decrypts them. Full values are only ever decrypted
// by an admin explicitly revealing one row (see admin.ts), which is logged.
selfRoutes.get('/payment-methods', requireClient, async (c) => {
  const user = c.get('user')
  const res = await c.env.DB.prepare(
    `SELECT id, service_key, method_type, account_holder_name, bank_name, account_type, account_last4, created_at
     FROM client_payment_methods WHERE client_user_id = ? ORDER BY created_at DESC`,
  ).bind(user.id).all()
  return c.json({ methods: res.results ?? [] })
})

// ---------- start a journey: full application for a service ----------
// Unlike POST /services (a bare one-click enroll with no data collection),
// this validates + records answers to that service's onboarding_questions,
// optionally records ACH banking info, and notifies staff via the activity
// feed — this is the "collect everything, pass it to the assignee" flow.
selfRoutes.post('/services/:key/apply', requireClient, async (c) => {
  const user = c.get('user')
  const serviceKey = c.req.param('key')
  const svc = await c.env.DB.prepare('SELECT key, name FROM services WHERE key = ? AND active = 1').bind(serviceKey).first<{ key: string; name: string }>()
  if (!svc) return c.json({ error: 'unknown service' }, 404)

  interface ApplyBody {
    answers?: Record<string, string>
    banking?: {
      account_holder_name: string
      bank_name?: string
      account_type?: string
      routing_number: string
      account_number: string
    }
  }
  const body = await c.req.json<ApplyBody>().catch(() => ({}) as ApplyBody)
  const cardBlock = rejectCardPayload(body)
  if (cardBlock) return c.json({ error: cardBlock }, 400)

  const questions = await c.env.DB.prepare(
    'SELECT * FROM onboarding_questions WHERE service_key = ? ORDER BY step_order, sort_order',
  ).bind(serviceKey).all<{ question_key: string; required: number }>()

  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {}
  const missing: string[] = []
  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO client_services (id, client_user_id, service_key, status) VALUES (?, ?, ?, 'submitted')
       ON CONFLICT(client_user_id, service_key) DO UPDATE SET status = CASE WHEN status = 'requested' THEN 'submitted' ELSE status END`,
    ).bind(uuid(), user.id, serviceKey),
  ]

  for (const q of questions.results ?? []) {
    const value = answers[q.question_key]
    if (q.required && (value === undefined || value === null || String(value).trim() === '')) {
      missing.push(q.question_key)
      continue
    }
    if (value === undefined || value === null || String(value).trim() === '') continue
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO client_onboarding_responses (id, client_user_id, service_key, question_key, value)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(client_user_id, service_key, question_key) DO UPDATE SET value = excluded.value`,
      ).bind(uuid(), user.id, serviceKey, q.question_key, String(value)),
    )
  }

  if (missing.length > 0) {
    return c.json({ error: 'missing required answers', missing }, 400)
  }

  if (body.banking) {
    const { account_holder_name, bank_name, account_type, routing_number, account_number } = body.banking
    if (!account_holder_name || !routing_number || !account_number) {
      return c.json({ error: 'banking info is incomplete' }, 400)
    }
    if (!/^\d{9}$/.test(routing_number.replace(/\s/g, ''))) {
      return c.json({ error: 'routing number must be 9 digits' }, 400)
    }
    const digits = account_number.replace(/\s/g, '')
    const [routingEnc, accountEnc] = await Promise.all([
      encryptSensitive(routing_number.replace(/\s/g, ''), c.env.PAYMENT_ENCRYPTION_KEY),
      encryptSensitive(digits, c.env.PAYMENT_ENCRYPTION_KEY),
    ])
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO client_payment_methods
           (id, client_user_id, service_key, method_type, account_holder_name, bank_name, account_type, routing_number_enc, account_number_enc, account_last4)
         VALUES (?, ?, ?, 'ach', ?, ?, ?, ?, ?, ?)`,
      ).bind(uuid(), user.id, serviceKey, account_holder_name.trim().slice(0, 200), bank_name?.trim().slice(0, 200) ?? null, account_type ?? null, routingEnc, accountEnc, digits.slice(-4)),
    )
  }

  stmts.push(activityInsert(c.env, { actorUserId: user.id, clientUserId: user.id, kind: 'service_application_submitted', detail: { service_key: serviceKey, service_name: svc.name } }))

  await c.env.DB.batch(stmts)

  const assigned = await c.env.DB.prepare('SELECT staff_user_id FROM staff_assignments WHERE client_user_id = ?').bind(user.id).all<{ staff_user_id: string }>()
  c.executionCtx.waitUntil(
    notifyStaff(c.env, {
      staffUserIds: (assigned.results ?? []).map((r) => r.staff_user_id),
      kind: 'service_application_submitted',
      subject: `New application: ${svc.name} — ${user.full_name || user.email}`,
      html: `<p><strong>${escapeHtml(user.full_name || user.email)}</strong> submitted an application for <strong>${escapeHtml(svc.name)}</strong>. Review it in the client's HQ profile.</p>`,
    }),
  )

  return c.json({ ok: true })
})
