import { Hono } from 'hono'
import type { AppEnv, Env, SessionUser } from '../types'
import { requireUser } from '../mid'
import { uuid } from '../crypto'
import { resolveClientId, loadScopedRow, scopeFilter, ScopeError } from '../scope'
import { activityInsert, logActivity } from '../activity'
import { sendEmail, escapeHtml } from '../email'
import { calendarFeedTokenForUser, calendarFeedUrls } from '../calendarFeed'
import {
  defaultMilestonesForType,
  inferMilestoneStatus,
  isClientStage,
  isMatterStatus,
  isMilestoneStatus,
  isResponsibilityState,
  resolveClientStage,
  resolveResponsibility,
} from '../../../shared/matterWorkspace'
import {
  isPropertyOccupancy, isPropertyStatus, optionalInt, trimPropertyField,
} from '../../../shared/propertyProfile'
import { billingCompliance, maskPaymentMethod, rejectCardPayload } from '../../../shared/cardBrandCompliance'

export const portalRoutes = new Hono<AppEnv>()
portalRoutes.use('*', requireUser)

portalRoutes.onError((err, c) => {
  if (err instanceof ScopeError) return c.json({ error: err.message }, err.status as any)
  console.error(err)
  return c.json({ error: 'internal error' }, 500)
})

// Assignment (Employee Management Center) — clients never set an assignee;
// staff/admin may, but only to an actual staff/admin account. Silently
// resolves to "unassigned" (null) rather than erroring on a bad id, since
// this is a secondary field on an otherwise-valid create/update request.
async function resolveAssignee(env: Env, user: SessionUser, assigneeId?: string): Promise<string | null> {
  if (user.role === 'client' || !assigneeId) return null
  const row = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(assigneeId).first<{ role: string }>()
  if (!row || (row.role !== 'staff' && row.role !== 'admin')) return null
  return assigneeId
}

async function listScoped(c: any, table: string, extra = '') {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user)
  const res = await c.env.DB.prepare(
    `SELECT * FROM ${table} WHERE ${where} ${extra} ORDER BY created_at DESC LIMIT 200`,
  ).bind(...params).all()
  return res.results ?? []
}

// ---------------- Dashboard ----------------
portalRoutes.get('/dashboard', async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user)
  const p2 = () => [...params]

  const matterWhere = where.replace(/client_user_id/g, 'm.client_user_id')
  const [matters, tasks, docs, invoices, tickets, calls, appts, msgs, services, properties, activeCases, pendingQuotes, activeMatters] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) n FROM matters WHERE ${where} AND status != 'closed'`).bind(...p2()).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM client_tasks WHERE ${where} AND status != 'done'`).bind(...p2()).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM document_requests WHERE ${where} AND status = 'requested'`).bind(...p2()).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM invoices WHERE ${where} AND status = 'open'`).bind(...p2()).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM support_tickets WHERE ${where} AND status = 'open'`).bind(...p2()).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM planned_calls WHERE ${where} AND status = 'requested'`).bind(...p2()).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT * FROM appointments WHERE ${where} AND starts_at >= datetime('now') ORDER BY starts_at ASC LIMIT 5`).bind(...p2()).all(),
    c.env.DB.prepare(`SELECT * FROM secure_messages WHERE ${where} ORDER BY created_at DESC LIMIT 5`).bind(...p2()).all(),
    c.env.DB.prepare(`SELECT cs.service_key, cs.status, s.name FROM client_services cs JOIN services s ON s.key = cs.service_key WHERE cs.client_user_id = ? AND cs.status IN ('requested','submitted','active') ORDER BY s.name`).bind(user.role === 'client' ? user.id : (params[0] ?? user.id)).all(),
    c.env.DB.prepare(`SELECT id, name, address, city, state, postal_code, property_type, occupancy, status FROM properties WHERE ${where} ORDER BY created_at DESC LIMIT 6`).bind(...p2()).all(),
    c.env.DB.prepare(`SELECT id, subject, category, priority, status, service_key, property_id, response_due_at, resolution_due_at, waiting_on, created_at FROM support_tickets WHERE ${where} AND status != 'closed' ORDER BY created_at DESC LIMIT 5`).bind(...p2()).all(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM service_quotes WHERE status IN ('sent','viewed') AND (client_user_id = ? OR lower(recipient_email) = lower(?))`).bind(user.id, user.email).first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT m.id, m.title, m.status, m.client_stage, m.responsibility_state, m.next_action_type, m.next_action_label, m.next_action_due_at, m.due_date, m.blocked_reason_client_safe, m.last_client_update_at, u.full_name AS owner_name
       FROM matters m
       LEFT JOIN users u ON u.id = m.assigned_staff_user_id
       WHERE ${matterWhere} AND m.status != 'closed'
       ORDER BY CASE m.responsibility_state WHEN 'client' THEN 0 WHEN 'third_party' THEN 1 ELSE 2 END, m.created_at DESC
       LIMIT 8`,
    ).bind(...p2()).all(),
  ])

  return c.json({
    stats: {
      open_matters: matters?.n ?? 0,
      open_tasks: tasks?.n ?? 0,
      pending_documents: docs?.n ?? 0,
      open_invoices: invoices?.n ?? 0,
      open_tickets: tickets?.n ?? 0,
      pending_calls: calls?.n ?? 0,
      pending_quotes: pendingQuotes?.n ?? 0,
    },
    upcoming_appointments: appts.results ?? [],
    recent_messages: msgs.results ?? [],
    enabled_services: services.results ?? [],
    properties: properties.results ?? [],
    active_cases: activeCases.results ?? [],
    active_matters: activeMatters.results ?? [],
  })
})

// ---------------- Planned Calls ----------------
portalRoutes.get('/calls', async (c) => c.json({ calls: await listScoped(c, 'planned_calls') }))

portalRoutes.post('/calls', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ topic: string; preferred_times?: string[]; client_user_id?: string }>().catch(() => null)
  if (!body?.topic) return c.json({ error: 'topic is required' }, 400)
  const clientId = await resolveClientId(c.env, user, body.client_user_id)
  const id = uuid()
  const topic = body.topic.trim().slice(0, 300)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO planned_calls (id, client_user_id, topic, preferred_times, status) VALUES (?, ?, ?, ?, 'requested')`,
    ).bind(id, clientId, topic, JSON.stringify(body.preferred_times ?? [])),
    activityInsert(c.env, { actorUserId: user.id, clientUserId: clientId, kind: 'call_created', detail: { topic } }),
  ])
  return c.json({ ok: true, id }, 201)
})

portalRoutes.patch('/calls/:id', async (c) => {
  const user = c.get('user')
  const row = await loadScopedRow<any>(c.env, user, 'planned_calls', c.req.param('id'))
  const body = await c.req.json<{ status?: string; scheduled_at?: string; notes?: string }>().catch(() => ({} as { status?: string; scheduled_at?: string; notes?: string }))
  if (user.role === 'client') {
    if (body.status && body.status !== 'cancelled') return c.json({ error: 'clients may only cancel a call' }, 403)
    if (body.status === 'cancelled') {
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE planned_calls SET status = 'cancelled' WHERE id = ?").bind(row.id),
        activityInsert(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'call_status_changed', detail: { topic: row.topic, from: row.status, to: 'cancelled' } }),
      ])
    }
    return c.json({ ok: true })
  }
  const status = ['requested', 'scheduled', 'completed', 'cancelled'].includes(body.status ?? '') ? body.status : undefined
  await c.env.DB.prepare(
    `UPDATE planned_calls SET status = COALESCE(?, status), scheduled_at = COALESCE(?, scheduled_at),
     notes = COALESCE(?, notes), staff_user_id = COALESCE(?, staff_user_id) WHERE id = ?`,
  ).bind(status ?? null, body.scheduled_at ?? null, body.notes ?? null, user.id, row.id).run()
  if (status && status !== row.status) {
    await logActivity(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'call_status_changed', detail: { topic: row.topic, from: row.status, to: status } })
  }
  return c.json({ ok: true })
})

// ---------------- Matters ----------------
portalRoutes.get('/matters', async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user)
  const res = await c.env.DB.prepare(
    `SELECT m.*, p.address AS property_address, p.name AS property_name, u.full_name AS owner_name
     FROM matters m
     LEFT JOIN properties p ON p.id = m.property_id
     LEFT JOIN users u ON u.id = m.assigned_staff_user_id
     WHERE ${where.replace(/client_user_id/g, 'm.client_user_id')}
     ORDER BY m.created_at DESC LIMIT 200`,
  ).bind(...params).all()
  return c.json({ matters: res.results ?? [] })
})

portalRoutes.get('/matters/:id', async (c) => {
  const user = c.get('user')
  const matter = await loadScopedRow<any>(c.env, user, 'matters', c.req.param('id'))
  const [property, tasks, documents, updates, parties, tickets, milestones, owner, documentRequests] = await Promise.all([
    matter.property_id
      ? c.env.DB.prepare('SELECT id, name, address, city, state, postal_code, property_type, occupancy, status FROM properties WHERE id = ? AND client_user_id = ?')
        .bind(matter.property_id, matter.client_user_id).first()
      : Promise.resolve(null),
    c.env.DB.prepare('SELECT id, title, status, due_date, created_at FROM client_tasks WHERE matter_id = ? AND client_user_id = ? ORDER BY created_at DESC')
      .bind(matter.id, matter.client_user_id).all(),
    c.env.DB.prepare('SELECT id, file_name, category, review_status, created_at FROM client_documents WHERE matter_id = ? AND client_user_id = ? ORDER BY created_at DESC')
      .bind(matter.id, matter.client_user_id).all(),
    c.env.DB.prepare(
      `SELECT u.id, u.body, u.created_at, a.full_name AS author_name
       FROM matter_updates u LEFT JOIN users a ON a.id = u.author_user_id
       WHERE u.matter_id = ? ORDER BY u.created_at DESC LIMIT 80`,
    ).bind(matter.id).all(),
    c.env.DB.prepare(
      `SELECT mp.matter_role, mp.is_primary, rp.display_name, rp.email, rp.party_type
       FROM matter_parties mp JOIN relationship_parties rp ON rp.id = mp.party_id
       WHERE mp.matter_id = ? ORDER BY mp.is_primary DESC, rp.display_name`,
    ).bind(matter.id).all(),
    c.env.DB.prepare(
      `SELECT id, subject, status, priority, waiting_on, created_at FROM support_tickets
       WHERE client_user_id = ? AND (property_id = ? OR subject LIKE ?)
       ORDER BY created_at DESC LIMIT 20`,
    ).bind(matter.client_user_id, matter.property_id || '__none__', `%${String(matter.title || '').slice(0, 40)}%`).all(),
    c.env.DB.prepare(
      'SELECT id, name, sequence, status, started_at, completed_at, target_at, responsible_party FROM matter_milestones WHERE matter_id = ? AND client_visible = 1 ORDER BY sequence, created_at',
    ).bind(matter.id).all(),
    matter.assigned_staff_user_id
      ? c.env.DB.prepare('SELECT full_name, email FROM users WHERE id = ?').bind(matter.assigned_staff_user_id).first<{ full_name: string | null; email: string }>()
      : Promise.resolve(null),
    c.env.DB.prepare(
      'SELECT id, title, status, signature_required, created_at FROM document_requests WHERE client_user_id = ? AND matter_id = ? ORDER BY created_at DESC',
    ).bind(matter.client_user_id, matter.id).all(),
  ])
  const storedMilestones = milestones.results ?? []
  const presentedMilestones = storedMilestones.length
    ? storedMilestones
    : defaultMilestonesForType(matter.type).map((item, index, list) => ({
      id: `derived-${item.sequence}`,
      name: item.name,
      sequence: item.sequence,
      status: inferMilestoneStatus(matter.status, index, list.length),
      started_at: null,
      completed_at: null,
      target_at: null,
      responsible_party: null,
      derived: true,
    }))
  return c.json({
    matter: {
      ...matter,
      owner_name: owner?.full_name || owner?.email || null,
      client_stage: resolveClientStage(matter.client_stage, matter.status),
      responsibility_state: resolveResponsibility(matter.responsibility_state, matter.status),
    },
    property,
    tasks: tasks.results ?? [],
    documents: documents.results ?? [],
    updates: updates.results ?? [],
    parties: parties.results ?? [],
    tickets: tickets.results ?? [],
    milestones: presentedMilestones,
    document_requests: documentRequests.results ?? [],
  })
})

portalRoutes.post('/matters/:id/updates', async (c) => {
  const user = c.get('user')
  const matter = await loadScopedRow<any>(c.env, user, 'matters', c.req.param('id'))
  const body = await c.req.json<{ body?: string }>().catch(() => null)
  const card = rejectCardPayload(body)
  if (card) return c.json({ error: card }, 400)
  const text = String(body?.body || '').trim()
  if (!text) return c.json({ error: 'Write an update first.' }, 400)
  const id = uuid()
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO matter_updates (id, matter_id, client_user_id, author_user_id, body) VALUES (?, ?, ?, ?, ?)',
    ).bind(id, matter.id, matter.client_user_id, user.id, text.slice(0, 4000)),
    c.env.DB.prepare("UPDATE matters SET last_client_update_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(matter.id),
    activityInsert(c.env, { actorUserId: user.id, clientUserId: matter.client_user_id, kind: 'matter_update', detail: { title: matter.title } }),
  ])
  return c.json({ ok: true, id }, 201)
})

portalRoutes.post('/matters', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ title: string; type?: string; due_date?: string; summary?: string; property_id?: string; client_user_id?: string; assigned_staff_user_id?: string; next_action_label?: string }>().catch(() => null)
  if (!body?.title) return c.json({ error: 'title is required' }, 400)
  const clientId = await resolveClientId(c.env, user, body.client_user_id)
  const assigneeId = await resolveAssignee(c.env, user, body.assigned_staff_user_id)
  let propertyId: string | null = null
  if (body.property_id) {
    const owned = await c.env.DB.prepare('SELECT id FROM properties WHERE id = ? AND client_user_id = ?').bind(body.property_id, clientId).first()
    if (owned) propertyId = body.property_id
  }
  const id = uuid()
  const title = body.title.trim().slice(0, 300)
  const summary = trimPropertyField(body.summary, 2000)
  const type = body.type ?? null
  const milestoneInserts = defaultMilestonesForType(type).map((item, index) =>
    c.env.DB.prepare(
      'INSERT INTO matter_milestones (id, matter_id, name, sequence, status, client_visible) VALUES (?, ?, ?, ?, ?, 1)',
    ).bind(uuid(), id, item.name, item.sequence, inferMilestoneStatus('open', index, defaultMilestonesForType(type).length)),
  )
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO matters (id, client_user_id, title, type, due_date, summary, property_id, status, assigned_staff_user_id, client_stage, responsibility_state, next_action_label, last_client_update_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, 'received', 'pinnacle', ?, datetime('now'))`,
    ).bind(id, clientId, title, type, body.due_date ?? null, summary, propertyId, assigneeId, trimPropertyField(body.next_action_label, 200)),
    ...milestoneInserts,
    activityInsert(c.env, { actorUserId: user.id, clientUserId: clientId, kind: 'matter_created', detail: { title } }),
  ])
  return c.json({ ok: true, id }, 201)
})

portalRoutes.patch('/matters/:id', async (c) => {
  const user = c.get('user')
  if (user.role === 'client') return c.json({ error: 'forbidden' }, 403)
  const row = await loadScopedRow<any>(c.env, user, 'matters', c.req.param('id'))
  type MatterPatch = {
    status?: string
    assigned_staff_user_id?: string | null
    summary?: string
    property_id?: string | null
    client_stage?: string
    responsibility_state?: string
    next_action_type?: string | null
    next_action_label?: string | null
    next_action_due_at?: string | null
    target_date?: string | null
    blocked_reason_client_safe?: string | null
    completion_summary?: string | null
  }
  const body = await c.req.json<MatterPatch>().catch(() => ({} as MatterPatch))
  const status = isMatterStatus(String(body.status || '')) ? String(body.status) : undefined
  const responsibility = isResponsibilityState(String(body.responsibility_state || '')) ? String(body.responsibility_state) : undefined
  const nextStatus = status || row.status
  const nextResponsibility = responsibility || resolveResponsibility(row.responsibility_state, nextStatus)
  const blockedReason = body.blocked_reason_client_safe !== undefined
    ? trimPropertyField(String(body.blocked_reason_client_safe || ''), 500)
    : row.blocked_reason_client_safe
  if ((nextStatus === 'blocked' || nextResponsibility === 'third_party') && !String(blockedReason || '').trim()) {
    return c.json({ error: 'Add a client-safe explanation before marking this waiting on a third party.' }, 400)
  }
  if (status) {
    const stage = nextStatus === 'closed' ? 'complete' : nextStatus === 'blocked' ? 'waiting' : isClientStage(String(body.client_stage || '')) ? String(body.client_stage) : resolveClientStage(row.client_stage, nextStatus)
    const resolvedResponsibility = nextStatus === 'closed' ? 'none' : nextStatus === 'blocked' ? 'third_party' : nextResponsibility
    await c.env.DB.prepare(
      "UPDATE matters SET status = ?, client_stage = ?, responsibility_state = ?, blocked_reason_client_safe = ?, updated_at = datetime('now') WHERE id = ?",
    ).bind(status, stage, resolvedResponsibility, nextStatus === 'blocked' || resolvedResponsibility === 'third_party' ? blockedReason : null, row.id).run()
    if (status !== row.status) {
      await logActivity(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'matter_status_changed', detail: { title: row.title, from: row.status, to: status } })
    }
  } else if (responsibility || body.client_stage !== undefined || body.blocked_reason_client_safe !== undefined) {
    const stage = isClientStage(String(body.client_stage || '')) ? String(body.client_stage) : row.client_stage
    await c.env.DB.prepare(
      "UPDATE matters SET client_stage = ?, responsibility_state = ?, blocked_reason_client_safe = ?, updated_at = datetime('now') WHERE id = ?",
    ).bind(stage ?? resolveClientStage(null, row.status), nextResponsibility, nextResponsibility === 'third_party' ? blockedReason : row.blocked_reason_client_safe, row.id).run()
  }
  if (body.summary !== undefined) {
    await c.env.DB.prepare("UPDATE matters SET summary = ?, updated_at = datetime('now') WHERE id = ?").bind(trimPropertyField(body.summary, 2000), row.id).run()
  }
  if (body.next_action_label !== undefined || body.next_action_type !== undefined || body.next_action_due_at !== undefined) {
    await c.env.DB.prepare(
      "UPDATE matters SET next_action_label = ?, next_action_type = ?, next_action_due_at = ?, updated_at = datetime('now') WHERE id = ?",
    ).bind(
      body.next_action_label !== undefined ? trimPropertyField(String(body.next_action_label || ''), 200) : row.next_action_label,
      body.next_action_type !== undefined ? trimPropertyField(String(body.next_action_type || ''), 40) : row.next_action_type,
      body.next_action_due_at !== undefined ? (body.next_action_due_at || null) : row.next_action_due_at,
      row.id,
    ).run()
  }
  if (body.target_date !== undefined) {
    await c.env.DB.prepare("UPDATE matters SET target_date = ?, updated_at = datetime('now') WHERE id = ?").bind(body.target_date || null, row.id).run()
  }
  if (body.completion_summary !== undefined) {
    await c.env.DB.prepare("UPDATE matters SET completion_summary = ?, updated_at = datetime('now') WHERE id = ?").bind(trimPropertyField(String(body.completion_summary || ''), 2000), row.id).run()
  }
  if (body.property_id !== undefined) {
    let propertyId: string | null = null
    if (body.property_id) {
      const owned = await c.env.DB.prepare('SELECT id FROM properties WHERE id = ? AND client_user_id = ?').bind(body.property_id, row.client_user_id).first()
      if (owned) propertyId = body.property_id
    }
    await c.env.DB.prepare("UPDATE matters SET property_id = ?, updated_at = datetime('now') WHERE id = ?").bind(propertyId, row.id).run()
  }
  if (body.assigned_staff_user_id !== undefined) {
    const assigneeId = await resolveAssignee(c.env, user, body.assigned_staff_user_id ?? undefined)
    await c.env.DB.prepare('UPDATE matters SET assigned_staff_user_id = ? WHERE id = ?').bind(assigneeId, row.id).run()
    if (assigneeId !== row.assigned_staff_user_id) {
      await logActivity(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'matter_assigned', detail: { title: row.title, assigned_staff_user_id: assigneeId } })
    }
  }
  return c.json({ ok: true })
})

portalRoutes.patch('/matters/:id/milestones/:milestoneId', async (c) => {
  const user = c.get('user')
  if (user.role === 'client') return c.json({ error: 'forbidden' }, 403)
  const matter = await loadScopedRow<any>(c.env, user, 'matters', c.req.param('id'))
  const milestoneId = c.req.param('milestoneId')
  const row = await c.env.DB.prepare('SELECT id FROM matter_milestones WHERE id = ? AND matter_id = ?').bind(milestoneId, matter.id).first()
  if (!row) return c.json({ error: 'Milestone not found.' }, 404)
  const body = await c.req.json<{ status?: string; name?: string; target_at?: string | null }>().catch(() => ({} as { status?: string; name?: string; target_at?: string | null }))
  if (body.status && !isMilestoneStatus(body.status)) return c.json({ error: 'Invalid milestone status.' }, 400)
  if (body.status) {
    const completed = body.status === 'completed' ? new Date().toISOString() : null
    const started = body.status === 'current' || body.status === 'completed' ? new Date().toISOString() : null
    await c.env.DB.prepare(
      "UPDATE matter_milestones SET status = ?, completed_at = COALESCE(?, completed_at), started_at = COALESCE(?, started_at) WHERE id = ?",
    ).bind(body.status, completed, started, milestoneId).run()
  }
  if (body.name !== undefined) {
    await c.env.DB.prepare('UPDATE matter_milestones SET name = ? WHERE id = ?').bind(trimPropertyField(body.name, 120), milestoneId).run()
  }
  if (body.target_at !== undefined) {
    await c.env.DB.prepare('UPDATE matter_milestones SET target_at = ? WHERE id = ?').bind(body.target_at || null, milestoneId).run()
  }
  return c.json({ ok: true })
})

// ---------------- Tasks ----------------
portalRoutes.get('/tasks', async (c) => c.json({ tasks: await listScoped(c, 'client_tasks') }))

portalRoutes.post('/tasks', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ title: string; due_date?: string; matter_id?: string; client_user_id?: string; assigned_staff_user_id?: string }>().catch(() => null)
  if (!body?.title) return c.json({ error: 'title is required' }, 400)
  const clientId = await resolveClientId(c.env, user, body.client_user_id)
  const assigneeId = await resolveAssignee(c.env, user, body.assigned_staff_user_id)
  const id = uuid()
  const title = body.title.trim().slice(0, 300)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO client_tasks (id, client_user_id, matter_id, title, due_date, status, assigned_staff_user_id) VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    ).bind(id, clientId, body.matter_id ?? null, title, body.due_date ?? null, assigneeId),
    activityInsert(c.env, { actorUserId: user.id, clientUserId: clientId, kind: 'task_created', detail: { title } }),
  ])
  return c.json({ ok: true, id }, 201)
})

portalRoutes.patch('/tasks/:id', async (c) => {
  const user = c.get('user')
  const row = await loadScopedRow<any>(c.env, user, 'client_tasks', c.req.param('id'))
  const body = await c.req.json<{ status?: string; assigned_staff_user_id?: string | null }>().catch(() => ({}) as { status?: string; assigned_staff_user_id?: string | null })
  const status = ['pending', 'in_progress', 'done'].includes(body.status ?? '') ? body.status : undefined
  if (status) {
    await c.env.DB.prepare('UPDATE client_tasks SET status = ? WHERE id = ?').bind(status, row.id).run()
    if (status !== row.status) {
      await logActivity(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'task_status_changed', detail: { title: row.title, from: row.status, to: status } })
    }
  }
  if (body.assigned_staff_user_id !== undefined && user.role !== 'client') {
    const assigneeId = await resolveAssignee(c.env, user, body.assigned_staff_user_id ?? undefined)
    await c.env.DB.prepare('UPDATE client_tasks SET assigned_staff_user_id = ? WHERE id = ?').bind(assigneeId, row.id).run()
    if (assigneeId !== row.assigned_staff_user_id) {
      await logActivity(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'task_assigned', detail: { title: row.title, assigned_staff_user_id: assigneeId } })
    }
  }
  return c.json({ ok: true })
})

// ---------------- Documents ----------------
// Metadata only for now — actual file storage requires an R2 bucket binding (not yet provisioned).
portalRoutes.get('/documents', async (c) => c.json({ documents: await listScoped(c, 'client_documents') }))

portalRoutes.post('/documents', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ category?: string; tax_year?: number; file_name?: string; client_user_id?: string }>().catch(() => null)
  const clientId = await resolveClientId(c.env, user, body?.client_user_id)
  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO client_documents (id, client_user_id, category, tax_year, file_name, review_status) VALUES (?, ?, ?, ?, ?, 'pending')`,
  ).bind(id, clientId, body?.category ?? null, body?.tax_year ?? null, body?.file_name ?? null).run()
  return c.json({ ok: true, id, note: 'File upload storage (R2) is not yet configured — this records a document request placeholder.' }, 201)
})

portalRoutes.get('/document-requests', async (c) => c.json({ requests: await listScoped(c, 'document_requests') }))

// ---------------- Messages ----------------
portalRoutes.get('/messages', async (c) => c.json({ messages: await listScoped(c, 'secure_messages') }))

portalRoutes.post('/messages', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ body: string; client_user_id?: string }>().catch(() => null)
  const card = rejectCardPayload(body)
  if (card) return c.json({ error: card }, 400)
  if (!body?.body?.trim()) return c.json({ error: 'message body is required' }, 400)
  const clientId = await resolveClientId(c.env, user, body.client_user_id)
  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO secure_messages (id, client_user_id, sender_user_id, body) VALUES (?, ?, ?, ?)`,
  ).bind(id, clientId, user.id, body.body.trim().slice(0, 4000)).run()
  return c.json({ ok: true, id }, 201)
})

// ---------------- Calendar (appointments) ----------------
portalRoutes.get('/calendar/feed', async (c) => {
  try {
    const user = c.get('user')
    const token = await calendarFeedTokenForUser(c.env.DB, user.id)
    const origin = new URL(c.req.url).origin
    return c.json(calendarFeedUrls(origin, token))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create a calendar link.'
    console.error('[calendar-feed] token generation failed', err)
    return c.json({ error: `Could not create a calendar link: ${message}` }, 500)
  }
})

portalRoutes.post('/calendar/feed/rotate', async (c) => {
  const user = c.get('user')
  const token = await calendarFeedTokenForUser(c.env.DB, user.id, true)
  return c.json(calendarFeedUrls(new URL(c.req.url).origin, token))
})

portalRoutes.get('/calendar', async (c) => c.json({ appointments: await listScoped(c, 'appointments', 'ORDER BY starts_at ASC') }))

portalRoutes.post('/calendar', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ title: string; starts_at: string; client_user_id?: string }>().catch(() => null)
  if (!body?.title || !body?.starts_at) return c.json({ error: 'title and starts_at are required' }, 400)
  const clientId = await resolveClientId(c.env, user, body.client_user_id)
  const id = uuid()
  const title = body.title.trim().slice(0, 300)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO appointments (id, client_user_id, title, starts_at, status) VALUES (?, ?, ?, ?, 'proposed')`,
    ).bind(id, clientId, title, body.starts_at),
    activityInsert(c.env, { actorUserId: user.id, clientUserId: clientId, kind: 'appointment_created', detail: { title, starts_at: body.starts_at } }),
  ])
  return c.json({ ok: true, id }, 201)
})

portalRoutes.patch('/calendar/:id', async (c) => {
  const user = c.get('user')
  const row = await loadScopedRow<any>(c.env, user, 'appointments', c.req.param('id'))
  const body = await c.req.json<{ status?: string }>().catch(() => ({} as { status?: string }))
  const allowed = user.role === 'client' ? ['cancelled'] : ['proposed', 'confirmed', 'completed', 'cancelled']
  if (body.status && allowed.includes(body.status)) {
    await c.env.DB.prepare('UPDATE appointments SET status = ? WHERE id = ?').bind(body.status, row.id).run()
    if (body.status !== row.status) {
      await logActivity(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'appointment_status_changed', detail: { title: row.title, from: row.status, to: body.status } })
    }
  }
  return c.json({ ok: true })
})

// ---------------- Billing (invoices — read only for clients) ----------------
interface BillToInput {
  name?: string
  company?: string
  email?: string
  phone?: string
  address_line1?: string
  city?: string
  state?: string
  postal_code?: string
}
interface LineItemInput {
  name?: string
  description?: string
  quantity?: number
  unit_price_cents?: number
  discount_cents?: number
  taxable?: boolean
}

function genInvoiceNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `INV-${date}-${uuid().slice(0, 4).toUpperCase()}`
}

portalRoutes.get('/billing', async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user)
  const invoices = await c.env.DB.prepare(
    `SELECT i.*, q.quote_number
     FROM invoices i
     LEFT JOIN service_quotes q ON q.id = i.quote_id
     WHERE ${where.replace(/client_user_id/g, 'i.client_user_id')}
     ORDER BY i.created_at DESC LIMIT 200`,
  ).bind(...params).all<any>()
  const rows = invoices.results ?? []
  const ids = rows.map((row) => row.id)
  const lineItems = ids.length
    ? await c.env.DB.prepare(
      `SELECT * FROM invoice_line_items WHERE invoice_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort_order, created_at`,
    ).bind(...ids).all<any>()
    : { results: [] as any[] }
  const byInvoice = new Map<string, any[]>()
  for (const item of lineItems.results ?? []) {
    const list = byInvoice.get(item.invoice_id) || []
    list.push(item)
    byInvoice.set(item.invoice_id, list)
  }
  const quotes = await c.env.DB.prepare(
    `SELECT id, quote_number, public_token, status, title, total_cents, valid_until, decision_note, decided_at, created_at
     FROM service_quotes
     WHERE status NOT IN ('draft','void')
       AND (client_user_id = ? OR lower(recipient_email) = lower(?))
     ORDER BY created_at DESC LIMIT 50`,
  ).bind(user.id, user.email).all()
  const methods = await c.env.DB.prepare(
    `SELECT id, method_type, account_holder_name, bank_name, account_type, account_last4, created_at
     FROM client_payment_methods WHERE client_user_id = ? ORDER BY created_at DESC`,
  ).bind(user.role === 'client' ? user.id : (params[0] ?? user.id)).all<any>()
  return c.json({
    invoices: rows.map((invoice) => ({ ...invoice, line_items: byInvoice.get(invoice.id) || [] })),
    quotes: quotes.results ?? [],
    payment_methods: (methods.results ?? []).map(maskPaymentMethod),
    compliance: billingCompliance,
  })
})

portalRoutes.get('/billing/:id', async (c) => {
  const user = c.get('user')
  const invoice = await loadScopedRow<any>(c.env, user, 'invoices', c.req.param('id'))
  const items = await c.env.DB.prepare(
    'SELECT * FROM invoice_line_items WHERE invoice_id = ? ORDER BY sort_order, created_at',
  ).bind(invoice.id).all()
  return c.json({ invoice, line_items: items.results ?? [] })
})

portalRoutes.post('/billing', async (c) => {
  const user = c.get('user')
  if (user.role === 'client') return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<{
    amount_cents?: number
    due_date?: string
    client_user_id: string
    invoice_number?: string
    title?: string
    message?: string
    currency?: string
    tax_rate_percent?: number
    bill_to?: BillToInput
    line_items?: LineItemInput[]
  }>().catch(() => null)
  if (!body?.client_user_id) return c.json({ error: 'client_user_id is required' }, 400)
  const clientId = await resolveClientId(c.env, user, body.client_user_id)

  const client = await c.env.DB.prepare(
    `SELECT u.full_name, u.email, u.phone, cp.business_name, cp.state
     FROM users u LEFT JOIN client_profiles cp ON cp.user_id = u.id WHERE u.id = ?`,
  ).bind(clientId).first<{ full_name: string | null; email: string; phone: string | null; business_name: string | null; state: string | null }>()

  const items = Array.isArray(body.line_items) ? body.line_items : []
  let subtotalCents = 0
  let discountCents = 0
  let taxableBaseCents = 0
  const normalizedItems: { name: string; description: string | null; quantity: number; unit_price_cents: number; discount_cents: number; taxable: number }[] = []

  if (items.length > 0) {
    for (const raw of items.slice(0, 100)) {
      const name = typeof raw.name === 'string' ? raw.name.trim() : ''
      if (!name) return c.json({ error: 'each line item needs a name' }, 400)
      const quantity = typeof raw.quantity === 'number' && raw.quantity > 0 ? raw.quantity : 1
      const unitPrice = typeof raw.unit_price_cents === 'number' && Number.isInteger(raw.unit_price_cents) && raw.unit_price_cents >= 0 ? raw.unit_price_cents : 0
      const lineGross = Math.round(quantity * unitPrice)
      const discount = typeof raw.discount_cents === 'number' && Number.isInteger(raw.discount_cents) && raw.discount_cents >= 0 ? Math.min(raw.discount_cents, lineGross) : 0
      const taxable = raw.taxable === true
      subtotalCents += lineGross
      discountCents += discount
      if (taxable) taxableBaseCents += lineGross - discount
      normalizedItems.push({ name: name.slice(0, 200), description: raw.description ? String(raw.description).trim().slice(0, 1000) || null : null, quantity, unit_price_cents: unitPrice, discount_cents: discount, taxable: taxable ? 1 : 0 })
    }
  } else {
    if (typeof body.amount_cents !== 'number' || !Number.isInteger(body.amount_cents) || body.amount_cents < 0) {
      return c.json({ error: 'amount_cents must be a non-negative integer, or provide line_items' }, 400)
    }
    subtotalCents = body.amount_cents
  }

  const taxRatePercent = typeof body.tax_rate_percent === 'number' && body.tax_rate_percent >= 0 && body.tax_rate_percent <= 100 ? body.tax_rate_percent : 0
  const taxRateBps = Math.round(taxRatePercent * 100)
  const taxCents = Math.round((taxableBaseCents * taxRateBps) / 10000)
  const amountCents = subtotalCents - discountCents + taxCents

  const billTo = body.bill_to ?? {}
  const id = uuid()
  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO invoices (
        id, client_user_id, amount_cents, currency, due_date, status,
        invoice_number, title, message, subtotal_cents, discount_cents, tax_rate_bps, tax_cents,
        bill_to_name, bill_to_company, bill_to_email, bill_to_phone, bill_to_address_line1, bill_to_city, bill_to_state, bill_to_postal_code,
        created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, clientId, amountCents, (body.currency || 'usd').toLowerCase().slice(0, 10), body.due_date ?? null,
      (body.invoice_number || genInvoiceNumber()).slice(0, 60),
      body.title ? body.title.slice(0, 200) : null,
      body.message ? body.message.slice(0, 2000) : null,
      subtotalCents, discountCents, taxRateBps, taxCents,
      (billTo.name || client?.full_name || null),
      (billTo.company || client?.business_name || null),
      (billTo.email || client?.email || null),
      (billTo.phone || client?.phone || null),
      billTo.address_line1 || null,
      billTo.city || null,
      (billTo.state || client?.state || null),
      billTo.postal_code || null,
      user.id,
    ),
    activityInsert(c.env, { actorUserId: user.id, clientUserId: clientId, kind: 'invoice_created', detail: { amount_cents: amountCents, title: body.title } }),
    ...normalizedItems.map((item, index) =>
      c.env.DB.prepare(
        `INSERT INTO invoice_line_items (id, invoice_id, name, description, quantity, unit_price_cents, discount_cents, taxable, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(uuid(), id, item.name, item.description, item.quantity, item.unit_price_cents, item.discount_cents, item.taxable, index),
    ),
  ]
  await c.env.DB.batch(stmts)
  return c.json({ ok: true, id }, 201)
})

portalRoutes.patch('/billing/:id', async (c) => {
  const user = c.get('user')
  if (user.role === 'client') return c.json({ error: 'forbidden' }, 403)
  const row = await loadScopedRow<any>(c.env, user, 'invoices', c.req.param('id'))
  const body = await c.req.json<{ status?: string }>().catch(() => ({} as { status?: string }))
  const status = ['open', 'paid', 'void'].includes(body.status ?? '') ? body.status : undefined
  if (status) {
    await c.env.DB.prepare('UPDATE invoices SET status = ? WHERE id = ?').bind(status, row.id).run()
    if (status !== row.status) {
      await logActivity(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'invoice_status_changed', detail: { amount_cents: row.amount_cents, from: row.status, to: status } })
    }
  }
  return c.json({ ok: true })
})

// One-off "send now" reminder email — there's no cron/scheduler in this
// deployment, so this is a manual action rather than the automatic
// schedule a full invoicing platform would run.
portalRoutes.post('/billing/:id/remind', async (c) => {
  const user = c.get('user')
  if (user.role === 'client') return c.json({ error: 'forbidden' }, 403)
  const row = await loadScopedRow<any>(c.env, user, 'invoices', c.req.param('id'))
  if (row.status !== 'open') return c.json({ error: 'only open invoices can be reminded' }, 400)
  const to = row.bill_to_email
  if (!to) return c.json({ error: 'this invoice has no billing email on file' }, 400)
  const amount = `$${(row.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const due = row.due_date ? new Date(row.due_date).toLocaleDateString() : 'as soon as possible'
  await sendEmail(c.env, {
    to,
    subject: `Payment reminder${row.invoice_number ? ` — ${escapeHtml(row.invoice_number)}` : ''}`,
    html: `<p>Hi ${escapeHtml(row.bill_to_name || 'there')},</p><p>This is a reminder that ${escapeHtml(row.title || 'your invoice')} for <strong>${amount}</strong> is due ${escapeHtml(due)}.</p>${row.message ? `<p>${escapeHtml(row.message)}</p>` : ''}<p>If you've already paid this, please disregard.</p>`,
  })
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE invoices SET last_reminded_at = datetime('now') WHERE id = ?`).bind(row.id),
    activityInsert(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'invoice_reminder_sent', detail: { amount_cents: row.amount_cents, invoice_number: row.invoice_number } }),
  ])
  return c.json({ ok: true })
})

// ---------------- Funding ----------------
portalRoutes.get('/funding', async (c) => c.json({ applications: await listScoped(c, 'funding_applications') }))

portalRoutes.post('/funding', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ amount_requested_cents?: number; use_of_funds?: string; client_user_id?: string }>().catch(() => null)
  if (
    body?.amount_requested_cents !== undefined &&
    (typeof body.amount_requested_cents !== 'number' || !Number.isInteger(body.amount_requested_cents) || body.amount_requested_cents < 0)
  ) {
    return c.json({ error: 'amount_requested_cents must be a non-negative integer' }, 400)
  }
  const clientId = await resolveClientId(c.env, user, body?.client_user_id)
  const id = uuid()
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO funding_applications (id, client_user_id, amount_requested_cents, use_of_funds, status) VALUES (?, ?, ?, ?, 'draft')`,
    ).bind(id, clientId, body?.amount_requested_cents ?? null, body?.use_of_funds ?? null),
    activityInsert(c.env, { actorUserId: user.id, clientUserId: clientId, kind: 'funding_created', detail: { amount_requested_cents: body?.amount_requested_cents ?? null } }),
  ])
  return c.json({ ok: true, id }, 201)
})

portalRoutes.patch('/funding/:id', async (c) => {
  const user = c.get('user')
  if (user.role === 'client') return c.json({ error: 'forbidden' }, 403)
  const row = await loadScopedRow<any>(c.env, user, 'funding_applications', c.req.param('id'))
  const body = await c.req.json<{ status?: string }>().catch(() => ({} as { status?: string }))
  const status = ['draft', 'submitted', 'under_review', 'approved', 'declined'].includes(body.status ?? '') ? body.status : undefined
  if (status) {
    await c.env.DB.prepare('UPDATE funding_applications SET status = ? WHERE id = ?').bind(status, row.id).run()
    if (status !== row.status) {
      await logActivity(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'funding_status_changed', detail: { from: row.status, to: status } })
    }
  }
  return c.json({ ok: true })
})

// ---------------- Property ----------------
portalRoutes.get('/property', async (c) => c.json({ properties: await listScoped(c, 'properties') }))

portalRoutes.get('/property/:id', async (c) => {
  const user = c.get('user')
  const property = await loadScopedRow<any>(c.env, user, 'properties', c.req.param('id'))
  const [matters, tickets, documents] = await Promise.all([
    c.env.DB.prepare('SELECT id, title, type, status, due_date, created_at FROM matters WHERE property_id = ? AND client_user_id = ? ORDER BY created_at DESC')
      .bind(property.id, property.client_user_id).all(),
    c.env.DB.prepare('SELECT id, subject, status, priority, waiting_on, created_at FROM support_tickets WHERE property_id = ? AND client_user_id = ? ORDER BY created_at DESC')
      .bind(property.id, property.client_user_id).all(),
    c.env.DB.prepare('SELECT id, file_name, category, review_status, created_at FROM client_documents WHERE property_id = ? AND client_user_id = ? ORDER BY created_at DESC')
      .bind(property.id, property.client_user_id).all(),
  ])
  return c.json({
    property,
    matters: matters.results ?? [],
    tickets: tickets.results ?? [],
    documents: documents.results ?? [],
  })
})

portalRoutes.post('/property', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  const address = trimPropertyField(body?.address, 300)
  if (!address) return c.json({ error: 'address is required' }, 400)
  const clientId = await resolveClientId(c.env, user, typeof body?.client_user_id === 'string' ? body.client_user_id : undefined)
  const id = uuid()
  const occupancy = isPropertyOccupancy(String(body?.occupancy || '')) ? String(body?.occupancy) : null
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO properties (id, client_user_id, address, name, unit, city, state, postal_code, property_type, occupancy, access_notes, notes, bedrooms, bathrooms, sqft, year_built, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`,
    ).bind(
      id, clientId, address,
      trimPropertyField(body?.name, 120),
      trimPropertyField(body?.unit, 40),
      trimPropertyField(body?.city, 80),
      trimPropertyField(body?.state, 40),
      trimPropertyField(body?.postal_code, 20),
      trimPropertyField(body?.property_type, 40),
      occupancy,
      trimPropertyField(body?.access_notes, 2000),
      trimPropertyField(body?.notes, 2000),
      optionalInt(body?.bedrooms),
      trimPropertyField(body?.bathrooms, 20),
      optionalInt(body?.sqft),
      optionalInt(body?.year_built),
    ),
    activityInsert(c.env, { actorUserId: user.id, clientUserId: clientId, kind: 'property_created', detail: { address } }),
  ])
  return c.json({ ok: true, id }, 201)
})

portalRoutes.patch('/property/:id', async (c) => {
  const user = c.get('user')
  const row = await loadScopedRow<any>(c.env, user, 'properties', c.req.param('id'))
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>))
  const sets: string[] = ["updated_at = datetime('now')"]
  const values: unknown[] = []
  const textFields = ['name', 'unit', 'city', 'state', 'postal_code', 'property_type', 'access_notes', 'notes', 'bathrooms'] as const
  const max: Record<string, number> = { name: 120, unit: 40, city: 80, state: 40, postal_code: 20, property_type: 40, access_notes: 2000, notes: 2000, bathrooms: 20 }
  for (const key of textFields) {
    if (body[key] !== undefined) {
      sets.push(`${key} = ?`)
      values.push(trimPropertyField(body[key], max[key]))
    }
  }
  for (const key of ['bedrooms', 'sqft', 'year_built'] as const) {
    if (body[key] !== undefined) {
      sets.push(`${key} = ?`)
      values.push(optionalInt(body[key]))
    }
  }
  if (body.occupancy !== undefined) {
    sets.push('occupancy = ?')
    values.push(isPropertyOccupancy(String(body.occupancy || '')) ? String(body.occupancy) : null)
  }
  if (body.status !== undefined) {
    if (user.role === 'client') return c.json({ error: 'forbidden' }, 403)
    if (!isPropertyStatus(String(body.status))) return c.json({ error: 'invalid status' }, 400)
    sets.push('status = ?')
    values.push(String(body.status))
  }
  if (values.length === 0) return c.json({ ok: true })
  values.push(row.id)
  await c.env.DB.prepare(`UPDATE properties SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
  if (body.status && String(body.status) !== row.status) {
    await logActivity(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'property_status_changed', detail: { address: row.address, from: row.status, to: body.status } })
  } else {
    await logActivity(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'property_updated', detail: { address: row.address } })
  }
  return c.json({ ok: true })
})

// ---------------- Tax ----------------
portalRoutes.get('/tax', async (c) => c.json({ filings: await listScoped(c, 'tax_filings') }))

portalRoutes.post('/tax', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ tax_year: number; filing_type?: string; due_date?: string; client_user_id?: string }>().catch(() => null)
  if (!body?.tax_year) return c.json({ error: 'tax_year is required' }, 400)
  const clientId = await resolveClientId(c.env, user, body.client_user_id)
  const id = uuid()
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO tax_filings (id, client_user_id, tax_year, filing_type, due_date, status) VALUES (?, ?, ?, ?, ?, 'not_started')`,
    ).bind(id, clientId, body.tax_year, body.filing_type ?? null, body.due_date ?? null),
    activityInsert(c.env, { actorUserId: user.id, clientUserId: clientId, kind: 'tax_filing_created', detail: { tax_year: body.tax_year, filing_type: body.filing_type ?? null } }),
  ])
  return c.json({ ok: true, id }, 201)
})

portalRoutes.patch('/tax/:id', async (c) => {
  const user = c.get('user')
  if (user.role === 'client') return c.json({ error: 'forbidden' }, 403)
  const row = await loadScopedRow<any>(c.env, user, 'tax_filings', c.req.param('id'))
  const body = await c.req.json<{ status?: string }>().catch(() => ({} as { status?: string }))
  const status = ['not_started', 'in_progress', 'filed', 'extended'].includes(body.status ?? '') ? body.status : undefined
  if (status) {
    await c.env.DB.prepare('UPDATE tax_filings SET status = ? WHERE id = ?').bind(status, row.id).run()
    if (status !== row.status) {
      await logActivity(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'tax_filing_status_changed', detail: { tax_year: row.tax_year, from: row.status, to: status } })
    }
  }
  return c.json({ ok: true })
})

// ---------------- Support ----------------
portalRoutes.get('/support', async (c) => c.json({ tickets: await listScoped(c, 'support_tickets') }))

portalRoutes.post('/support', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ subject: string; category?: string; priority?: string; details?: string; service_key?: string; property_id?: string; client_user_id?: string; assigned_staff_user_id?: string }>().catch(() => null)
  const card = rejectCardPayload(body)
  if (card) return c.json({ error: card }, 400)
  if (!body?.subject) return c.json({ error: 'subject is required' }, 400)
  const clientId = await resolveClientId(c.env, user, body.client_user_id)
  const assigneeId = await resolveAssignee(c.env, user, body.assigned_staff_user_id)
  const priority = ['low', 'normal', 'high', 'urgent'].includes(body.priority ?? '') ? body.priority! : 'normal'
  const id = uuid()
  const subject = body.subject.trim().slice(0, 300)
  // Read the current SLA targets from sla_policies (see migration 0046). If
  // the row is missing for any reason we fall back to the original hardcoded
  // defaults so a ticket submission never fails on missing policy config.
  const HARD_FALLBACK: Record<string, [number, number]> = { low: [480, 4320], normal: [240, 2880], high: [120, 1440], urgent: [30, 480] }
  const policy = await c.env.DB.prepare('SELECT response_minutes, resolution_minutes FROM sla_policies WHERE priority = ?').bind(priority).first<{ response_minutes: number; resolution_minutes: number }>()
  const responseMinutes = policy?.response_minutes ?? HARD_FALLBACK[priority][0]
  const resolutionMinutes = policy?.resolution_minutes ?? HARD_FALLBACK[priority][1]
  const responseDue = new Date(Date.now() + responseMinutes * 60_000).toISOString()
  const resolutionDue = new Date(Date.now() + resolutionMinutes * 60_000).toISOString()
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO support_tickets (id, client_user_id, subject, category, priority, status, assigned_staff_user_id, service_key, property_id, details, response_due_at, resolution_due_at) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
    ).bind(id, clientId, subject, body.category ?? null, priority, assigneeId, body.service_key ?? null, body.property_id ?? null, body.details?.trim().slice(0, 4000) ?? null, responseDue, resolutionDue),
    activityInsert(c.env, { actorUserId: user.id, clientUserId: clientId, kind: 'ticket_created', detail: { subject, priority } }),
  ])
  return c.json({ ok: true, id }, 201)
})

portalRoutes.patch('/support/:id', async (c) => {
  const user = c.get('user')
  const row = await loadScopedRow<any>(c.env, user, 'support_tickets', c.req.param('id'))
  const body = await c.req.json<{ status?: string; assigned_staff_user_id?: string | null }>().catch(() => ({}) as { status?: string; assigned_staff_user_id?: string | null })
  const allowed = user.role === 'client' ? ['closed'] : ['open', 'in_progress', 'closed']
  if (body.status && allowed.includes(body.status)) {
    // First time staff moves a ticket off 'open' is treated as the first
    // response — there's no separate reply/thread table on support_tickets
    // to hang a more precise timestamp off of (see migration 0016).
    if (user.role !== 'client' && !row.first_response_at && body.status !== 'open') {
      await c.env.DB.prepare("UPDATE support_tickets SET first_response_at = datetime('now') WHERE id = ?").bind(row.id).run()
    }
    if (body.status === 'closed' && !row.resolved_at) {
      await c.env.DB.prepare("UPDATE support_tickets SET resolved_at = datetime('now') WHERE id = ?").bind(row.id).run()
    } else if (body.status !== 'closed' && row.resolved_at) {
      // Reopened — clear so resolution-time reports don't count it twice.
      await c.env.DB.prepare('UPDATE support_tickets SET resolved_at = NULL WHERE id = ?').bind(row.id).run()
    }
    await c.env.DB.prepare('UPDATE support_tickets SET status = ? WHERE id = ?').bind(body.status, row.id).run()
    if (body.status !== row.status) {
      await logActivity(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'ticket_status_changed', detail: { subject: row.subject, from: row.status, to: body.status } })
    }
  }
  if (body.assigned_staff_user_id !== undefined && user.role !== 'client') {
    const assigneeId = await resolveAssignee(c.env, user, body.assigned_staff_user_id ?? undefined)
    await c.env.DB.prepare('UPDATE support_tickets SET assigned_staff_user_id = ? WHERE id = ?').bind(assigneeId, row.id).run()
    if (assigneeId !== row.assigned_staff_user_id) {
      await logActivity(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'ticket_assigned', detail: { subject: row.subject, assigned_staff_user_id: assigneeId } })
    }
  }
  return c.json({ ok: true })
})

portalRoutes.get('/support/:id/messages', async (c) => {
  const user = c.get('user')
  await loadScopedRow<any>(c.env, user, 'support_tickets', c.req.param('id'))
  const res = await c.env.DB.prepare(
    'SELECT * FROM secure_messages WHERE ticket_id = ? ORDER BY created_at ASC',
  ).bind(c.req.param('id')).all()
  return c.json({ messages: res.results ?? [] })
})

portalRoutes.post('/support/:id/messages', async (c) => {
  const user = c.get('user')
  const ticket = await loadScopedRow<any>(c.env, user, 'support_tickets', c.req.param('id'))
  const body = await c.req.json<{ body: string }>().catch(() => ({ body: '' }))
  if (!body.body?.trim()) return c.json({ error: 'message body is required' }, 400)
  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO secure_messages (id, client_user_id, sender_user_id, body, ticket_id) VALUES (?, ?, ?, ?, ?)`,
  ).bind(id, ticket.client_user_id, user.id, body.body.trim().slice(0, 4000), ticket.id).run()
  if (user.role !== 'client' && !ticket.first_response_at) {
    await c.env.DB.prepare("UPDATE support_tickets SET first_response_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(ticket.id).run()
  } else {
    await c.env.DB.prepare("UPDATE support_tickets SET waiting_on = ?, updated_at = datetime('now') WHERE id = ?").bind(user.role === 'client' ? 'pinnacle' : 'client', ticket.id).run()
  }
  return c.json({ ok: true, id }, 201)
})

// ---------------- Service applications (staff/admin lifecycle) ----------------
// Clients submit via POST /services/:key/apply (self.ts); staff progress the
// resulting client_services row through this endpoint. Clients themselves
// cannot change status here — the application, once submitted, is staff-owned.
portalRoutes.patch('/services/:id', async (c) => {
  const user = c.get('user')
  if (user.role === 'client') return c.json({ error: 'forbidden' }, 403)
  const row = await loadScopedRow<any>(c.env, user, 'client_services', c.req.param('id'))
  const body = await c.req.json<{ status?: string }>().catch(() => ({} as { status?: string }))
  const status = ['requested', 'submitted', 'active', 'completed', 'declined'].includes(body.status ?? '') ? body.status : undefined
  if (status) {
    await c.env.DB.prepare('UPDATE client_services SET status = ? WHERE id = ?').bind(status, row.id).run()
    if (status !== row.status) {
      await logActivity(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'service_status_changed', detail: { service_key: row.service_key, from: row.status, to: status } })
    }
  }
  return c.json({ ok: true })
})
