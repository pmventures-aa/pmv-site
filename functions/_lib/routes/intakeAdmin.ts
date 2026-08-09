import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { requireStaff, requireAdmin } from '../mid'
import { requireCapability } from '../capabilities'
import { canAccessClient, scopeFilter } from '../scope'
import { uuid } from '../crypto'
import { activityInsert } from '../activity'
import { answerFromStorage } from '../intake'

export const intakeAdminRoutes = new Hono<AppEnv>()

const INPUT_TYPES = new Set([
  'text',
  'textarea',
  'single_select',
  'multi_select',
  'toggle',
  'number',
  'currency',
  'date',
  'datetime_window',
  'address',
  'file',
])
const CONDITION_OPERATORS = new Set(['==', '!=', 'contains', 'not_contains', 'truthy', 'falsy'])
const APPLICATION_STATUSES = ['submitted', 'in_review', 'approved', 'declined', 'closed']
const ACTIVITY_SEEN_KEY = (userId: string) => `activity_seen:${userId}`

function normalizedOptions(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw !== 'string') throw new Error('INVALID_OPTIONS')
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('not array')
    return JSON.stringify(parsed)
  } catch {
    throw new Error('INVALID_OPTIONS')
  }
}

async function mutedKinds(env: Env, userId: string): Promise<string[]> {
  const row = await env.DB.prepare('SELECT muted_kinds FROM notification_prefs WHERE user_id = ?').bind(userId).first<{ muted_kinds: string }>()
  if (!row) return []
  try { return JSON.parse(row.muted_kinds) as string[] } catch { return [] }
}

// ---------------- Service Catalog overlay ----------------
// These exact routes intentionally mount before adminRoutes so the richer
// catalog schema remains editable without rewriting the older admin module.
intakeAdminRoutes.get('/services', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT s.*, (SELECT COUNT(*) FROM onboarding_questions q WHERE q.service_key = s.key) AS question_count
     FROM services s ORDER BY s.sort_order, s.name`,
  ).all()
  return c.json({ services: res.results ?? [] })
})

intakeAdminRoutes.post('/services', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  const body = await c.req.json<{
    key?: string
    name?: string
    description?: string
    category?: string
    sort_order?: number
    intake_intro?: string
    estimated_minutes?: number
  }>().catch(() => ({}))
  const key = (body.key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
  const name = (body.name || '').trim()
  if (!key || !name) return c.json({ error: 'key and name are required' }, 400)
  const exists = await c.env.DB.prepare('SELECT 1 FROM services WHERE key = ?').bind(key).first()
  if (exists) return c.json({ error: 'a service with that key already exists' }, 409)
  await c.env.DB.prepare(
    `INSERT INTO services (key, name, description, category, sort_order, active, intake_intro, estimated_minutes)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).bind(
    key,
    name,
    body.description?.trim() || null,
    body.category?.trim() || null,
    body.sort_order ?? 0,
    body.intake_intro?.trim() || null,
    Math.max(1, Math.min(body.estimated_minutes ?? 3, 30)),
  ).run()
  return c.json({ ok: true, key }, 201)
})

intakeAdminRoutes.patch('/services/:key', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  const key = c.req.param('key')
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}))
  const sets: string[] = []
  const values: unknown[] = []
  const add = (column: string, value: unknown) => { sets.push(`${column} = ?`); values.push(value) }
  if (typeof body.name === 'string') add('name', body.name.trim())
  if (typeof body.description === 'string') add('description', body.description.trim() || null)
  if (typeof body.category === 'string') add('category', body.category.trim() || null)
  if (typeof body.intake_intro === 'string') add('intake_intro', body.intake_intro.trim() || null)
  if (typeof body.sort_order === 'number') add('sort_order', body.sort_order)
  if (typeof body.estimated_minutes === 'number') add('estimated_minutes', Math.max(1, Math.min(body.estimated_minutes, 30)))
  if (typeof body.active === 'boolean') add('active', body.active ? 1 : 0)
  if (sets.length === 0) return c.json({ error: 'nothing to update' }, 400)
  await c.env.DB.prepare(`UPDATE services SET ${sets.join(', ')} WHERE key = ?`).bind(...values, key).run()
  return c.json({ ok: true })
})

intakeAdminRoutes.get('/services/:key/questions', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  const res = await c.env.DB.prepare(
    'SELECT * FROM onboarding_questions WHERE service_key = ? ORDER BY step_order, sort_order',
  ).bind(c.req.param('key')).all()
  return c.json({ questions: res.results ?? [] })
})

intakeAdminRoutes.post('/services/:key/questions', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  const serviceKey = c.req.param('key')
  const body = await c.req.json<{
    question_key?: string
    label?: string
    help_text?: string
    input_type?: string
    options?: string | null
    required?: boolean
    step_label?: string
    step_order?: number
    sort_order?: number
    condition_question_key?: string | null
    condition_operator?: string | null
    condition_value?: string | null
    allow_multiple?: boolean
  }>().catch(() => ({}))
  const questionKey = (body.question_key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
  const label = (body.label || '').trim()
  if (!questionKey || !label) return c.json({ error: 'question_key and label are required' }, 400)
  const inputType = INPUT_TYPES.has(body.input_type || '') ? body.input_type! : 'text'
  let options: string | null = null
  try { options = normalizedOptions(body.options) } catch { return c.json({ error: 'options must be a JSON array' }, 400) }
  const operator = body.condition_operator && CONDITION_OPERATORS.has(body.condition_operator) ? body.condition_operator : null
  if (body.condition_question_key && !operator) return c.json({ error: 'choose a valid conditional operator' }, 400)
  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO onboarding_questions
      (id, service_key, question_key, label, help_text, input_type, options, required, sort_order,
       step_label, step_order, condition_question_key, condition_operator, condition_value, allow_multiple)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    serviceKey,
    questionKey,
    label,
    body.help_text?.trim() || null,
    inputType,
    options,
    body.required === false ? 0 : 1,
    body.sort_order ?? 0,
    body.step_label?.trim() || null,
    body.step_order ?? 1,
    body.condition_question_key?.trim() || null,
    operator,
    body.condition_value ?? null,
    body.allow_multiple ? 1 : 0,
  ).run()
  return c.json({ ok: true, id }, 201)
})

intakeAdminRoutes.patch('/services/questions/:id', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}))
  const sets: string[] = []
  const values: unknown[] = []
  const add = (column: string, value: unknown) => { sets.push(`${column} = ?`); values.push(value) }
  if (typeof body.label === 'string') add('label', body.label.trim())
  if (body.help_text === null || typeof body.help_text === 'string') add('help_text', typeof body.help_text === 'string' ? body.help_text.trim() || null : null)
  if (typeof body.input_type === 'string') {
    if (!INPUT_TYPES.has(body.input_type)) return c.json({ error: 'invalid input type' }, 400)
    add('input_type', body.input_type)
  }
  if ('options' in body) {
    try { add('options', normalizedOptions(body.options)) } catch { return c.json({ error: 'options must be a JSON array' }, 400) }
  }
  if (typeof body.required === 'boolean') add('required', body.required ? 1 : 0)
  if (body.step_label === null || typeof body.step_label === 'string') add('step_label', typeof body.step_label === 'string' ? body.step_label.trim() || null : null)
  if (typeof body.step_order === 'number') add('step_order', body.step_order)
  if (typeof body.sort_order === 'number') add('sort_order', body.sort_order)
  if (body.condition_question_key === null || typeof body.condition_question_key === 'string') add('condition_question_key', typeof body.condition_question_key === 'string' ? body.condition_question_key.trim() || null : null)
  if (body.condition_operator === null || typeof body.condition_operator === 'string') {
    if (typeof body.condition_operator === 'string' && !CONDITION_OPERATORS.has(body.condition_operator)) return c.json({ error: 'invalid conditional operator' }, 400)
    add('condition_operator', body.condition_operator || null)
  }
  if (body.condition_value === null || typeof body.condition_value === 'string') add('condition_value', body.condition_value ?? null)
  if (typeof body.allow_multiple === 'boolean') add('allow_multiple', body.allow_multiple ? 1 : 0)
  if (sets.length === 0) return c.json({ error: 'nothing to update' }, 400)
  await c.env.DB.prepare(`UPDATE onboarding_questions SET ${sets.join(', ')} WHERE id = ?`).bind(...values, c.req.param('id')).run()
  return c.json({ ok: true })
})

intakeAdminRoutes.delete('/services/questions/:id', requireStaff, requireCapability('can_manage_settings'), async (c) => {
  await c.env.DB.prepare('DELETE FROM onboarding_questions WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// ---------------- Service Applications pipeline ----------------
intakeAdminRoutes.get('/pipeline/service_applications', requireStaff, async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user, 'sa.client_user_id')
  const res = await c.env.DB.prepare(
    `SELECT sa.id, sa.client_user_id, sa.service_key, sa.status, sa.submitted_at, sa.created_at, sa.updated_at,
            sa.assigned_rep_user_id, sa.is_unassigned, sa.may_require_attorney_coordination,
            u.full_name AS client_name, u.email AS client_email, s.name AS service_name,
            rep.full_name AS assigned_rep_name, rep.email AS assigned_rep_email
     FROM service_applications sa
     JOIN users u ON u.id = sa.client_user_id
     JOIN services s ON s.key = sa.service_key
     LEFT JOIN users rep ON rep.id = sa.assigned_rep_user_id
     WHERE ${where} AND sa.status != 'draft'
     ORDER BY COALESCE(sa.submitted_at, sa.created_at) DESC LIMIT 300`,
  ).bind(...params).all()
  return c.json({ type: 'service_applications', statuses: APPLICATION_STATUSES, items: res.results ?? [] })
})

intakeAdminRoutes.get('/clients/:id/service-applications', requireStaff, async (c) => {
  const user = c.get('user')
  const clientId = c.req.param('id')
  if (!(await canAccessClient(c.env, user, clientId))) return c.json({ error: 'forbidden' }, 403)
  const apps = await c.env.DB.prepare(
    `SELECT sa.*, s.name AS service_name, rep.full_name AS assigned_rep_name, rep.email AS assigned_rep_email
     FROM service_applications sa JOIN services s ON s.key = sa.service_key
     LEFT JOIN users rep ON rep.id = sa.assigned_rep_user_id
     WHERE sa.client_user_id = ? ORDER BY sa.created_at DESC`,
  ).bind(clientId).all<any>()
  const rows = apps.results ?? []
  if (rows.length === 0) return c.json({ applications: [] })
  const ids = rows.map((r) => r.id)
  const ph = ids.map(() => '?').join(',')
  const ans = await c.env.DB.prepare(
    `SELECT * FROM service_application_answers WHERE application_id IN (${ph}) ORDER BY step_order, sort_order`,
  ).bind(...ids).all<any>()
  const byApp = new Map<string, any[]>()
  for (const row of ans.results ?? []) {
    if (!byApp.has(row.application_id)) byApp.set(row.application_id, [])
    byApp.get(row.application_id)!.push({ ...row, value: answerFromStorage(row.value_json), value_json: undefined })
  }
  return c.json({ applications: rows.map((r) => ({ ...r, answers: byApp.get(r.id) ?? [] })) })
})

// ---------------- Assigned representative ----------------
intakeAdminRoutes.patch('/assignments/:id/primary', requireAdmin, async (c) => {
  const actor = c.get('user')
  const assignment = await c.env.DB.prepare(
    `SELECT sa.id, sa.client_user_id, sa.staff_user_id, u.full_name, u.email
     FROM staff_assignments sa JOIN users u ON u.id = sa.staff_user_id WHERE sa.id = ?`,
  ).bind(c.req.param('id')).first<{ id: string; client_user_id: string; staff_user_id: string; full_name: string | null; email: string }>()
  if (!assignment) return c.json({ error: 'assignment not found' }, 404)
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE staff_assignments SET is_primary = 0 WHERE client_user_id = ?').bind(assignment.client_user_id),
    c.env.DB.prepare('UPDATE staff_assignments SET is_primary = 1 WHERE id = ?').bind(assignment.id),
    activityInsert(c.env, {
      actorUserId: actor.id,
      clientUserId: assignment.client_user_id,
      kind: 'primary_rep_changed',
      detail: { staff_user_id: assignment.staff_user_id, staff_name: assignment.full_name || assignment.email },
    }),
  ])
  return c.json({ ok: true })
})

// ---------------- Targeted activity feed ----------------
// Existing events with recipient_user_id NULL behave exactly as before.
intakeAdminRoutes.get('/activity', requireStaff, async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user, 'ae.client_user_id')
  const [res, muted] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ae.*, actor.full_name AS actor_name, actor.email AS actor_email,
              cu.full_name AS client_name, cu.email AS client_email
       FROM activity_events ae
       LEFT JOIN users actor ON actor.id = ae.actor_user_id
       LEFT JOIN users cu ON cu.id = ae.client_user_id
       WHERE ((${where}) OR ae.client_user_id IS NULL)
         AND (ae.recipient_user_id IS NULL OR ae.recipient_user_id = ? OR ? = 'admin')
       ORDER BY ae.created_at DESC LIMIT 100`,
    ).bind(...params, user.id, user.role).all<{ kind: string }>(),
    mutedKinds(c.env, user.id),
  ])
  const events = muted.length ? (res.results ?? []).filter((e) => !muted.includes(e.kind)) : res.results ?? []
  return c.json({ events })
})

intakeAdminRoutes.get('/activity/unread-count', requireStaff, async (c) => {
  const user = c.get('user')
  const seen = (await c.env.SESSIONS.get(ACTIVITY_SEEN_KEY(user.id))) || '1970-01-01T00:00:00.000Z'
  const { where, params } = await scopeFilter(c.env, user, 'ae.client_user_id')
  const muted = await mutedKinds(c.env, user.id)
  const mutedClause = muted.length ? `AND ae.kind NOT IN (${muted.map(() => '?').join(',')})` : ''
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) n FROM activity_events ae
     WHERE ((${where}) OR ae.client_user_id IS NULL)
       AND (ae.recipient_user_id IS NULL OR ae.recipient_user_id = ? OR ? = 'admin')
       AND ae.created_at > ? ${mutedClause}`,
  ).bind(...params, user.id, user.role, seen, ...muted).first<{ n: number }>()
  return c.json({ count: row?.n ?? 0 })
})

intakeAdminRoutes.post('/activity/mark-seen', requireStaff, async (c) => {
  const user = c.get('user')
  await c.env.SESSIONS.put(ACTIVITY_SEEN_KEY(user.id), new Date().toISOString())
  return c.json({ ok: true })
})
