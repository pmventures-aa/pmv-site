import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { requireStaff, requireAdmin } from '../mid'
import { requireCapability } from '../capabilities'
import { uuid } from '../crypto'
import { sendEmail } from '../email'
import { logActivity } from '../activity'

export const commsRoutes = new Hono<AppEnv>()

interface Audience {
  segments: string[] // 'all_employees' | 'all_vendors' | 'vendor_category:<x>'
  user_ids: string[]
}

interface Recipient {
  user_id: string
  email: string
  full_name: string | null
}

// Shared by the manual send-now path here and by the recurring-campaign
// flusher (scripts/comms-cron.mjs, which talks to D1 over its REST API
// instead of this binding — same SQL, duplicated there on purpose since
// that script runs outside the Pages Functions runtime and can't import
// this module).
async function resolveAudience(env: Env, audience: Audience): Promise<Recipient[]> {
  const byId = new Map<string, Recipient>()

  for (const segment of audience.segments ?? []) {
    let where = ''
    const params: string[] = []
    if (segment === 'all_employees') {
      where = "u.role IN ('staff','admin') AND u.status = 'active' AND (tm.party_type IS NULL OR tm.party_type = 'employee')"
    } else if (segment === 'all_vendors') {
      where = "u.role = 'staff' AND u.status = 'active' AND tm.party_type = 'vendor'"
    } else if (segment.startsWith('vendor_category:')) {
      where = "u.role = 'staff' AND u.status = 'active' AND tm.party_type = 'vendor' AND tm.vendor_category = ?"
      params.push(segment.slice('vendor_category:'.length))
    } else {
      continue
    }
    const res = await env.DB.prepare(
      `SELECT u.id, u.email, u.full_name FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id WHERE ${where}`,
    ).bind(...params).all<{ id: string; email: string; full_name: string | null }>()
    for (const row of res.results ?? []) byId.set(row.id, { user_id: row.id, email: row.email, full_name: row.full_name })
  }

  const explicitIds = (audience.user_ids ?? []).filter((id) => !byId.has(id))
  if (explicitIds.length > 0) {
    const placeholders = explicitIds.map(() => '?').join(',')
    const res = await env.DB.prepare(
      `SELECT id, email, full_name FROM users WHERE id IN (${placeholders}) AND status = 'active'`,
    ).bind(...explicitIds).all<{ id: string; email: string; full_name: string | null }>()
    for (const row of res.results ?? []) byId.set(row.id, { user_id: row.id, email: row.email, full_name: row.full_name })
  }

  return [...byId.values()]
}

function parseAudience(body: any): Audience {
  const segments = Array.isArray(body?.audience?.segments) ? body.audience.segments.filter((s: unknown) => typeof s === 'string') : []
  const userIds = Array.isArray(body?.audience?.user_ids) ? body.audience.user_ids.filter((s: unknown) => typeof s === 'string') : []
  return { segments, user_ids: userIds }
}

// Anyone on staff can see who's pickable and browse send history; actually
// composing/sending is gated by can_manage_communications below.
commsRoutes.get('/comms/audience', requireStaff, async (c) => {
  const [counts, categories, people] = await Promise.all([
    c.env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id WHERE u.role IN ('staff','admin') AND u.status = 'active' AND (tm.party_type IS NULL OR tm.party_type = 'employee')) AS employees,
         (SELECT COUNT(*) FROM users u JOIN team_members tm ON tm.user_id = u.id WHERE u.role = 'staff' AND u.status = 'active' AND tm.party_type = 'vendor') AS vendors`,
    ).first<{ employees: number; vendors: number }>(),
    c.env.DB.prepare(
      "SELECT DISTINCT vendor_category AS category, COUNT(*) AS n FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.party_type = 'vendor' AND u.status = 'active' AND vendor_category IS NOT NULL GROUP BY vendor_category ORDER BY vendor_category",
    ).all<{ category: string; n: number }>(),
    c.env.DB.prepare(
      `SELECT u.id, u.email, u.full_name, u.status, tm.party_type, tm.vendor_category, tm.title
       FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id
       WHERE u.role IN ('staff','admin')
       ORDER BY (tm.party_type = 'vendor'), u.full_name`,
    ).all(),
  ])
  return c.json({
    counts: counts ?? { employees: 0, vendors: 0 },
    vendor_categories: categories.results ?? [],
    people: people.results ?? [],
  })
})

commsRoutes.get('/comms/messages', requireStaff, async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT m.id, m.subject, m.send_mode, m.status, m.scheduled_at, m.recurrence, m.next_run_at, m.last_sent_at, m.sent_at, m.created_at,
            u.full_name AS created_by_name,
            (SELECT COUNT(*) FROM comms_recipients r WHERE r.message_id = m.id) AS recipient_count,
            (SELECT COUNT(*) FROM comms_recipients r WHERE r.message_id = m.id AND r.status = 'sent') AS sent_count,
            (SELECT COUNT(*) FROM comms_recipients r WHERE r.message_id = m.id AND r.status = 'failed') AS failed_count
     FROM comms_messages m JOIN users u ON u.id = m.created_by_user_id
     ORDER BY m.created_at DESC LIMIT 200`,
  ).all()
  return c.json({ messages: res.results ?? [] })
})

commsRoutes.get('/comms/messages/:id', requireStaff, async (c) => {
  const id = c.req.param('id')!
  const [message, recipients] = await Promise.all([
    c.env.DB.prepare(
      `SELECT m.*, u.full_name AS created_by_name FROM comms_messages m JOIN users u ON u.id = m.created_by_user_id WHERE m.id = ?`,
    ).bind(id).first(),
    c.env.DB.prepare('SELECT * FROM comms_recipients WHERE message_id = ? ORDER BY full_name').bind(id).all(),
  ])
  if (!message) return c.json({ error: 'not found' }, 404)
  return c.json({ message, recipients: recipients.results ?? [] })
})

async function dispatchNow(env: Env, messageId: string, subject: string, bodyHtml: string, recipients: Recipient[]) {
  await Promise.all(
    recipients.map(async (r) => {
      try {
        await sendEmail(env, { to: r.email, subject, html: bodyHtml })
        await env.DB.prepare(
          "UPDATE comms_recipients SET status = 'sent', sent_at = datetime('now') WHERE message_id = ? AND user_id = ?",
        ).bind(messageId, r.user_id).run()
      } catch (err) {
        await env.DB.prepare(
          "UPDATE comms_recipients SET status = 'failed', error = ? WHERE message_id = ? AND user_id = ?",
        ).bind(String(err).slice(0, 500), messageId, r.user_id).run()
      }
    }),
  )
  await env.DB.prepare(
    "UPDATE comms_messages SET status = 'sent', sent_at = datetime('now'), last_sent_at = datetime('now'), next_run_at = NULL, updated_at = datetime('now') WHERE id = ?",
  ).bind(messageId).run()
}

// Composing/sending is a step up from just viewing history — same
// delegable-capability pattern as Settings/Reports/Audit Log.
commsRoutes.post('/comms/messages', requireStaff, requireCapability('can_manage_communications'), async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{
    subject?: string
    body_html?: string
    audience?: { segments?: string[]; user_ids?: string[] }
    action?: 'draft' | 'send_now' | 'schedule'
    scheduled_at?: string
    recurrence?: 'daily' | 'weekly' | 'monthly'
  }>().catch(() => ({}) as any)

  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 200) : ''
  const bodyHtml = typeof body.body_html === 'string' ? body.body_html.slice(0, 200000) : ''
  if (!subject) return c.json({ error: 'a subject is required' }, 400)
  if (!bodyHtml.trim()) return c.json({ error: 'a message body is required' }, 400)

  const audience = parseAudience(body)
  if (audience.segments.length === 0 && audience.user_ids.length === 0) {
    return c.json({ error: 'pick at least one segment or recipient' }, 400)
  }

  const action = body.action === 'send_now' || body.action === 'schedule' ? body.action : 'draft'
  const recurrence = body.recurrence === 'daily' || body.recurrence === 'weekly' || body.recurrence === 'monthly' ? body.recurrence : null
  const sendMode = action === 'schedule' ? 'scheduled' : 'manual'

  let scheduledAt: string | null = null
  if (action === 'schedule') {
    const d = body.scheduled_at ? new Date(body.scheduled_at) : null
    if (!d || Number.isNaN(d.getTime())) return c.json({ error: 'a valid scheduled date/time is required' }, 400)
    scheduledAt = d.toISOString()
  }

  const id = uuid()
  const status = action === 'schedule' ? 'queued' : 'draft'
  await c.env.DB.prepare(
    `INSERT INTO comms_messages (id, created_by_user_id, subject, body_html, send_mode, status, audience_json, scheduled_at, recurrence, next_run_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, user.id, subject, bodyHtml, sendMode, status, JSON.stringify(audience), scheduledAt, recurrence, scheduledAt).run()

  if (action === 'send_now') {
    const recipients = await resolveAudience(c.env, audience)
    if (recipients.length === 0) return c.json({ error: 'no active recipients matched that audience' }, 400)
    await c.env.DB.batch(
      recipients.map((r) =>
        c.env.DB.prepare('INSERT INTO comms_recipients (id, message_id, user_id, email, full_name) VALUES (?, ?, ?, ?, ?)').bind(uuid(), id, r.user_id, r.email, r.full_name),
      ),
    )
    await c.env.DB.prepare("UPDATE comms_messages SET status = 'sending', updated_at = datetime('now') WHERE id = ?").bind(id).run()
    c.executionCtx.waitUntil(dispatchNow(c.env, id, subject, bodyHtml, recipients))
  }

  await logActivity(c.env, { actorUserId: user.id, clientUserId: null, kind: 'comms_message_created', detail: { subject, action } })
  return c.json({ ok: true, id }, 201)
})

// Send a saved draft immediately.
commsRoutes.post('/comms/messages/:id/send', requireStaff, requireCapability('can_manage_communications'), async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')!
  const message = await c.env.DB.prepare('SELECT * FROM comms_messages WHERE id = ?').bind(id).first<any>()
  if (!message) return c.json({ error: 'not found' }, 404)
  if (message.status !== 'draft') return c.json({ error: 'only drafts can be sent this way' }, 400)

  const audience: Audience = JSON.parse(message.audience_json)
  const recipients = await resolveAudience(c.env, audience)
  if (recipients.length === 0) return c.json({ error: 'no active recipients matched that audience' }, 400)

  await c.env.DB.batch(
    recipients.map((r) =>
      c.env.DB.prepare('INSERT INTO comms_recipients (id, message_id, user_id, email, full_name) VALUES (?, ?, ?, ?, ?)').bind(uuid(), id, r.user_id, r.email, r.full_name),
    ),
  )
  await c.env.DB.prepare("UPDATE comms_messages SET status = 'sending', updated_at = datetime('now') WHERE id = ?").bind(id).run()
  c.executionCtx.waitUntil(dispatchNow(c.env, id, message.subject, message.body_html, recipients))

  await logActivity(c.env, { actorUserId: user.id, clientUserId: null, kind: 'comms_message_sent', detail: { subject: message.subject } })
  return c.json({ ok: true })
})

commsRoutes.delete('/comms/messages/:id', requireStaff, requireCapability('can_manage_communications'), async (c) => {
  const id = c.req.param('id')!
  const message = await c.env.DB.prepare('SELECT status FROM comms_messages WHERE id = ?').bind(id).first<{ status: string }>()
  if (!message) return c.json({ error: 'not found' }, 404)
  if (message.status === 'sending' || message.status === 'sent') return c.json({ error: 'a message that has already gone out cannot be canceled' }, 400)
  await c.env.DB.prepare("UPDATE comms_messages SET status = 'canceled', next_run_at = NULL, updated_at = datetime('now') WHERE id = ?").bind(id).run()
  return c.json({ ok: true })
})

// Inline images for the composer — publicly served (like avatars) since
// recipient mail clients fetch them without any PMV session cookie.
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
