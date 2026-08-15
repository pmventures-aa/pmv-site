import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { requireStaff } from '../mid'
import { uuid } from '../crypto'
import { activityInsert } from '../activity'
import { parseContactName } from '../../../shared/crmRecord'

export const crmRoutes = new Hono<AppEnv>()
crmRoutes.use('*', requireStaff)

const RECORD_TYPES = ['person', 'business'] as const
const LIFECYCLES = ['lead', 'prospect', 'opportunity', 'converted', 'lost'] as const
const PIPELINE_STATUSES = ['new', 'contacted', 'qualified', 'lost'] as const
const EMAIL_STATUSES = ['emailable', 'unsubscribed', 'bounced', 'suppressed'] as const

type RecordType = (typeof RECORD_TYPES)[number]

type DynamicFilter = {
  record_type?: string
  lifecycle_stage?: string
  status?: string
  source?: string
  service_key?: string
  owner_staff_user_id?: string
  email_status?: string
  search?: string
}

function clean(value: unknown, max = 300): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim().slice(0, max)
  return v || null
}

function normalizeRecordType(value: unknown): RecordType {
  return value === 'business' ? 'business' : 'person'
}

function displayName(body: Record<string, unknown>, recordType: RecordType): string {
  if (recordType === 'business') {
    return clean(body.company_name, 200) || clean(body.name, 200) || 'Business lead'
  }
  const first = clean(body.first_name, 100)
  const last = clean(body.last_name, 100)
  return clean(body.name, 200) || [first, last].filter(Boolean).join(' ') || clean(body.company_name, 200) || 'Lead'
}

function importContactNames(row: Record<string, unknown>) {
  const parsed = parseContactName(row.contact_name || row.contact || row.contact_person)
  return {
    first_name: clean(row.first_name, 100) || clean(row.contact_first_name, 100) || clean(parsed.first_name, 100),
    last_name: clean(row.last_name, 100) || clean(row.contact_last_name, 100) || clean(parsed.last_name, 100),
  }
}

function buildDynamicWhere(filter: DynamicFilter, alias = 'ci') {
  const clauses = [`${alias}.converted_at IS NULL`, `${alias}.archived_at IS NULL`]
  const params: string[] = []
  if (filter.record_type && RECORD_TYPES.includes(filter.record_type as any)) {
    clauses.push(`${alias}.record_type = ?`)
    params.push(filter.record_type)
  }
  if (filter.lifecycle_stage && LIFECYCLES.includes(filter.lifecycle_stage as any)) {
    clauses.push(`${alias}.lifecycle_stage = ?`)
    params.push(filter.lifecycle_stage)
  }
  if (filter.status && PIPELINE_STATUSES.includes(filter.status as any)) {
    clauses.push(`${alias}.status = ?`)
    params.push(filter.status)
  }
  if (filter.source) {
    clauses.push(`${alias}.source = ?`)
    params.push(filter.source)
  }
  if (filter.service_key) {
    clauses.push(`${alias}.service_key = ?`)
    params.push(filter.service_key)
  }
  if (filter.owner_staff_user_id) {
    clauses.push(`${alias}.owner_staff_user_id = ?`)
    params.push(filter.owner_staff_user_id)
  }
  if (filter.email_status && EMAIL_STATUSES.includes(filter.email_status as any)) {
    clauses.push(`${alias}.email_status = ?`)
    params.push(filter.email_status)
  }
  if (filter.search?.trim()) {
    const q = `%${filter.search.trim().slice(0, 120)}%`
    clauses.push(`(${alias}.name LIKE ? OR ${alias}.email LIKE ? OR ${alias}.company_name LIKE ? OR ${alias}.phone LIKE ? OR ${alias}.first_name LIKE ? OR ${alias}.last_name LIKE ? OR ${alias}.job_title LIKE ?)`)
    params.push(q, q, q, q, q, q, q)
  }
  return { where: clauses.join(' AND '), params }
}

async function listMembers(env: Env, listId: string) {
  const list = await env.DB.prepare('SELECT * FROM crm_lists WHERE id = ? AND archived_at IS NULL').bind(listId).first<any>()
  if (!list) return null
  if (list.list_type === 'dynamic') {
    let filter: DynamicFilter = {}
    try { filter = list.filter_json ? JSON.parse(list.filter_json) : {} } catch { filter = {} }
    const { where, params } = buildDynamicWhere(filter)
    const res = await env.DB.prepare(
      `SELECT ci.* FROM contact_inquiries ci WHERE ${where} ORDER BY ci.created_at DESC LIMIT 5000`,
    ).bind(...params).all()
    return { list, records: res.results ?? [] }
  }
  const res = await env.DB.prepare(
    `SELECT ci.* FROM crm_list_members lm JOIN contact_inquiries ci ON ci.id = lm.inquiry_id
     WHERE lm.list_id = ? AND ci.archived_at IS NULL ORDER BY ci.created_at DESC LIMIT 5000`,
  ).bind(listId).all()
  return { list, records: res.results ?? [] }
}

crmRoutes.get('/crm/records', async (c) => {
  const listId = c.req.query('list_id')
  if (listId) {
    const result = await listMembers(c.env, listId)
    if (!result) return c.json({ error: 'list not found' }, 404)
    return c.json({ records: result.records, list: result.list })
  }
  const filter: DynamicFilter = {
    record_type: c.req.query('record_type'),
    lifecycle_stage: c.req.query('lifecycle_stage'),
    status: c.req.query('status'),
    source: c.req.query('source'),
    service_key: c.req.query('service_key'),
    owner_staff_user_id: c.req.query('owner_staff_user_id'),
    email_status: c.req.query('email_status'),
    search: c.req.query('q'),
  }
  const { where, params } = buildDynamicWhere(filter)
  const res = await c.env.DB.prepare(
    `SELECT ci.*, s.name AS service_name, u.full_name AS owner_name, u.email AS owner_email,
            (SELECT GROUP_CONCAT(t.name, ', ') FROM crm_record_tags rt JOIN crm_tags t ON t.id = rt.tag_id WHERE rt.inquiry_id = ci.id) AS tags,
            (SELECT COUNT(*) FROM crm_list_members lm WHERE lm.inquiry_id = ci.id) AS list_count
     FROM contact_inquiries ci
     LEFT JOIN services s ON s.key = ci.service_key
     LEFT JOIN users u ON u.id = ci.owner_staff_user_id
     WHERE ${where}
     ORDER BY COALESCE(ci.updated_at, ci.created_at) DESC LIMIT 1000`,
  ).bind(...params).all()
  return c.json({ records: res.results ?? [] })
})

crmRoutes.get('/crm/records/:id', async (c) => {
  const id = c.req.param('id')
  const [record, notes, emails, activity, lists, tags, conversion] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ci.*, s.name AS service_name, u.full_name AS owner_name, u.email AS owner_email
       FROM contact_inquiries ci LEFT JOIN services s ON s.key = ci.service_key
       LEFT JOIN users u ON u.id = ci.owner_staff_user_id WHERE ci.id = ?`,
    ).bind(id).first<any>(),
    c.env.DB.prepare(
      `SELECT n.*, u.full_name AS author_name, u.email AS author_email FROM internal_notes n
       LEFT JOIN users u ON u.id = n.author_user_id WHERE n.inquiry_id = ? AND n.archived_at IS NULL ORDER BY n.created_at DESC`,
    ).bind(id).all(),
    c.env.DB.prepare(
      `SELECT e.*, u.full_name AS sender_name, u.email AS sender_email FROM email_log e
       LEFT JOIN users u ON u.id = e.sent_by_user_id WHERE e.inquiry_id = ? ORDER BY e.created_at DESC LIMIT 300`,
    ).bind(id).all(),
    c.env.DB.prepare(
      `SELECT ae.*, u.full_name AS actor_name, u.email AS actor_email FROM activity_events ae
       LEFT JOIN users u ON u.id = ae.actor_user_id WHERE ae.inquiry_id = ? ORDER BY ae.created_at DESC LIMIT 300`,
    ).bind(id).all(),
    c.env.DB.prepare(
      `SELECT l.* FROM crm_lists l JOIN crm_list_members lm ON lm.list_id = l.id
       WHERE lm.inquiry_id = ? AND l.archived_at IS NULL ORDER BY l.name`,
    ).bind(id).all(),
    c.env.DB.prepare(
      `SELECT t.* FROM crm_tags t JOIN crm_record_tags rt ON rt.tag_id = t.id WHERE rt.inquiry_id = ? ORDER BY t.name`,
    ).bind(id).all(),
    c.env.DB.prepare('SELECT * FROM lead_conversions WHERE inquiry_id = ?').bind(id).first(),
  ])
  if (!record) return c.json({ error: 'not found' }, 404)
  return c.json({
    record,
    notes: notes.results ?? [],
    emails: emails.results ?? [],
    activity: activity.results ?? [],
    lists: lists.results ?? [],
    tags: tags.results ?? [],
    conversion: conversion ?? null,
  })
})

crmRoutes.patch('/crm/records/:id', async (c) => {
  const actor = c.get('user')
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT * FROM contact_inquiries WHERE id = ?').bind(id).first<any>()
  if (!existing) return c.json({ error: 'not found' }, 404)
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as any))

  const textFields = [
    'first_name', 'last_name', 'company_name', 'job_title', 'website', 'industry', 'source', 'phone', 'service_key',
    'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country', 'owner_staff_user_id',
  ] as const
  const values: Record<string, string | null> = {}
  for (const key of textFields) {
    if (body[key] === null) values[key] = null
    else if (typeof body[key] === 'string') values[key] = clean(body[key], key === 'website' ? 500 : 250)
  }
  if (typeof body.record_type === 'string' && RECORD_TYPES.includes(body.record_type as any)) values.record_type = body.record_type
  if (typeof body.lifecycle_stage === 'string' && LIFECYCLES.includes(body.lifecycle_stage as any)) values.lifecycle_stage = body.lifecycle_stage
  if (typeof body.status === 'string' && PIPELINE_STATUSES.includes(body.status as any)) values.status = body.status
  if (typeof body.email_status === 'string' && EMAIL_STATUSES.includes(body.email_status as any)) values.email_status = body.email_status

  const recordType = (values.record_type || existing.record_type || 'person') as RecordType
  const merged = { ...existing, ...values }
  const name = displayName(merged, recordType)
  const sets = Object.keys(values).map((k) => `${k} = ?`)
  const params = Object.values(values)
  sets.push('name = ?', "updated_at = datetime('now')")
  params.push(name)
  if (values.email_status === 'unsubscribed') {
    sets.push("email_unsubscribed_at = datetime('now')")
  } else if (values.email_status === 'emailable') {
    sets.push('email_unsubscribed_at = NULL')
  }
  if (sets.length === 2) return c.json({ error: 'no valid fields supplied' }, 400)
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE contact_inquiries SET ${sets.join(', ')} WHERE id = ?`).bind(...params, id),
    activityInsert(c.env, { actorUserId: actor.id, inquiryId: id, kind: 'lead_profile_updated', detail: { fields: Object.keys(values) } }),
  ])
  return c.json({ ok: true })
})

crmRoutes.post('/crm/records/:id/notes', async (c) => {
  const actor = c.get('user')
  const id = c.req.param('id')
  const record = await c.env.DB.prepare('SELECT id FROM contact_inquiries WHERE id = ?').bind(id).first()
  if (!record) return c.json({ error: 'not found' }, 404)
  const body = await c.req.json<{ body?: string }>().catch(() => ({} as any))
  const note = clean(body.body, 8000)
  if (!note) return c.json({ error: 'note is required' }, 400)
  const noteId = uuid()
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO internal_notes (id, inquiry_id, author_user_id, body) VALUES (?, ?, ?, ?)').bind(noteId, id, actor.id, note),
    activityInsert(c.env, { actorUserId: actor.id, inquiryId: id, kind: 'lead_note_added', detail: { note_id: noteId } }),
  ])
  return c.json({ ok: true, id: noteId }, 201)
})

crmRoutes.get('/crm/staff-directory', async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT id, full_name, email FROM users WHERE role IN ('staff','admin') AND status = 'active' ORDER BY COALESCE(full_name, email)`,
  ).all()
  return c.json({ staff: res.results ?? [] })
})

crmRoutes.get('/crm/lists', async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT l.*, u.full_name AS created_by_name,
       CASE WHEN l.list_type = 'static' THEN (SELECT COUNT(*) FROM crm_list_members lm WHERE lm.list_id = l.id) ELSE NULL END AS member_count
     FROM crm_lists l JOIN users u ON u.id = l.created_by_user_id
     WHERE l.archived_at IS NULL ORDER BY l.name`,
  ).all()
  return c.json({ lists: res.results ?? [] })
})

crmRoutes.post('/crm/lists', async (c) => {
  const actor = c.get('user')
  const body = await c.req.json<{ name?: string; description?: string; list_type?: string; record_type?: string; filter?: DynamicFilter }>().catch(() => ({} as any))
  const name = clean(body.name, 160)
  if (!name) return c.json({ error: 'name is required' }, 400)
  const listType = body.list_type === 'dynamic' ? 'dynamic' : 'static'
  const recordType = body.record_type === 'person' || body.record_type === 'business' ? body.record_type : 'all'
  const id = uuid()
  await c.env.DB.prepare(
    `INSERT INTO crm_lists (id, name, description, list_type, record_type, filter_json, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, name, clean(body.description, 1000), listType, recordType, body.filter ? JSON.stringify(body.filter) : null, actor.id).run()
  return c.json({ ok: true, id }, 201)
})

crmRoutes.patch('/crm/lists/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ name?: string; description?: string; filter?: DynamicFilter; archived?: boolean }>().catch(() => ({} as any))
  const row = await c.env.DB.prepare('SELECT * FROM crm_lists WHERE id = ?').bind(id).first<any>()
  if (!row) return c.json({ error: 'not found' }, 404)
  await c.env.DB.prepare(
    `UPDATE crm_lists SET name = ?, description = ?, filter_json = ?, archived_at = ?, updated_at = datetime('now') WHERE id = ?`,
  ).bind(
    clean(body.name, 160) ?? row.name,
    body.description === undefined ? row.description : clean(body.description, 1000),
    body.filter === undefined ? row.filter_json : JSON.stringify(body.filter),
    body.archived === true ? new Date().toISOString() : body.archived === false ? null : row.archived_at,
    id,
  ).run()
  return c.json({ ok: true })
})

crmRoutes.get('/crm/lists/:id/members', async (c) => {
  const result = await listMembers(c.env, c.req.param('id'))
  if (!result) return c.json({ error: 'not found' }, 404)
  return c.json(result)
})

crmRoutes.post('/crm/lists/:id/members', async (c) => {
  const actor = c.get('user')
  const listId = c.req.param('id')
  const list = await c.env.DB.prepare('SELECT list_type FROM crm_lists WHERE id = ? AND archived_at IS NULL').bind(listId).first<{ list_type: string }>()
  if (!list) return c.json({ error: 'not found' }, 404)
  if (list.list_type !== 'static') return c.json({ error: 'dynamic segments are controlled by their filter rules' }, 400)
  const body = await c.req.json<{ inquiry_ids?: string[] }>().catch(() => ({} as any))
  const ids = Array.isArray(body.inquiry_ids) ? [...new Set(body.inquiry_ids.filter((v: unknown) => typeof v === 'string'))].slice(0, 5000) : []
  if (ids.length === 0) return c.json({ error: 'pick at least one record' }, 400)
  await c.env.DB.batch(ids.map((recordId) => c.env.DB.prepare(
    `INSERT INTO crm_list_members (list_id, inquiry_id, added_by_user_id) VALUES (?, ?, ?)
     ON CONFLICT(list_id, inquiry_id) DO NOTHING`,
  ).bind(listId, recordId, actor.id)))
  return c.json({ ok: true, count: ids.length })
})

crmRoutes.delete('/crm/lists/:listId/members/:recordId', async (c) => {
  await c.env.DB.prepare('DELETE FROM crm_list_members WHERE list_id = ? AND inquiry_id = ?')
    .bind(c.req.param('listId'), c.req.param('recordId')).run()
  return c.json({ ok: true })
})

crmRoutes.post('/crm/imports', async (c) => {
  const actor = c.get('user')
  const body = await c.req.json<{
    file_name?: string
    record_type?: string
    duplicate_mode?: 'skip' | 'update'
    rows?: Record<string, unknown>[]
  }>().catch(() => ({} as any))
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 2000) : []
  if (rows.length === 0) return c.json({ error: 'no import rows supplied' }, 400)
  const defaultType = normalizeRecordType(body.record_type)
  const duplicateMode = body.duplicate_mode === 'update' ? 'update' : 'skip'
  const serviceRows = await c.env.DB.prepare('SELECT key FROM services').all<{ key: string }>()
  const validServices = new Set((serviceRows.results ?? []).map((r) => r.key))

  let created = 0
  let updated = 0
  let skipped = 0
  const errors: { row: number; message: string }[] = []

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    const email = clean(row.email, 250)?.toLowerCase() ?? null
    if (!email || !email.includes('@')) {
      skipped++
      if (errors.length < 100) errors.push({ row: index + 2, message: 'Valid email required' })
      continue
    }
    const recordType = normalizeRecordType(row.record_type || defaultType)
    const contact = importContactNames(row)
    const name = displayName({ ...row, first_name: contact.first_name, last_name: contact.last_name }, recordType)
    const existing = await c.env.DB.prepare('SELECT id FROM contact_inquiries WHERE lower(email) = lower(?) AND archived_at IS NULL ORDER BY created_at DESC LIMIT 1')
      .bind(email).first<{ id: string }>()
    const serviceKey = typeof row.service_key === 'string' && validServices.has(row.service_key) ? row.service_key : null
    if (existing) {
      if (duplicateMode === 'skip') { skipped++; continue }
      await c.env.DB.prepare(
        `UPDATE contact_inquiries SET
           name = ?, record_type = ?, first_name = ?, last_name = ?, company_name = ?, job_title = ?, phone = ?, website = ?, industry = ?,
           source = COALESCE(?, source), lifecycle_stage = COALESCE(?, lifecycle_stage), service_key = COALESCE(?, service_key), updated_at = datetime('now')
         WHERE id = ?`,
      ).bind(
        name, recordType, contact.first_name, contact.last_name, clean(row.company_name, 200), clean(row.job_title, 160),
        clean(row.phone, 60), clean(row.website, 500), clean(row.industry, 160), clean(row.source, 160),
        typeof row.lifecycle_stage === 'string' && LIFECYCLES.includes(row.lifecycle_stage as any) ? row.lifecycle_stage : null,
        serviceKey, existing.id,
      ).run()
      updated++
      continue
    }
    const id = uuid()
    const lifecycle = typeof row.lifecycle_stage === 'string' && LIFECYCLES.includes(row.lifecycle_stage as any) ? row.lifecycle_stage : 'lead'
    const status = typeof row.status === 'string' && PIPELINE_STATUSES.includes(row.status as any) ? row.status : 'new'
    await c.env.DB.prepare(
      `INSERT INTO contact_inquiries
       (id, name, email, phone, service_key, message, status, record_type, first_name, last_name, company_name, job_title, website, industry, source, lifecycle_stage, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(
      id, name, email, clean(row.phone, 60), serviceKey, clean(row.message ?? row.notes, 4000) ?? '', status, recordType,
      contact.first_name, contact.last_name, clean(row.company_name, 200), clean(row.job_title, 160), clean(row.website, 500),
      clean(row.industry, 160), clean(row.source, 160) ?? 'CSV import', lifecycle,
    ).run()
    created++
  }

  const importId = uuid()
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO crm_imports (id, created_by_user_id, file_name, record_type, total_rows, created_rows, updated_rows, skipped_rows, errors_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(importId, actor.id, clean(body.file_name, 255), defaultType, rows.length, created, updated, skipped, errors.length ? JSON.stringify(errors) : null),
    activityInsert(c.env, { actorUserId: actor.id, kind: 'crm_import_completed', detail: { import_id: importId, created, updated, skipped } }),
  ])
  return c.json({ ok: true, id: importId, total: rows.length, created, updated, skipped, errors })
})

crmRoutes.get('/crm/imports', async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT i.*, u.full_name AS created_by_name, u.email AS created_by_email
     FROM crm_imports i JOIN users u ON u.id = i.created_by_user_id ORDER BY i.created_at DESC LIMIT 100`,
  ).all()
  return c.json({ imports: res.results ?? [] })
})
