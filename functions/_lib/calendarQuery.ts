import type { Env, SessionUser } from './types'
import { visibleClientIds } from './access'
import {
  type CalendarEventItem,
  type CalendarEventStatus,
  type CalendarEventType,
  calendarEventTypeLabel,
  calendarEventStatusLabel,
  isCalendarEventStatus,
  isCalendarEventType,
  isCalendarLocationType,
  isCalendarVisibility,
  parseCalendarDate,
} from '../../shared/calendarWorkspace'

// Unified, role-aware calendar query layer.
//
// Returns a single CalendarEventItem[] combining:
//   * stored rows from calendar_events (the canonical scheduled-event store)
//   * derived entries computed from authoritative domain tables
//     (tasks, invoices, envelopes, matters, field assignments, milestones,
//     planned calls) — never duplicated, deep-linked to their source.
//
// Scope rules:
//   * client -> rows where client_user_id = me AND visibility = 'client'
//   * staff  -> rows for clients they're assigned to, PLUS rows assigned to
//               or created by them, PLUS rows where they are the vendor
//               (so field vendors see their own jobs without client scoping)
//   * admin  -> everything

export interface CalendarQueryOptions {
  // Inclusive start date key 'YYYY-MM-DD' (local).
  from?: string | null
  // Exclusive end date key 'YYYY-MM-DD' (local).
  to?: string | null
  assignedUserId?: string | null
  eventType?: string | null
  status?: string | null
  clientUserId?: string | null
  matterId?: string | null
  vendorUserId?: string | null
  visibility?: string | null
  includeDerived?: boolean
  includeStored?: boolean
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Build the calendar_events WHERE fragment for a user (without time window).
async function eventScope(env: Env, user: SessionUser): Promise<{ where: string; params: string[] }> {
  if (user.role === 'admin') return { where: '1=1', params: [] }
  if (user.role === 'client') return { where: "ce.visibility = 'client' AND ce.client_user_id = ?", params: [user.id] }
  const clientIds = await visibleClientIds(env, user)
  if (clientIds === null) return { where: '1=1', params: [] }
  const clientWhere = clientIds.length
    ? `ce.client_user_id IN (${clientIds.map(() => '?').join(',')})`
    : '0=1'
  const params = [...clientIds]
  return {
    where: `(${clientWhere} OR ce.assigned_user_id = ? OR ce.created_by_user_id = ? OR ce.vendor_user_id = ?)`,
    params: [...params, user.id, user.id, user.id],
  }
}

interface EventRow {
  id: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  all_day: number
  timezone: string | null
  event_type: string
  status: string
  location_type: string | null
  location_name: string | null
  address: string | null
  meeting_url: string | null
  phone_number: string | null
  assigned_user_id: string | null
  client_user_id: string | null
  matter_id: string | null
  business_id: string | null
  property_id: string | null
  vendor_user_id: string | null
  task_id: string | null
  invoice_id: string | null
  envelope_id: string | null
  document_id: string | null
  visibility: string
  client_visible: number
  client_name: string | null
  matter_title: string | null
  vendor_name: string | null
  property_label: string | null
}

function mapStored(row: EventRow): CalendarEventItem {
  return {
    id: row.id,
    derived: false,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: !!row.all_day,
    timezone: row.timezone,
    eventType: isCalendarEventType(row.event_type) ? row.event_type : 'custom',
    status: isCalendarEventStatus(row.status) ? row.status : 'proposed',
    locationType: isCalendarLocationType(row.location_type) ? row.location_type : (row.location_type as any) || null,
    locationName: row.location_name,
    address: row.address,
    meetingUrl: row.meeting_url,
    phoneNumber: row.phone_number,
    assignedUserId: row.assigned_user_id,
    clientUserId: row.client_user_id,
    clientName: row.client_name,
    matterId: row.matter_id,
    matterTitle: row.matter_title,
    businessId: row.business_id,
    propertyId: row.property_id,
    propertyLabel: row.property_label,
    vendorUserId: row.vendor_user_id,
    vendorName: row.vendor_name,
    taskId: row.task_id,
    invoiceId: row.invoice_id,
    envelopeId: row.envelope_id,
    documentId: row.document_id,
    visibility: isCalendarVisibility(row.visibility) ? row.visibility : 'client',
    clientVisible: !!row.client_visible,
  }
}

export async function loadCalendarEvents(env: Env, user: SessionUser, opts: CalendarQueryOptions = {}): Promise<CalendarEventItem[]> {
  const from = opts.from && DATE_RE.test(opts.from) ? opts.from : null
  const to = opts.to && DATE_RE.test(opts.to) ? opts.to : null
  const window = (column: string) => {
    const clauses: string[] = []
    const params: string[] = []
    if (from) { clauses.push(`${column} >= ?`); params.push(from) }
    if (to) { clauses.push(`${column} < ?`); params.push(to) }
    return { clause: clauses.join(' AND '), params }
  }

  const stored: CalendarEventItem[] = []
  if (opts.includeStored !== false) {
    const scope = await eventScope(env, user)
    const win = window('ce.starts_at')
    const clauses = [scope.where]
    const params = [...scope.params]
    if (win.clause) { clauses.push(win.clause); params.push(...win.params) }
    if (opts.assignedUserId) { clauses.push('ce.assigned_user_id = ?'); params.push(opts.assignedUserId) }
    if (opts.eventType) { clauses.push('ce.event_type = ?'); params.push(opts.eventType) }
    if (opts.status) { clauses.push('ce.status = ?'); params.push(opts.status) }
    if (opts.clientUserId) { clauses.push('ce.client_user_id = ?'); params.push(opts.clientUserId) }
    if (opts.matterId) { clauses.push('ce.matter_id = ?'); params.push(opts.matterId) }
    if (opts.vendorUserId) { clauses.push('ce.vendor_user_id = ?'); params.push(opts.vendorUserId) }
    if (opts.visibility) { clauses.push('ce.visibility = ?'); params.push(opts.visibility) }

    const rows = await env.DB.prepare(
      `SELECT ce.*, u.full_name AS client_name, m.title AS matter_title, vu.full_name AS vendor_name, p.address AS property_label
       FROM calendar_events ce
       LEFT JOIN users u ON u.id = ce.client_user_id
       LEFT JOIN users vu ON vu.id = ce.vendor_user_id
       LEFT JOIN matters m ON m.id = ce.matter_id
       LEFT JOIN properties p ON p.id = ce.property_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY ce.starts_at ASC LIMIT 500`,
    ).bind(...params).all<EventRow>()
    stored.push(...(rows.results ?? []).map(mapStored))
  }

  const derived: CalendarEventItem[] = []
  if (opts.includeDerived !== false) {
    derived.push(...await loadDerivedEvents(env, user, { from, to, eventType: opts.eventType, status: opts.status, matterId: opts.matterId, assignedUserId: opts.assignedUserId, vendorUserId: opts.vendorUserId }))
  }

  const merged = [...stored, ...derived]
  const filtered = opts.status ? merged.filter((e) => e.status === opts.status) : merged
  return filtered.sort((a, b) => parseCalendarDate(a.startsAt).getTime() - parseCalendarDate(b.startsAt).getTime())
}

// ---- Derived events (computed from authoritative tables) ----

interface DerivedOptions {
  from: string | null
  to: string | null
  eventType?: string | null
  status?: string | null
  matterId?: string | null
  assignedUserId?: string | null
  vendorUserId?: string | null
}

function derivedWindow(column: string, from: string | null, to: string | null) {
  const clauses: string[] = []
  const params: string[] = []
  if (from) { clauses.push(`${column} >= ?`); params.push(from) }
  if (to) { clauses.push(`${column} < ?`); params.push(to) }
  return { clause: clauses.join(' AND '), params }
}

async function loadDerivedEvents(env: Env, user: SessionUser, opts: DerivedOptions): Promise<CalendarEventItem[]> {
  const items: CalendarEventItem[] = []
  const wantType = (t: CalendarEventType) => !opts.eventType || opts.eventType === t
  const wantStatus = (s: CalendarEventStatus) => !opts.status || opts.status === s
  const wantMatter = (matterId: string | null | undefined) => !opts.matterId || matterId === opts.matterId

  // Scope fragment reused by every domain query below. For clients it is
  // their own id; for staff/admin it's the visible client set. Because
  // these tables each carry client_user_id (or join to it), we apply the
  // same role logic as eventScope but without the "assigned to me" clause
  // (that clause is about calendar_events rows; domain tables scope to the
  // clients the user actually covers).
  if (user.role === 'client') {
    await loadClientDerived(env, user, opts, items)
    return items
  }

  const clientIds = user.role === 'admin' ? null : await visibleClientIds(env, user)
  const clientClause = (column: string) => {
    if (clientIds === null) return { clause: '1=1', params: [] as string[] }
    if (!clientIds.length) return { clause: '0=1', params: [] as string[] }
    return { clause: `${column} IN (${clientIds.map(() => '?').join(',')})`, params: clientIds }
  }

  const allItems: CalendarEventItem[] = []

  if (wantType('task_deadline')) {
    const scope = clientClause('t.client_user_id')
    const win = derivedWindow('t.due_date', opts.from, opts.to)
    const where = [scope.clause, "t.status != 'done'", 't.due_date IS NOT NULL', win.clause].filter(Boolean).join(' AND ')
    const rows = await env.DB.prepare(
      `SELECT t.id, t.title, t.due_date, t.matter_id, t.client_user_id, u.full_name AS client_name, m.title AS matter_title
       FROM client_tasks t
       LEFT JOIN users u ON u.id = t.client_user_id
       LEFT JOIN matters m ON m.id = t.matter_id
       WHERE ${where} ORDER BY t.due_date ASC LIMIT 300`,
    ).bind(...scope.params, ...win.params).all<{ id: string; title: string; due_date: string; matter_id: string | null; client_user_id: string; client_name: string | null; matter_title: string | null }>()
    for (const r of rows.results ?? []) {
      if (!wantMatter(r.matter_id)) continue
      allItems.push({
        id: `task:${r.id}`,
        derived: true,
        title: r.title,
        startsAt: r.due_date,
        allDay: true,
        eventType: 'task_deadline',
        status: 'proposed',
        clientUserId: r.client_user_id,
        clientName: r.client_name,
        matterId: r.matter_id,
        matterTitle: r.matter_title,
        taskId: r.id,
        visibility: 'client',
        clientVisible: true,
        sourcePath: `/matters/${r.matter_id ?? ''}`,
      })
    }
  }

  if (wantType('invoice_due')) {
    const scope = clientClause('i.client_user_id')
    const win = derivedWindow('i.due_date', opts.from, opts.to)
    const where = [scope.clause, "i.status = 'open'", 'i.due_date IS NOT NULL', win.clause].filter(Boolean).join(' AND ')
    const rows = await env.DB.prepare(
      `SELECT i.id, i.title, i.invoice_number, i.due_date, i.amount_cents, i.client_user_id, u.full_name AS client_name
       FROM invoices i
       LEFT JOIN users u ON u.id = i.client_user_id
       WHERE ${where} ORDER BY i.due_date ASC LIMIT 300`,
    ).bind(...scope.params, ...win.params).all<{ id: string; title: string | null; invoice_number: string | null; due_date: string; amount_cents: number; client_user_id: string; client_name: string | null }>()
    for (const r of rows.results ?? []) {
      allItems.push({
        id: `invoice:${r.id}`,
        derived: true,
        title: r.title || r.invoice_number || 'Invoice due',
        startsAt: r.due_date,
        allDay: true,
        eventType: 'invoice_due',
        status: 'proposed',
        clientUserId: r.client_user_id,
        clientName: r.client_name,
        invoiceId: r.id,
        description: `Invoice due — $${(r.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        visibility: 'client',
        clientVisible: true,
        sourcePath: '/billing',
      })
    }
  }

  if (wantType('signature_deadline')) {
    const scope = clientClause('e.client_id')
    const win = derivedWindow('e.expires_at', opts.from, opts.to)
    const where = [scope.clause, "e.status IN ('sent','viewed','in_progress')", 'e.expires_at IS NOT NULL', win.clause].filter(Boolean).join(' AND ')
    const rows = await env.DB.prepare(
      `SELECT e.id, e.title, e.expires_at, e.client_id, u.full_name AS client_name
       FROM envelopes e
       LEFT JOIN users u ON u.id = e.client_id
       WHERE ${where} ORDER BY e.expires_at ASC LIMIT 300`,
    ).bind(...scope.params, ...win.params).all<{ id: string; title: string; expires_at: string; client_id: string | null; client_name: string | null }>()
    for (const r of rows.results ?? []) {
      allItems.push({
        id: `envelope:${r.id}`,
        derived: true,
        title: r.title,
        startsAt: r.expires_at,
        allDay: true,
        eventType: 'signature_deadline',
        status: 'proposed',
        clientUserId: r.client_id,
        clientName: r.client_name,
        envelopeId: r.id,
        description: 'Signature window closes',
        visibility: 'client',
        clientVisible: true,
        sourcePath: '/documents',
      })
    }
  }

  if (wantType('matter_deadline')) {
    const scope = clientClause('m.client_user_id')
    const win = derivedWindow('COALESCE(m.next_action_due_at, m.target_date, m.due_date)', opts.from, opts.to)
    const where = [scope.clause, "m.status != 'closed'", win.clause].filter(Boolean).join(' AND ')
    const rows = await env.DB.prepare(
      `SELECT m.id, m.title, m.next_action_due_at, m.target_date, m.due_date, m.client_user_id, u.full_name AS client_name
       FROM matters m
       LEFT JOIN users u ON u.id = m.client_user_id
       WHERE ${where} ORDER BY 1 LIMIT 300`,
    ).bind(...scope.params, ...win.params).all<{ id: string; title: string; next_action_due_at: string | null; target_date: string | null; due_date: string | null; client_user_id: string; client_name: string | null }>()
    for (const r of rows.results ?? []) {
      if (!wantMatter(r.id)) continue
      const at = r.next_action_due_at || r.target_date || r.due_date
      if (!at) continue
      allItems.push({
        id: `matter:${r.id}`,
        derived: true,
        title: r.title,
        startsAt: at,
        allDay: true,
        eventType: 'matter_deadline',
        status: 'proposed',
        clientUserId: r.client_user_id,
        clientName: r.client_name,
        matterId: r.id,
        matterTitle: r.title,
        description: r.next_action_due_at ? 'Next action due' : r.target_date ? 'Target date' : 'Matter due',
        visibility: 'client',
        clientVisible: true,
        sourcePath: `/matters/${r.id}`,
      })
    }
  }

  if (wantType('field_visit')) {
    const scope = clientClause('fa.client_user_id')
    const win = derivedWindow('fa.scheduled_at', opts.from, opts.to)
    // Field vendors (staff role, no client assignments) must still see the
    // visits assigned to them, so their own vendor_user_id is an OR branch.
    const clauses = [
      `(${scope.clause} OR fa.vendor_user_id = ?)`,
      "fa.status NOT IN ('completed','cancelled')",
      'fa.scheduled_at IS NOT NULL',
      win.clause,
    ].filter(Boolean)
    const where = clauses.join(' AND ')
    const rows = await env.DB.prepare(
      `SELECT fa.id, fa.title, fa.site_label, fa.site_address, fa.scheduled_at, fa.vendor_user_id, fa.client_user_id, u.full_name AS client_name, vu.full_name AS vendor_name
       FROM field_assignments fa
       LEFT JOIN users u ON u.id = fa.client_user_id
       LEFT JOIN users vu ON vu.id = fa.vendor_user_id
       WHERE ${where} ORDER BY fa.scheduled_at ASC LIMIT 300`,
    ).bind(...scope.params, user.id, ...win.params).all<{ id: string; title: string | null; site_label: string | null; site_address: string | null; scheduled_at: string; vendor_user_id: string | null; client_user_id: string; client_name: string | null; vendor_name: string | null }>()
    for (const r of rows.results ?? []) {
      if (opts.vendorUserId && r.vendor_user_id !== opts.vendorUserId) continue
      allItems.push({
        id: `field:${r.id}`,
        derived: true,
        title: r.title || r.site_label || 'Field visit',
        startsAt: r.scheduled_at,
        allDay: false,
        eventType: 'field_visit',
        status: 'confirmed',
        clientUserId: r.client_user_id,
        clientName: r.client_name,
        vendorUserId: r.vendor_user_id,
        vendorName: r.vendor_name,
        locationType: 'field',
        locationName: r.site_label,
        address: r.site_address,
        visibility: 'client',
        clientVisible: true,
        sourcePath: '/field-work/mine',
      })
    }
  }

  if (wantType('matter_deadline')) {
    const scope = clientClause('m.client_user_id')
    const win = derivedWindow('mm.target_at', opts.from, opts.to)
    const where = [scope.clause, 'mm.client_visible = 1', 'mm.target_at IS NOT NULL', win.clause].filter(Boolean).join(' AND ')
    const rows = await env.DB.prepare(
      `SELECT mm.id, mm.name, mm.target_at, mm.matter_id, m.title AS matter_title, m.client_user_id, u.full_name AS client_name
       FROM matter_milestones mm
       JOIN matters m ON m.id = mm.matter_id
       LEFT JOIN users u ON u.id = m.client_user_id
       WHERE ${where} ORDER BY mm.target_at ASC LIMIT 300`,
    ).bind(...scope.params, ...win.params).all<{ id: string; name: string; target_at: string; matter_id: string; matter_title: string; client_user_id: string; client_name: string | null }>()
    for (const r of rows.results ?? []) {
      if (!wantMatter(r.matter_id)) continue
      allItems.push({
        id: `milestone:${r.id}`,
        derived: true,
        title: r.name,
        startsAt: r.target_at,
        allDay: true,
        eventType: 'matter_deadline',
        status: 'proposed',
        clientUserId: r.client_user_id,
        clientName: r.client_name,
        matterId: r.matter_id,
        matterTitle: r.matter_title,
        description: 'Milestone target',
        visibility: 'client',
        clientVisible: true,
        sourcePath: `/matters/${r.matter_id}`,
      })
    }
  }

  if (wantType('phone_call')) {
    const scope = clientClause('pc.client_user_id')
    const win = derivedWindow('pc.scheduled_at', opts.from, opts.to)
    const where = [scope.clause, "pc.status != 'cancelled'", 'pc.scheduled_at IS NOT NULL', win.clause].filter(Boolean).join(' AND ')
    const rows = await env.DB.prepare(
      `SELECT pc.id, pc.topic, pc.scheduled_at, pc.client_user_id, u.full_name AS client_name
       FROM planned_calls pc
       LEFT JOIN users u ON u.id = pc.client_user_id
       WHERE ${where} ORDER BY pc.scheduled_at ASC LIMIT 300`,
    ).bind(...scope.params, ...win.params).all<{ id: string; topic: string; scheduled_at: string; client_user_id: string; client_name: string | null }>()
    for (const r of rows.results ?? []) {
      allItems.push({
        id: `call:${r.id}`,
        derived: true,
        title: r.topic,
        startsAt: r.scheduled_at,
        allDay: false,
        eventType: 'phone_call',
        status: 'confirmed',
        clientUserId: r.client_user_id,
        clientName: r.client_name,
        locationType: 'phone',
        visibility: 'client',
        clientVisible: true,
        sourcePath: '/planned-calls',
      })
    }
  }

  const statusOk = (s: CalendarEventStatus) => wantStatus(s)
  for (const item of allItems) if (statusOk(item.status)) items.push(item)
  return items
}

async function loadClientDerived(env: Env, user: SessionUser, opts: DerivedOptions, out: CalendarEventItem[]): Promise<void> {
  const win = derivedWindow('due_date', opts.from, opts.to)
  const scopeParams = [user.id]
  const wantType = (t: CalendarEventType) => !opts.eventType || opts.eventType === t
  const wantMatter = (m: string | null | undefined) => !opts.matterId || m === opts.matterId

  if (wantType('task_deadline')) {
    const rows = await env.DB.prepare(
      `SELECT t.id, t.title, t.due_date, t.matter_id, m.title AS matter_title
       FROM client_tasks t LEFT JOIN matters m ON m.id = t.matter_id
       WHERE t.client_user_id = ? AND t.status != 'done' AND t.due_date IS NOT NULL AND ${win.clause || '1=1'}
       ORDER BY t.due_date ASC LIMIT 300`,
    ).bind(...scopeParams, ...win.params).all<{ id: string; title: string; due_date: string; matter_id: string | null; matter_title: string | null }>()
    for (const r of rows.results ?? []) {
      if (!wantMatter(r.matter_id)) continue
      out.push({ id: `task:${r.id}`, derived: true, title: r.title, startsAt: r.due_date, allDay: true, eventType: 'task_deadline', status: 'proposed', clientUserId: user.id, matterId: r.matter_id, matterTitle: r.matter_title, taskId: r.id, visibility: 'client', clientVisible: true, sourcePath: `/matters/${r.matter_id ?? ''}` })
    }
  }

  if (wantType('invoice_due')) {
    const rows = await env.DB.prepare(
      `SELECT i.id, i.title, i.invoice_number, i.due_date, i.amount_cents
       FROM invoices i
       WHERE i.client_user_id = ? AND i.status = 'open' AND i.due_date IS NOT NULL AND ${win.clause || '1=1'}
       ORDER BY i.due_date ASC LIMIT 300`,
    ).bind(...scopeParams, ...win.params).all<{ id: string; title: string | null; invoice_number: string | null; due_date: string; amount_cents: number }>()
    for (const r of rows.results ?? []) {
      out.push({ id: `invoice:${r.id}`, derived: true, title: r.title || r.invoice_number || 'Invoice due', startsAt: r.due_date, allDay: true, eventType: 'invoice_due', status: 'proposed', clientUserId: user.id, invoiceId: r.id, description: `Invoice due — $${(r.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, visibility: 'client', clientVisible: true, sourcePath: '/billing' })
    }
  }

  if (wantType('signature_deadline')) {
    const rows = await env.DB.prepare(
      `SELECT e.id, e.title, e.expires_at
       FROM envelopes e
       WHERE e.client_id = ? AND e.status IN ('sent','viewed','in_progress') AND e.expires_at IS NOT NULL AND ${win.clause || '1=1'}
       ORDER BY e.expires_at ASC LIMIT 300`,
    ).bind(...scopeParams, ...win.params).all<{ id: string; title: string; expires_at: string }>()
    for (const r of rows.results ?? []) {
      out.push({ id: `envelope:${r.id}`, derived: true, title: r.title, startsAt: r.expires_at, allDay: true, eventType: 'signature_deadline', status: 'proposed', clientUserId: user.id, envelopeId: r.id, description: 'Signature window closes', visibility: 'client', clientVisible: true, sourcePath: '/documents' })
    }
  }

  if (wantType('matter_deadline')) {
    const rows = await env.DB.prepare(
      `SELECT m.id, m.title, m.next_action_due_at, m.target_date, m.due_date
       FROM matters m
       WHERE m.client_user_id = ? AND m.status != 'closed'`,
    ).bind(...scopeParams).all<{ id: string; title: string; next_action_due_at: string | null; target_date: string | null; due_date: string | null }>()
    for (const r of rows.results ?? []) {
      if (!wantMatter(r.id)) continue
      const at = r.next_action_due_at || r.target_date || r.due_date
      if (!at) continue
      if (opts.from && at < opts.from) continue
      if (opts.to && at >= opts.to) continue
      out.push({ id: `matter:${r.id}`, derived: true, title: r.title, startsAt: at, allDay: true, eventType: 'matter_deadline', status: 'proposed', clientUserId: user.id, matterId: r.id, matterTitle: r.title, description: r.next_action_due_at ? 'Next action due' : r.target_date ? 'Target date' : 'Matter due', visibility: 'client', clientVisible: true, sourcePath: `/matters/${r.id}` })
    }
    const ms = await env.DB.prepare(
      `SELECT mm.id, mm.name, mm.target_at, mm.matter_id, m.title AS matter_title
       FROM matter_milestones mm JOIN matters m ON m.id = mm.matter_id
       WHERE m.client_user_id = ? AND mm.client_visible = 1 AND mm.target_at IS NOT NULL AND ${win.clause || '1=1'}
       ORDER BY mm.target_at ASC LIMIT 300`,
    ).bind(...scopeParams, ...win.params).all<{ id: string; name: string; target_at: string; matter_id: string; matter_title: string }>()
    for (const r of ms.results ?? []) {
      if (!wantMatter(r.matter_id)) continue
      out.push({ id: `milestone:${r.id}`, derived: true, title: r.name, startsAt: r.target_at, allDay: true, eventType: 'matter_deadline', status: 'proposed', clientUserId: user.id, matterId: r.matter_id, matterTitle: r.matter_title, description: 'Milestone target', visibility: 'client', clientVisible: true, sourcePath: `/matters/${r.matter_id}` })
    }
  }

  if (wantType('field_visit')) {
    const rows = await env.DB.prepare(
      `SELECT fa.id, fa.title, fa.site_label, fa.site_address, fa.scheduled_at
       FROM field_assignments fa
       WHERE fa.client_user_id = ? AND fa.status NOT IN ('completed','cancelled') AND fa.scheduled_at IS NOT NULL AND ${win.clause || '1=1'}
       ORDER BY fa.scheduled_at ASC LIMIT 300`,
    ).bind(...scopeParams, ...win.params).all<{ id: string; title: string | null; site_label: string | null; site_address: string | null; scheduled_at: string }>()
    for (const r of rows.results ?? []) {
      out.push({ id: `field:${r.id}`, derived: true, title: r.title || r.site_label || 'Field visit', startsAt: r.scheduled_at, allDay: false, eventType: 'field_visit', status: 'confirmed', clientUserId: user.id, locationType: 'field', locationName: r.site_label, address: r.site_address, visibility: 'client', clientVisible: true, sourcePath: '/field-work/mine' })
    }
  }

  if (wantType('phone_call')) {
    const rows = await env.DB.prepare(
      `SELECT pc.id, pc.topic, pc.scheduled_at
       FROM planned_calls pc
       WHERE pc.client_user_id = ? AND pc.status != 'cancelled' AND pc.scheduled_at IS NOT NULL AND ${win.clause || '1=1'}
       ORDER BY pc.scheduled_at ASC LIMIT 300`,
    ).bind(...scopeParams, ...win.params).all<{ id: string; topic: string; scheduled_at: string }>()
    for (const r of rows.results ?? []) {
      out.push({ id: `call:${r.id}`, derived: true, title: r.topic, startsAt: r.scheduled_at, allDay: false, eventType: 'phone_call', status: 'confirmed', clientUserId: user.id, locationType: 'phone', visibility: 'client', clientVisible: true, sourcePath: '/planned-calls' })
    }
  }
}

// Load a single stored event with an explicit role check. Used by
// PATCH/DELETE so mutating routes never trust a client-supplied id.
export async function loadCalendarEventRow(env: Env, user: SessionUser, id: string): Promise<EventRow | null> {
  const scope = await eventScope(env, user)
  const row = await env.DB.prepare(
    `SELECT ce.*, u.full_name AS client_name, m.title AS matter_title, vu.full_name AS vendor_name, p.address AS property_label
     FROM calendar_events ce
     LEFT JOIN users u ON u.id = ce.client_user_id
     LEFT JOIN users vu ON vu.id = ce.vendor_user_id
     LEFT JOIN matters m ON m.id = ce.matter_id
     LEFT JOIN properties p ON p.id = ce.property_id
     WHERE ce.id = ? AND ${scope.where}`,
  ).bind(id, ...scope.params).first<EventRow>()
  return row ?? null
}

export function calendarEventMeta(item: CalendarEventItem): { label: string; statusLabel: string } {
  return {
    label: calendarEventTypeLabel(item.eventType),
    statusLabel: calendarEventStatusLabel(item.status),
  }
}

export { calendarEventTypeLabel, calendarEventStatusLabel }
