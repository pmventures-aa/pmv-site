import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { uuid } from '../crypto'
import { createActivationToken } from '../session'
import { activityInsert } from '../activity'
import { sendAccountWelcome } from '../accountEmails'

export const conversionRoutes = new Hono<AppEnv>()

// Atomic lead -> client conversion. A single D1 batch so a converted lead
// can never end up half-migrated: the new account, the client profile, and
// the reassignment of every note/email/activity-event tagged with this
// inquiry (via inquiry_id, backfilled to the new client_user_id) all
// commit together, or none of them do. See docs/crm-expansion-design.md
// #2 for why nothing is physically copied — these are the same rows,
// just now queryable by client_user_id instead of only by inquiry_id.
conversionRoutes.post('/inquiries/:id/convert', requireStaff, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')!

  const inquiry = await c.env.DB.prepare('SELECT * FROM contact_inquiries WHERE id = ?').bind(id).first<any>()
  if (!inquiry) return c.json({ error: 'not found' }, 404)
  if (inquiry.client_user_id) return c.json({ error: 'this lead has already been converted' }, 409)
  if (inquiry.archived_at) return c.json({ error: 'restore this lead from the archive before converting it' }, 409)

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(inquiry.email).first<{ id: string }>()
  if (existing) return c.json({ error: 'a user with this email already exists — link the account manually from Users instead' }, 409)

  const clientId = uuid()
  const nameParts = (inquiry.name || '').trim().split(/\s+/).filter(Boolean)
  const firstName = nameParts[0] ?? null
  const lastName = nameParts.slice(1).join(' ') || null

  // Counted before the batch commits — these rows are already tagged with
  // inquiry_id regardless of whether client_user_id has been backfilled
  // yet, so the counts are accurate either way.
  const [notesCount, emailsCount, activityCount] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) n FROM internal_notes WHERE inquiry_id = ?').bind(id).first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) n FROM email_log WHERE inquiry_id = ?').bind(id).first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) n FROM activity_events WHERE inquiry_id = ?').bind(id).first<{ n: number }>(),
  ])

  const conversionId = uuid()

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, phone, two_factor_enabled, status)
       VALUES (?, ?, NULL, 'client', ?, ?, ?, ?, 0, 'active')`,
    ).bind(clientId, inquiry.email, inquiry.name || null, firstName, lastName, inquiry.phone ?? null),
    c.env.DB.prepare(
      `INSERT INTO client_profiles (id, user_id, services_enrolled, onboarding_completed) VALUES (?, ?, ?, 0)`,
    ).bind(uuid(), clientId, inquiry.service_key ? JSON.stringify([inquiry.service_key]) : null),
    c.env.DB.prepare(`UPDATE internal_notes SET client_user_id = ? WHERE inquiry_id = ? AND client_user_id IS NULL`).bind(clientId, id),
    c.env.DB.prepare(`UPDATE activity_events SET client_user_id = ? WHERE inquiry_id = ? AND client_user_id IS NULL`).bind(clientId, id),
    c.env.DB.prepare(`UPDATE email_log SET client_user_id = ? WHERE inquiry_id = ? AND client_user_id IS NULL`).bind(clientId, id),
    c.env.DB.prepare(`UPDATE contact_inquiries SET client_user_id = ?, converted_at = datetime('now'), status = 'converted' WHERE id = ?`).bind(clientId, id),
    c.env.DB.prepare(
      `INSERT INTO lead_conversions (id, inquiry_id, client_user_id, converted_by, notes_transferred, emails_transferred, activity_transferred) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(conversionId, id, clientId, user.id, notesCount?.n ?? 0, emailsCount?.n ?? 0, activityCount?.n ?? 0),
    // A trigger on activity_events (see migration 0018) mirrors this into
    // audit_log automatically (action=client_converted) — no separate
    // auditInsert call needed here.
    activityInsert(c.env, { actorUserId: user.id, clientUserId: clientId, kind: 'lead_converted', detail: { name: inquiry.name, email: inquiry.email } }),
  ])

  const setupToken = await createActivationToken(c.env, clientId)
  const setupUrl = `https://client.pinnaclemanagementventures.com/set-password?token=${encodeURIComponent(setupToken)}`

  c.executionCtx.waitUntil(
    sendAccountWelcome(c.env, {
      userId: clientId,
      role: 'client',
      email: inquiry.email,
      firstName,
      creationType: 'lead_conversion',
      actionLabel: 'Set Up My Pinnacle Account',
      actionUrl: setupUrl,
      actorUserId: user.id,
    }).catch((err) => console.error('[account-email] converted lead invite failed', err)),
  )

  return c.json({ ok: true, client_user_id: clientId, setup_token: setupToken }, 201)
})

conversionRoutes.get('/inquiries/:id/conversion', requireStaff, async (c) => {
  const id = c.req.param('id')!
  const row = await c.env.DB.prepare(
    `SELECT lc.*, u.full_name AS converted_by_name, u.email AS converted_by_email
     FROM lead_conversions lc JOIN users u ON u.id = lc.converted_by WHERE lc.inquiry_id = ?`,
  ).bind(id).first()
  if (!row) return c.json({ error: 'this lead has not been converted' }, 404)
  return c.json({ conversion: row })
})

// Conversion history log — the audit trail the spec asks for, independent
// of the general activity feed so it survives even if activity events are
// ever pruned.
conversionRoutes.get('/conversions', requireStaff, async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT lc.*, ci.name AS lead_name, ci.email AS lead_email,
            u.full_name AS converted_by_name, u.email AS converted_by_email
     FROM lead_conversions lc
     JOIN contact_inquiries ci ON ci.id = lc.inquiry_id
     JOIN users u ON u.id = lc.converted_by
     ORDER BY lc.created_at DESC LIMIT 300`,
  ).all()
  return c.json({ conversions: res.results ?? [] })
})
