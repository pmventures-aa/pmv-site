import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { requireClient, requireStaff } from '../mid'
import { canAccessClient } from '../scope'
import { uuid } from '../crypto'
import { activityInsert, logActivity } from '../activity'
import { logAudit, actorIp, actorUserAgent } from '../auditLog'
import { sendEmail, escapeHtml } from '../email'

export const staffServiceAssignmentRoutes = new Hono<AppEnv>()
export const clientApplicationSignatureRoutes = new Hono<AppEnv>()

interface QuestionRow {
  id: string
  service_key: string
  question_key: string
  label: string
  input_type: string
  step_label: string | null
  step_order: number
  sort_order: number
}

function answerJson(value: unknown): string {
  return JSON.stringify(value ?? '')
}

async function clientBasics(env: Env, clientId: string) {
  return env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.first_name, u.last_name, u.phone,
            cp.business_name, cp.entity_type, cp.state
     FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id
     WHERE u.id = ? AND u.role = 'client'`,
  ).bind(clientId).first<any>()
}

function basicPrefill(client: any): Record<string, string> {
  const fullName = client?.full_name || [client?.first_name, client?.last_name].filter(Boolean).join(' ') || ''
  const known: Record<string, string> = {
    name: fullName,
    full_name: fullName,
    owner_name: fullName,
    contact_name: fullName,
    first_name: client?.first_name || '',
    last_name: client?.last_name || '',
    email: client?.email || '',
    contact_email: client?.email || '',
    phone: client?.phone || '',
    contact_phone: client?.phone || '',
    business_name: client?.business_name || '',
    legal_business_name: client?.business_name || '',
    entity_type: client?.entity_type || '',
    state: client?.state || '',
  }
  return Object.fromEntries(Object.entries(known).filter(([, value]) => value))
}

async function existingAnswerPrefill(env: Env, clientId: string, serviceKey: string): Promise<Record<string, unknown>> {
  const latest = await env.DB.prepare(
    `SELECT id FROM service_applications
     WHERE client_user_id = ? AND service_key = ? AND status != 'draft'
     ORDER BY COALESCE(submitted_at, updated_at, created_at) DESC LIMIT 1`,
  ).bind(clientId, serviceKey).first<{ id: string }>()
  if (!latest) return {}
  const rows = await env.DB.prepare(
    `SELECT question_key, value_json FROM service_application_answers WHERE application_id = ?`,
  ).bind(latest.id).all<{ question_key: string; value_json: string }>()
  const result: Record<string, unknown> = {}
  for (const row of rows.results ?? []) {
    try { result[row.question_key] = JSON.parse(row.value_json) } catch { result[row.question_key] = row.value_json }
  }
  return result
}

async function persistPrefill(
  env: Env,
  applicationId: string,
  questions: QuestionRow[],
  values: Record<string, unknown>,
): Promise<number> {
  const byKey = new Map(questions.map((q) => [q.question_key, q]))
  const stmts: D1PreparedStatement[] = []
  let count = 0
  for (const [key, value] of Object.entries(values).slice(0, 250)) {
    const q = byKey.get(key)
    if (!q || q.input_type === 'file') continue
    if (value === null || value === undefined || value === '') continue
    count += 1
    stmts.push(
      env.DB.prepare(
        `INSERT INTO service_application_answers
          (id, application_id, question_id, question_key, question_label, step_label, step_order, sort_order, value_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(application_id, question_key) DO UPDATE SET
           question_id = excluded.question_id,
           question_label = excluded.question_label,
           step_label = excluded.step_label,
           step_order = excluded.step_order,
           sort_order = excluded.sort_order,
           value_json = excluded.value_json,
           updated_at = datetime('now')`,
      ).bind(uuid(), applicationId, q.id, q.question_key, q.label, q.step_label, q.step_order, q.sort_order, answerJson(value)),
    )
  }
  if (stmts.length) await env.DB.batch(stmts)
  return count
}

staffServiceAssignmentRoutes.get('/clients/:clientId/service-workspace', requireStaff, async (c) => {
  const user = c.get('user')
  const clientId = c.req.param('clientId')!
  if (!(await canAccessClient(c.env, user, clientId))) return c.json({ error: 'forbidden' }, 403)
  const client = await clientBasics(c.env, clientId)
  if (!client) return c.json({ error: 'client not found' }, 404)

  const services = await c.env.DB.prepare(
    `SELECT s.key, s.name, s.description, s.category, s.estimated_minutes,
            (SELECT COUNT(*) FROM onboarding_questions q WHERE q.service_key = s.key) AS question_count,
            cs.id AS client_service_id, cs.status AS client_service_status,
            (SELECT sa.id FROM service_applications sa
              WHERE sa.client_user_id = ? AND sa.service_key = s.key AND sa.status = 'draft'
              ORDER BY sa.updated_at DESC LIMIT 1) AS draft_application_id,
            (SELECT sa.submission_source FROM service_applications sa
              WHERE sa.client_user_id = ? AND sa.service_key = s.key AND sa.status = 'draft'
              ORDER BY sa.updated_at DESC LIMIT 1) AS draft_submission_source
     FROM services s
     LEFT JOIN client_services cs ON cs.client_user_id = ? AND cs.service_key = s.key
     WHERE s.active = 1
     ORDER BY s.sort_order, s.name`,
  ).bind(clientId, clientId, clientId).all<any>()

  return c.json({ client, services: services.results ?? [] })
})

staffServiceAssignmentRoutes.post('/clients/:clientId/services/:serviceKey/assign', requireStaff, async (c) => {
  const actor = c.get('user')
  const clientId = c.req.param('clientId')!
  const serviceKey = c.req.param('serviceKey')!
  if (!(await canAccessClient(c.env, actor, clientId))) return c.json({ error: 'forbidden' }, 403)
  const client = await clientBasics(c.env, clientId)
  if (!client) return c.json({ error: 'client not found' }, 404)
  const service = await c.env.DB.prepare(
    `SELECT key, name, description FROM services WHERE key = ? AND active = 1`,
  ).bind(serviceKey).first<any>()
  if (!service) return c.json({ error: 'service not found' }, 404)
  const questionsRes = await c.env.DB.prepare(
    `SELECT id, service_key, question_key, label, input_type, step_label, step_order, sort_order
     FROM onboarding_questions WHERE service_key = ? ORDER BY step_order, sort_order`,
  ).bind(serviceKey).all<QuestionRow>()
  const questions = questionsRes.results ?? []
  const body = await c.req.json<{ prefill?: Record<string, unknown>; note?: string }>().catch(() => ({} as { prefill?: Record<string, unknown>; note?: string }))

  if (questions.length === 0) {
    const existing = await c.env.DB.prepare(
      `SELECT id FROM client_services WHERE client_user_id = ? AND service_key = ?`,
    ).bind(clientId, serviceKey).first<{ id: string }>()
    const clientServiceId = existing?.id || uuid()
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO client_services (id, client_user_id, service_key, status)
         VALUES (?, ?, ?, 'active')
         ON CONFLICT(client_user_id, service_key) DO UPDATE SET status = 'active'`,
      ).bind(clientServiceId, clientId, serviceKey),
      activityInsert(c.env, {
        actorUserId: actor.id,
        clientUserId: clientId,
        kind: 'service_assigned_by_staff',
        detail: { service_key: serviceKey, service_name: service.name, requires_application: false },
      }),
    ])
    await sendEmail(c.env, {
      to: client.email,
      subject: `${service.name} has been added to your Pinnacle account`,
      html: `<p>Hi ${escapeHtml(client.first_name || client.full_name || 'there')},</p><p>Your Pinnacle team added <strong>${escapeHtml(service.name)}</strong> to your account.</p><p>You can review your services anytime in the Client Portal.</p>`,
      text: `Your Pinnacle team added ${service.name} to your account. Review it in the Client Portal.`,
    })
    return c.json({ ok: true, requires_application: false, client_service_id: clientServiceId }, 201)
  }

  let application = await c.env.DB.prepare(
    `SELECT id FROM service_applications
     WHERE client_user_id = ? AND service_key = ? AND status = 'draft'
     ORDER BY updated_at DESC LIMIT 1`,
  ).bind(clientId, serviceKey).first<{ id: string }>()
  const applicationId = application?.id || uuid()
  if (!application) {
    await c.env.DB.prepare(
      `INSERT INTO service_applications
        (id, client_user_id, service_key, status, current_step, submission_source, assigned_rep_user_id, assigned_by_user_id, assigned_at)
       VALUES (?, ?, ?, 'draft', 0, 'staff_assigned', ?, ?, datetime('now'))`,
    ).bind(applicationId, clientId, serviceKey, actor.id, actor.id).run()
  } else {
    await c.env.DB.prepare(
      `UPDATE service_applications SET submission_source = 'staff_assigned', assigned_rep_user_id = COALESCE(assigned_rep_user_id, ?),
         assigned_by_user_id = ?, assigned_at = datetime('now'), client_signature_name = NULL,
         client_signature_intent = 0, client_signed_at = NULL, client_signature_ip = NULL,
         client_signature_user_agent = NULL, updated_at = datetime('now') WHERE id = ?`,
    ).bind(actor.id, actor.id, applicationId).run()
  }

  const previous = await existingAnswerPrefill(c.env, clientId, serviceKey)
  const basics = basicPrefill(client)
  const merged = { ...previous, ...basics, ...(body.prefill ?? {}) }
  const prefilledCount = await persistPrefill(c.env, applicationId, questions, merged)

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO client_services (id, client_user_id, service_key, status)
       VALUES (?, ?, ?, 'requested')
       ON CONFLICT(client_user_id, service_key) DO UPDATE SET
         status = CASE WHEN client_services.status IN ('declined','completed') THEN 'requested' ELSE client_services.status END`,
    ).bind(uuid(), clientId, serviceKey),
    activityInsert(c.env, {
      actorUserId: actor.id,
      clientUserId: clientId,
      kind: 'service_application_assigned',
      detail: { service_key: serviceKey, service_name: service.name, application_id: applicationId, prefilled_answers: prefilledCount, note: body.note?.slice(0, 500) || null },
    }),
  ])

  await logAudit(c.env, {
    actorUserId: actor.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    action: 'service_application_assigned',
    entityType: 'service_application',
    entityId: applicationId,
    after: { client_user_id: clientId, service_key: serviceKey, prefilled_answers: prefilledCount },
  })

  const portalUrl = `https://client.pinnaclemanagementventures.com/services/${encodeURIComponent(serviceKey)}/apply`
  await sendEmail(c.env, {
    to: client.email,
    subject: `Action requested: review your ${service.name} application`,
    html: `<p>Hi ${escapeHtml(client.first_name || client.full_name || 'there')},</p><p>Your Pinnacle team started a <strong>${escapeHtml(service.name)}</strong> application for you and prefilled the information already on file.</p><p>Please sign in to review the details, complete anything still needed, and sign the application before submitting it.</p><p><a href="${portalUrl}">Review application</a></p>`,
    text: `Your Pinnacle team started a ${service.name} application. Sign in to review, complete, and sign it before submitting: ${portalUrl}`,
  })

  return c.json({ ok: true, requires_application: true, application_id: applicationId, prefilled_answers: prefilledCount }, 201)
})

staffServiceAssignmentRoutes.patch('/service-applications/:id/prefill', requireStaff, async (c) => {
  const actor = c.get('user')
  const id = c.req.param('id')!
  const app = await c.env.DB.prepare(
    `SELECT id, client_user_id, service_key, status FROM service_applications WHERE id = ?`,
  ).bind(id).first<any>()
  if (!app) return c.json({ error: 'application not found' }, 404)
  if (app.status !== 'draft') return c.json({ error: 'only draft applications can be prefilled' }, 409)
  if (!(await canAccessClient(c.env, actor, app.client_user_id))) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<{ answers?: Record<string, unknown> }>().catch(() => ({} as { answers?: Record<string, unknown> }))
  const qRes = await c.env.DB.prepare(
    `SELECT id, service_key, question_key, label, input_type, step_label, step_order, sort_order
     FROM onboarding_questions WHERE service_key = ? ORDER BY step_order, sort_order`,
  ).bind(app.service_key).all<QuestionRow>()
  const count = await persistPrefill(c.env, id, qRes.results ?? [], body.answers ?? {})
  await c.env.DB.prepare(
    `UPDATE service_applications SET client_signature_name = NULL, client_signature_intent = 0, client_signed_at = NULL,
       client_signature_ip = NULL, client_signature_user_agent = NULL, updated_at = datetime('now') WHERE id = ?`,
  ).bind(id).run()
  await logActivity(c.env, { actorUserId: actor.id, clientUserId: app.client_user_id, kind: 'service_application_prefilled', detail: { application_id: id, answers: count } })
  return c.json({ ok: true, saved: count })
})

// The client signs the durable draft, not a detached copy. Any later answer or
// file edit invalidates this signature and requires a fresh acceptance.
clientApplicationSignatureRoutes.post('/service-applications/:id/sign', requireClient, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')!
  const app = await c.env.DB.prepare(
    `SELECT id, client_user_id, status FROM service_applications WHERE id = ?`,
  ).bind(id).first<any>()
  if (!app || app.client_user_id !== user.id || app.status !== 'draft') return c.json({ error: 'draft application not found' }, 404)
  const body = await c.req.json<{ signature_name?: string; intent?: boolean }>().catch(() => ({} as { signature_name?: string; intent?: boolean }))
  const signatureName = (body.signature_name || '').trim().slice(0, 200)
  if (!body.intent || signatureName.length < 2) return c.json({ error: 'type your name and confirm your electronic signature' }, 400)
  const signedAt = new Date().toISOString()
  await c.env.DB.prepare(
    `UPDATE service_applications SET client_signature_name = ?, client_signature_intent = 1, client_signed_at = ?,
       client_signature_ip = ?, client_signature_user_agent = ?, updated_at = datetime('now') WHERE id = ?`,
  ).bind(signatureName, signedAt, actorIp(c.req.raw), actorUserAgent(c.req.raw), id).run()
  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    action: 'service_application_signed',
    entityType: 'service_application',
    entityId: id,
    after: { signature_name: signatureName, signed_at: signedAt, electronic_signature: true },
  })
  return c.json({ ok: true, signed_at: signedAt })
})

clientApplicationSignatureRoutes.use('/service-applications/:id/submit', requireClient, async (c, next) => {
  const user = c.get('user')
  const app = await c.env.DB.prepare(
    `SELECT client_user_id, status, client_signature_name, client_signature_intent, client_signed_at
     FROM service_applications WHERE id = ?`,
  ).bind(c.req.param('id')!).first<any>()
  if (!app || app.client_user_id !== user.id || app.status !== 'draft') return c.json({ error: 'draft application not found' }, 404)
  if (!app.client_signature_name || app.client_signature_intent !== 1 || !app.client_signed_at) {
    return c.json({ error: 'electronic signature required before submission' }, 400)
  }
  await next()
})

clientApplicationSignatureRoutes.use('/service-applications/:id', requireClient, async (c, next) => {
  if (c.req.method === 'PATCH') {
    await c.env.DB.prepare(
      `UPDATE service_applications SET client_signature_name = NULL, client_signature_intent = 0, client_signed_at = NULL,
       client_signature_ip = NULL, client_signature_user_agent = NULL WHERE id = ? AND client_user_id = ? AND status = 'draft'`,
    ).bind(c.req.param('id')!, c.get('user').id).run()
  }
  await next()
})

clientApplicationSignatureRoutes.use('/service-applications/:id/files/*', requireClient, async (c, next) => {
  if (c.req.method === 'POST' || c.req.method === 'DELETE') {
    await c.env.DB.prepare(
      `UPDATE service_applications SET client_signature_name = NULL, client_signature_intent = 0, client_signed_at = NULL,
       client_signature_ip = NULL, client_signature_user_agent = NULL WHERE id = ? AND client_user_id = ? AND status = 'draft'`,
    ).bind(c.req.param('id')!, c.get('user').id).run()
  }
  await next()
})
