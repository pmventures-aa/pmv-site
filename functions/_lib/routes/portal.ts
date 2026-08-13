import { Hono } from 'hono'
import type { AppEnv, Env, SessionUser } from '../types'
import { requireUser } from '../mid'
import { uuid } from '../crypto'
import { resolveClientId, loadScopedRow, scopeFilter, ScopeError } from '../scope'
import { activityInsert, logActivity } from '../activity'
import { sendEmail, escapeHtml } from '../email'
import { calendarFeedUrls, signCalendarFeedToken } from '../calendarFeed'

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

async function listScoped(c: any, table: string, extra = '', orderBy = 'created_at DESC') {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user)
  const res = await c.env.DB.prepare(
    `SELECT * FROM ${table} WHERE ${where} ${extra} ORDER BY ${orderBy} LIMIT 200`,
  ).bind(...params).all()
  return res.results ?? []
}

// ---------------- Dashboard ----------------
portalRoutes.get('/dashboard', async (c) => {
  const user = c.get('user')
  const { where, params } = await scopeFilter(c.env, user)
  const p2 = () => [...params]

  const [matters, tasks, docs, invoices, tickets, calls, appts, msgs, services, properties, activeCases] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) n FROM matters WHERE ${where} AND status != 'closed'`).bind(...p2()).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM client_tasks WHERE ${where} AND status != 'done'`).bind(...p2()).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM document_requests WHERE ${where} AND status = 'requested'`).bind(...p2()).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM invoices WHERE ${where} AND status = 'open'`).bind(...p2()).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM support_tickets WHERE ${where} AND status = 'open'`).bind(...p2()).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM planned_calls WHERE ${where} AND status = 'requested'`).bind(...p2()).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT * FROM appointments WHERE ${where} AND datetime(starts_at) >= datetime('now') ORDER BY starts_at ASC LIMIT 5`).bind(...p2()).all(),
    c.env.DB.prepare(`SELECT * FROM secure_messages WHERE ${where} ORDER BY created_at DESC LIMIT 5`).bind(...p2()).all(),
    c.env.DB.prepare(`SELECT cs.service_key, cs.status, s.name FROM client_services cs JOIN services s ON s.key = cs.service_key WHERE cs.client_user_id = ? AND cs.status IN ('requested','submitted','active') ORDER BY s.name`).bind(user.role === 'client' ? user.id : (params[0] ?? user.id)).all(),
    c.env.DB.prepare(`SELECT id, address, property_type, status FROM properties WHERE ${where} ORDER BY created_at DESC LIMIT 6`).bind(...p2()).all(),
    c.env.DB.prepare(`SELECT id, subject, category, priority, status, service_key, property_id, response_due_at, resolution_due_at, waiting_on, created_at FROM support_tickets WHERE ${where} AND status != 'closed' ORDER BY created_at DESC LIMIT 5`).bind(...p2()).all(),
  ])

  return c.json({
    stats: {
      open_matters: matters?.n ?? 0,
      open_tasks: tasks?.n ?? 0,
      pending_documents: docs?.n ?? 0,
      open_invoices: invoices?.n ?? 0,
      open_tickets: tickets?.n ?? 0,
      pending_calls: calls?.n ?? 0,
    },
    upcoming_appointments: appts.results ?? [],
    recent_messages: msgs.results ?? [],
    enabled_services: services.results ?? [],
    properties: properties.results ?? [],
    active_cases: activeCases.results ?? [],
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
portalRoutes.get('/matters', async (c) => c.json({ matters: await listScoped(c, 'matters') }))

portalRoutes.post('/matters', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ title: string; type?: string; due_date?: string; client_user_id?: string; assigned_staff_user_id?: string }>().catch(() => null)
  if (!body?.title) return c.json({ error: 'title is required' }, 400)
  const clientId = await resolveClientId(c.env, user, body.client_user_id)
  const assigneeId = await resolveAssignee(c.env, user, body.assigned_staff_user_id)
  const id = uuid()
  const title = body.title.trim().slice(0, 300)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO matters (id, client_user_id, title, type, due_date, status, assigned_staff_user_id) VALUES (?, ?, ?, ?, ?, 'open', ?)`,
    ).bind(id, clientId, title, body.type ?? null, body.due_date ?? null, assigneeId),
    activityInsert(c.env, { actorUserId: user.id, clientUserId: clientId, kind: 'matter_created', detail: { title } }),
  ])
  return c.json({ ok: true, id }, 201)
})

portalRoutes.patch('/matters/:id', async (c) => {
  const user = c.get('user')
  if (user.role === 'client') return c.json({ error: 'forbidden' }, 403)
  const row = await loadScopedRow<any>(c.env, user, 'matters', c.req.param('id'))
  const body = await c.req.json<{ status?: string; assigned_staff_user_id?: string | null }>().catch(() => ({}) as { status?: string; assigned_staff_user_id?: string | null })
  const status = ['open', 'in_progress', 'blocked', 'closed'].includes(body.status ?? '') ? body.status : undefined
  if (status) {
    await c.env.DB.prepare('UPDATE matters SET status = ? WHERE id = ?').bind(status, row.id).run()
    if (status !== row.status) {
      await logActivity(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'matter_status_changed', detail: { title: row.title, from: row.status, to: status } })
    }
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
  // Wrapped so we surface a real diagnostic instead of the generic
  // "internal error" from the global onError handler when SESSION_SECRET
  // is missing or HMAC signing fails.
  try {
    const user = c.get('user')
    const secret = String(c.env.SESSION_SECRET || '').trim()
    if (!secret) {
      return c.json({
        error: 'Calendar subscription is not configured yet - the SESSION_SECRET environment variable is missing on the deployment.',
      }, 503)
    }
    const token = await signCalendarFeedToken(user.id, secret)
    const origin = new URL(c.req.url).origin
    return c.json(calendarFeedUrls(origin, token))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create a calendar link.'
    console.error('[calendar-feed] token generation failed', err)
    return c.json({ error: `Could not create a calendar link: ${message}` }, 500)
  }
})

portalRoutes.get('/calendar', async (c) => c.json({ appointments: await listScoped(c, 'appointments', '', 'starts_at ASC') }))

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

portalRoutes.get('/billing', async (c) => c.json({ invoices: await listScoped(c, 'invoices') }))

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

portalRoutes.post('/property', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ address: string; property_type?: string; notes?: string; client_user_id?: string }>().catch(() => null)
  if (!body?.address) return c.json({ error: 'address is required' }, 400)
  const clientId = await resolveClientId(c.env, user, body.client_user_id)
  const id = uuid()
  const address = body.address.trim().slice(0, 300)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO properties (id, client_user_id, address, property_type, notes, status) VALUES (?, ?, ?, ?, ?, 'active')`,
    ).bind(id, clientId, address, body.property_type ?? null, body.notes ?? null),
    activityInsert(c.env, { actorUserId: user.id, clientUserId: clientId, kind: 'property_created', detail: { address } }),
  ])
  return c.json({ ok: true, id }, 201)
})

portalRoutes.patch('/property/:id', async (c) => {
  const user = c.get('user')
  if (user.role === 'client') return c.json({ error: 'forbidden' }, 403)
  const row = await loadScopedRow<any>(c.env, user, 'properties', c.req.param('id'))
  const body = await c.req.json<{ status?: string }>().catch(() => ({} as { status?: string }))
  const status = ['active', 'under_contract', 'sold', 'inactive'].includes(body.status ?? '') ? body.status : undefined
  if (status) {
    await c.env.DB.prepare('UPDATE properties SET status = ? WHERE id = ?').bind(status, row.id).run()
    if (status !== row.status) {
      await logActivity(c.env, { actorUserId: user.id, clientUserId: row.client_user_id, kind: 'property_status_changed', detail: { address: row.address, from: row.status, to: status } })
    }
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
