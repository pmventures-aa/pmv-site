import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { requireStaff } from '../mid'
import { requireCapability } from '../capabilities'
import { uuid } from '../crypto'
import { sendEmailStrict } from '../email'
import { logActivity } from '../activity'
import { getMarketingComplianceConfig, createUnsubscribeToken, appendMarketingFooter } from '../marketingCompliance'
import { hqInboundAddress, formattedReplyTo } from '../resendInbound'

export const commsRoutes = new Hono<AppEnv>()

type MessageType = 'marketing' | 'operational' | 'internal'

interface Audience {
  segments: string[]
  user_ids: string[]
  inquiry_ids: string[]
  list_ids: string[]
}

interface Recipient {
  key: string
  recipient_kind: 'user' | 'lead'
  user_id: string | null
  inquiry_id: string | null
  email: string
  full_name: string | null
  role: string | null
}

function parseAudience(body: any): Audience {
  const pick = (value: unknown) => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  return {
    segments: pick(body?.audience?.segments),
    user_ids: pick(body?.audience?.user_ids),
    inquiry_ids: pick(body?.audience?.inquiry_ids),
    list_ids: pick(body?.audience?.list_ids),
  }
}

function parseMessageType(value: unknown): MessageType {
  return value === 'operational' || value === 'internal' ? value : 'marketing'
}

export function userEligible(row: any, type: MessageType): boolean {
  if (row.status === 'suspended') return false
  const pendingStaff = row.status === 'pending' && (row.role === 'staff' || row.role === 'admin')
  if (type === 'internal') return (row.role === 'staff' || row.role === 'admin') && (row.status === 'active' || pendingStaff)
  if (type === 'operational') {
    if (row.status !== 'active' && !pendingStaff) return false
    return !['bounced', 'suppressed'].includes(row.marketing_email_status || 'emailable')
  }
  if (row.status !== 'active') return false
  return (row.marketing_email_status || 'emailable') === 'emailable'
}

function leadEligible(row: any, type: MessageType): boolean {
  if (type === 'internal') return false
  if (row.converted_at || row.archived_at) return false
  if (type === 'marketing') return (row.email_status || 'emailable') === 'emailable'
  return !['bounced', 'suppressed'].includes(row.email_status || 'emailable')
}

function addUser(byEmail: Map<string, Recipient>, row: any, type: MessageType) {
  if (!row?.email || !userEligible(row, type)) return
  const email = String(row.email).trim().toLowerCase()
  byEmail.set(email, {
    key: `user:${row.id}`,
    recipient_kind: 'user',
    user_id: row.id,
    inquiry_id: null,
    email,
    full_name: row.full_name ?? null,
    role: row.role ?? null,
  })
}

function addLead(byEmail: Map<string, Recipient>, row: any, type: MessageType) {
  if (!row?.email || !leadEligible(row, type)) return
  const email = String(row.email).trim().toLowerCase()
  if (byEmail.has(email) && byEmail.get(email)?.recipient_kind === 'user') return
  byEmail.set(email, {
    key: `lead:${row.id}`,
    recipient_kind: 'lead',
    user_id: null,
    inquiry_id: row.id,
    email,
    full_name: row.name ?? row.company_name ?? null,
    role: null,
  })
}

async function resolveDynamicList(env: Env, list: any): Promise<any[]> {
  let filter: Record<string, string> = {}
  try { filter = list.filter_json ? JSON.parse(list.filter_json) : {} } catch { filter = {} }
  const clauses = ['ci.converted_at IS NULL', 'ci.archived_at IS NULL']
  const params: string[] = []
  for (const [key, column] of Object.entries({
    record_type: 'ci.record_type',
    lifecycle_stage: 'ci.lifecycle_stage',
    status: 'ci.status',
    source: 'ci.source',
    service_key: 'ci.service_key',
    owner_staff_user_id: 'ci.owner_staff_user_id',
    email_status: 'ci.email_status',
  })) {
    const value = filter[key]
    if (value) { clauses.push(`${column} = ?`); params.push(value) }
  }
  if (filter.search) {
    const q = `%${String(filter.search).slice(0, 120)}%`
    clauses.push('(ci.name LIKE ? OR ci.email LIKE ? OR ci.company_name LIKE ? OR ci.phone LIKE ?)')
    params.push(q, q, q, q)
  }
  const res = await env.DB.prepare(`SELECT ci.* FROM contact_inquiries ci WHERE ${clauses.join(' AND ')} LIMIT 10000`).bind(...params).all()
  return res.results ?? []
}

async function resolveAudience(env: Env, audience: Audience, type: MessageType): Promise<Recipient[]> {
  const byEmail = new Map<string, Recipient>()

  for (const segment of audience.segments ?? []) {
    if (segment === 'all_employees' || segment === 'all_vendors' || segment === 'pending_vendors' || segment.startsWith('vendor_category:')) {
      let where = ''
      const params: string[] = []
      if (segment === 'all_employees') {
        where = "u.role IN ('staff','admin') AND (tm.party_type IS NULL OR tm.party_type = 'employee')"
      } else if (segment === 'pending_vendors') {
        where = "u.role = 'staff' AND tm.party_type = 'vendor' AND u.status = 'pending'"
      } else if (segment === 'all_vendors') {
        where = "u.role = 'staff' AND tm.party_type = 'vendor'"
      } else {
        where = "u.role = 'staff' AND tm.party_type = 'vendor' AND tm.vendor_category = ?"
        params.push(segment.slice('vendor_category:'.length))
      }
      const rows = await env.DB.prepare(
        `SELECT u.id, u.email, u.full_name, u.role, u.status, u.marketing_email_status
         FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id WHERE ${where}`,
      ).bind(...params).all()
      for (const row of rows.results ?? []) addUser(byEmail, row, type)
      continue
    }

    if (segment === 'all_clients') {
      const rows = await env.DB.prepare(
        `SELECT id, email, full_name, role, status, marketing_email_status FROM users WHERE role = 'client'`,
      ).all()
      for (const row of rows.results ?? []) addUser(byEmail, row, type)
      continue
    }

    let leadWhere: string | null = null
    const params: string[] = []
    if (segment === 'all_leads') leadWhere = 'converted_at IS NULL AND archived_at IS NULL'
    else if (segment.startsWith('lifecycle:')) { leadWhere = 'converted_at IS NULL AND archived_at IS NULL AND lifecycle_stage = ?'; params.push(segment.slice('lifecycle:'.length)) }
    else if (segment.startsWith('lead_status:')) { leadWhere = 'converted_at IS NULL AND archived_at IS NULL AND status = ?'; params.push(segment.slice('lead_status:'.length)) }
    else if (segment.startsWith('record_type:')) { leadWhere = 'converted_at IS NULL AND archived_at IS NULL AND record_type = ?'; params.push(segment.slice('record_type:'.length)) }
    if (leadWhere) {
      const rows = await env.DB.prepare(`SELECT * FROM contact_inquiries WHERE ${leadWhere}`).bind(...params).all()
      for (const row of rows.results ?? []) addLead(byEmail, row, type)
    }
  }

  if (audience.list_ids.length > 0) {
    const placeholders = audience.list_ids.map(() => '?').join(',')
    const lists = await env.DB.prepare(`SELECT * FROM crm_lists WHERE id IN (${placeholders}) AND archived_at IS NULL`).bind(...audience.list_ids).all<any>()
    for (const list of lists.results ?? []) {
      const rows = list.list_type === 'dynamic'
        ? await resolveDynamicList(env, list)
        : (await env.DB.prepare(
          `SELECT ci.* FROM crm_list_members lm JOIN contact_inquiries ci ON ci.id = lm.inquiry_id WHERE lm.list_id = ? AND ci.archived_at IS NULL`,
        ).bind(list.id).all()).results ?? []
      for (const row of rows) addLead(byEmail, row, type)
    }
  }

  if (audience.user_ids.length > 0) {
    const ids = [...new Set(audience.user_ids)].slice(0, 5000)
    const placeholders = ids.map(() => '?').join(',')
    const rows = await env.DB.prepare(
      `SELECT id, email, full_name, role, status, marketing_email_status FROM users WHERE id IN (${placeholders})`,
    ).bind(...ids).all()
    for (const row of rows.results ?? []) addUser(byEmail, row, type)
  }

  if (audience.inquiry_ids.length > 0) {
    const ids = [...new Set(audience.inquiry_ids)].slice(0, 5000)
    const placeholders = ids.map(() => '?').join(',')
    const rows = await env.DB.prepare(`SELECT * FROM contact_inquiries WHERE id IN (${placeholders})`).bind(...ids).all()
    for (const row of rows.results ?? []) addLead(byEmail, row, type)
  }

  return [...byEmail.values()]
}

commsRoutes.get('/comms/audience', requireStaff, async (c) => {
  const [counts, categories, users, leads, lists] = await Promise.all([
    c.env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id WHERE u.role IN ('staff','admin') AND u.status IN ('active','pending') AND (tm.party_type IS NULL OR tm.party_type = 'employee')) AS employees,
        (SELECT COUNT(*) FROM users u JOIN team_members tm ON tm.user_id = u.id WHERE u.role = 'staff' AND u.status IN ('active','pending') AND tm.party_type = 'vendor') AS vendors,
        (SELECT COUNT(*) FROM users u JOIN team_members tm ON tm.user_id = u.id WHERE u.role = 'staff' AND u.status = 'pending' AND tm.party_type = 'vendor') AS pending_vendors,
        (SELECT COUNT(*) FROM users WHERE role = 'client' AND status = 'active') AS clients,
        (SELECT COUNT(*) FROM contact_inquiries WHERE converted_at IS NULL AND archived_at IS NULL) AS leads,
        (SELECT COUNT(*) FROM contact_inquiries WHERE converted_at IS NULL AND archived_at IS NULL AND lifecycle_stage = 'prospect') AS prospects,
        (SELECT COUNT(*) FROM contact_inquiries WHERE converted_at IS NULL AND archived_at IS NULL AND lifecycle_stage = 'opportunity') AS opportunities`,
    ).first(),
    c.env.DB.prepare(
      "SELECT DISTINCT vendor_category AS category, COUNT(*) AS n FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.party_type = 'vendor' AND u.status IN ('active','pending') AND vendor_category IS NOT NULL GROUP BY vendor_category ORDER BY vendor_category",
    ).all(),
    c.env.DB.prepare(
      `SELECT u.id, u.email, u.full_name, u.role, u.status, u.marketing_email_status, tm.party_type, tm.vendor_category, tm.title
       FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id WHERE u.role IN ('client','staff','admin') ORDER BY u.full_name, u.email LIMIT 2000`,
    ).all(),
    c.env.DB.prepare(
      `SELECT id, name, email, phone, company_name, record_type, lifecycle_stage, status, email_status
       FROM contact_inquiries WHERE converted_at IS NULL AND archived_at IS NULL ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 2000`,
    ).all(),
    c.env.DB.prepare(`SELECT id, name, list_type, record_type FROM crm_lists WHERE archived_at IS NULL ORDER BY name`).all(),
  ])
  return c.json({
    counts: counts ?? { employees: 0, vendors: 0, pending_vendors: 0, clients: 0, leads: 0, prospects: 0, opportunities: 0 },
    vendor_categories: categories.results ?? [],
    people: users.results ?? [],
    leads: leads.results ?? [],
    lists: lists.results ?? [],
  })
})

commsRoutes.get('/comms/messages', requireStaff, async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT m.id, m.subject, m.message_type, m.send_mode, m.status, m.scheduled_at, m.recurrence, m.next_run_at, m.last_sent_at, m.sent_at, m.created_at,
            u.full_name AS created_by_name,
            (SELECT COUNT(*) FROM comms_recipients r WHERE r.message_id = m.id) AS recipient_count,
            (SELECT COUNT(*) FROM comms_recipients r WHERE r.message_id = m.id AND r.status IN ('sent','delivered')) AS sent_count,
            (SELECT COUNT(*) FROM comms_recipients r WHERE r.message_id = m.id AND r.status = 'delivered') AS delivered_count,
            (SELECT COUNT(*) FROM comms_recipients r WHERE r.message_id = m.id AND r.status IN ('failed','bounced','suppressed')) AS failed_count
     FROM comms_messages m JOIN users u ON u.id = m.created_by_user_id ORDER BY m.created_at DESC LIMIT 300`,
  ).all()
  return c.json({ messages: res.results ?? [] })
})

commsRoutes.get('/comms/folders', requireStaff, async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) total,
            SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) drafts,
            SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) scheduled,
            SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) sent,
            SUM(CASE WHEN status IN ('failed','canceled') THEN 1 ELSE 0 END) exceptions
     FROM comms_messages`,
  ).first<any>()
  return c.json({
    total: Number(row?.total || 0),
    drafts: Number(row?.drafts || 0),
    scheduled: Number(row?.scheduled || 0),
    sent: Number(row?.sent || 0),
    exceptions: Number(row?.exceptions || 0),
  })
})

commsRoutes.get('/comms/messages/:id', requireStaff, async (c) => {
  const id = c.req.param('id') ?? ''
  const [message, recipients] = await Promise.all([
    c.env.DB.prepare(`SELECT m.*, u.full_name AS created_by_name, u.email AS created_by_email FROM comms_messages m JOIN users u ON u.id = m.created_by_user_id WHERE m.id = ?`).bind(id).first(),
    c.env.DB.prepare(`SELECT id,email,full_name,recipient_kind,status,provider_message_id,sent_at,error FROM comms_recipients WHERE message_id = ? ORDER BY COALESCE(full_name,email),email`).bind(id).all(),
  ])
  if (!message) return c.json({ error: 'not found' }, 404)
  return c.json({ message, recipients: recipients.results ?? [] })
})

async function insertRecipients(env: Env, messageId: string, recipients: Recipient[]) {
  const rows = recipients.map((recipient) => ({ ...recipient, row_id: uuid() }))
  if (rows.length > 0) {
    await env.DB.batch(rows.map((r) => env.DB.prepare(
      `INSERT INTO comms_recipients (id, message_id, user_id, inquiry_id, recipient_kind, email, full_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(r.row_id, messageId, r.user_id, r.inquiry_id, r.recipient_kind, r.email, r.full_name)))
  }
  return rows
}

async function dispatchNow(
  env: Env,
  actorUserId: string,
  messageId: string,
  subject: string,
  bodyHtml: string,
  recipients: Awaited<ReturnType<typeof insertRecipients>>,
  messageType: MessageType,
) {
  const marketingConfig = messageType === 'marketing' ? await getMarketingComplianceConfig(env) : null
  await Promise.all(recipients.map(async (r) => {
    try {
      const deliveryHtml = marketingConfig
        ? appendMarketingFooter(bodyHtml, marketingConfig, await createUnsubscribeToken(env, r.email))
        : bodyHtml
      const providerMessageId = await sendEmailStrict(env, { to: r.email, subject, html: deliveryHtml, replyTo: formattedReplyTo(hqInboundAddress(env)) })
      const statements = [
        env.DB.prepare("UPDATE comms_recipients SET status = 'sent', provider_message_id = ?, sent_at = datetime('now') WHERE id = ?").bind(providerMessageId, r.row_id),
      ]
      if (r.recipient_kind === 'lead' && r.inquiry_id) {
        statements.push(
          env.DB.prepare(
            `INSERT INTO email_log (id, inquiry_id, sent_by_user_id, to_address, subject, body) VALUES (?, ?, ?, ?, ?, ?)`,
          ).bind(uuid(), r.inquiry_id, actorUserId, r.email, subject, deliveryHtml),
          env.DB.prepare("UPDATE contact_inquiries SET last_contacted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(r.inquiry_id),
        )
      } else if (r.user_id && r.role === 'client') {
        statements.push(env.DB.prepare(
          `INSERT INTO email_log (id, client_user_id, sent_by_user_id, to_address, subject, body) VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(uuid(), r.user_id, actorUserId, r.email, subject, deliveryHtml))
      }
      await env.DB.batch(statements)
    } catch (err) {
      await env.DB.prepare("UPDATE comms_recipients SET status = 'failed', error = ? WHERE id = ?")
        .bind(String(err).slice(0, 500), r.row_id).run()
    }
  }))
  await env.DB.prepare(
    "UPDATE comms_messages SET status = 'sent', sent_at = datetime('now'), last_sent_at = datetime('now'), next_run_at = NULL, updated_at = datetime('now') WHERE id = ?",
  ).bind(messageId).run()
}

commsRoutes.post('/comms/messages', requireStaff, requireCapability('can_manage_communications'), async (c) => {
  const user = c.get('user')
  const body = await c.req.json<any>().catch(() => ({}))
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 200) : ''
  const bodyHtml = typeof body.body_html === 'string' ? body.body_html.slice(0, 200000) : ''
  if (!subject) return c.json({ error: 'a subject is required' }, 400)
  if (!bodyHtml.trim()) return c.json({ error: 'a message body is required' }, 400)

  const audience = parseAudience(body)
  if (audience.segments.length + audience.user_ids.length + audience.inquiry_ids.length + audience.list_ids.length === 0) {
    return c.json({ error: 'pick at least one segment, list, or recipient' }, 400)
  }
  const messageType = parseMessageType(body.message_type)
  const action = body.action === 'send_now' || body.action === 'schedule' ? body.action : 'draft'
  if (messageType === 'marketing' && action !== 'draft') {
    try { await getMarketingComplianceConfig(c.env) }
    catch (err) { return c.json({ error: err instanceof Error ? err.message : 'Marketing compliance settings are incomplete.' }, 400) }
  }
  const recurrence = body.recurrence === 'daily' || body.recurrence === 'weekly' || body.recurrence === 'monthly' ? body.recurrence : null
  const sendMode = action === 'schedule' ? 'scheduled' : 'manual'
  let scheduledAt: string | null = null
  if (action === 'schedule') {
    const d = body.scheduled_at ? new Date(body.scheduled_at) : null
    if (!d || Number.isNaN(d.getTime())) return c.json({ error: 'a valid scheduled date/time is required' }, 400)
    scheduledAt = d.toISOString()
  }

  const recipientsPreview = await resolveAudience(c.env, audience, messageType)
  if ((action === 'send_now' || action === 'schedule') && recipientsPreview.length === 0) {
    return c.json({ error: 'no eligible recipients matched that audience' }, 400)
  }

  const id = uuid()
  const status = action === 'schedule' ? 'queued' : 'draft'
  await c.env.DB.prepare(
    `INSERT INTO comms_messages (id, created_by_user_id, subject, body_html, message_type, send_mode, status, audience_json, scheduled_at, recurrence, next_run_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, user.id, subject, bodyHtml, messageType, sendMode, status, JSON.stringify(audience), scheduledAt, recurrence, scheduledAt).run()

  if (action === 'send_now') {
    const recipientRows = await insertRecipients(c.env, id, recipientsPreview)
    await c.env.DB.prepare("UPDATE comms_messages SET status = 'sending', updated_at = datetime('now') WHERE id = ?").bind(id).run()
    c.executionCtx.waitUntil(dispatchNow(c.env, user.id, id, subject, bodyHtml, recipientRows, messageType))
  }

  await logActivity(c.env, { actorUserId: user.id, kind: 'comms_message_created', detail: { subject, action, message_type: messageType, eligible_recipients: recipientsPreview.length } })
  return c.json({ ok: true, id, eligible_recipients: recipientsPreview.length }, 201)
})

commsRoutes.post('/comms/audience/preview', requireStaff, requireCapability('can_manage_communications'), async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const audience = parseAudience(body)
  const messageType = parseMessageType(body.message_type)
  const recipients = await resolveAudience(c.env, audience, messageType)
  return c.json({ count: recipients.length, recipients: recipients.slice(0, 100) })
})

commsRoutes.post('/comms/messages/:id/send', requireStaff, requireCapability('can_manage_communications'), async (c) => {
  const user = c.get('user')
  const id = c.req.param('id') ?? ''
  const message = await c.env.DB.prepare('SELECT * FROM comms_messages WHERE id = ?').bind(id).first<any>()
  if (!message) return c.json({ error: 'not found' }, 404)
  if (message.status !== 'draft') return c.json({ error: 'only drafts can be sent this way' }, 400)
  const audience: Audience = JSON.parse(message.audience_json || '{}')
  const draftMessageType = parseMessageType(message.message_type)
  if (draftMessageType === 'marketing') {
    try { await getMarketingComplianceConfig(c.env) }
    catch (err) { return c.json({ error: err instanceof Error ? err.message : 'Marketing compliance settings are incomplete.' }, 400) }
  }
  const recipients = await resolveAudience(c.env, audience, draftMessageType)
  if (recipients.length === 0) return c.json({ error: 'no eligible recipients matched that audience' }, 400)
  const recipientRows = await insertRecipients(c.env, id, recipients)
  await c.env.DB.prepare("UPDATE comms_messages SET status = 'sending', updated_at = datetime('now') WHERE id = ?").bind(id).run()
  c.executionCtx.waitUntil(dispatchNow(c.env, user.id, id, message.subject, message.body_html, recipientRows, draftMessageType))
  await logActivity(c.env, { actorUserId: user.id, kind: 'comms_message_sent', detail: { subject: message.subject, recipients: recipients.length } })
  return c.json({ ok: true, recipients: recipients.length })
})

commsRoutes.delete('/comms/messages/:id', requireStaff, requireCapability('can_manage_communications'), async (c) => {
  const id = c.req.param('id') ?? ''
  const message = await c.env.DB.prepare('SELECT status FROM comms_messages WHERE id = ?').bind(id).first<{ status: string }>()
  if (!message) return c.json({ error: 'not found' }, 404)
  if (message.status === 'sending' || message.status === 'sent') return c.json({ error: 'a message that has already gone out cannot be canceled' }, 400)
  await c.env.DB.prepare("UPDATE comms_messages SET status = 'canceled', next_run_at = NULL, updated_at = datetime('now') WHERE id = ?").bind(id).run()
  return c.json({ ok: true })
})

const MAX_COMMS_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

commsRoutes.post('/comms/images', requireStaff, requireCapability('can_manage_communications'), async (c) => {
  if (!c.env.UPLOADS) return c.json({ error: 'image uploads are not configured yet' }, 503)
  const contentType = c.req.header('Content-Type') || ''
  const ext = ALLOWED_IMAGE_TYPES[contentType]
  if (!ext) return c.json({ error: 'unsupported image type — use PNG, JPEG, WebP, or GIF' }, 400)
  const body = await c.req.arrayBuffer()
  if (body.byteLength === 0) return c.json({ error: 'empty upload' }, 400)
  if (body.byteLength > MAX_COMMS_IMAGE_BYTES) return c.json({ error: 'image too large — 5MB max' }, 413)
  const key = `comms/${uuid()}.${ext}`
  await c.env.UPLOADS.put(key, body, { httpMetadata: { contentType } })
  return c.json({ ok: true, url: `/api/comms-images/${encodeURIComponent(key.slice('comms/'.length))}` })
})
