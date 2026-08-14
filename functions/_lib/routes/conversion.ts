import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { uuid } from '../crypto'
import { createActivationToken } from '../session'
import { toDisplayCase } from '../../../shared/displayCase'
import { crmInviteName, crmPersonName } from '../../../shared/crmRecord'
import { activityInsert } from '../activity'
import { sendAccountWelcome, CLIENT_PORTAL_URL } from '../accountEmails'
import { logAudit, actorGeo, actorIp, actorUserAgent } from '../auditLog'

export const conversionRoutes = new Hono<AppEnv>()

function setupUrlFor(token: string) {
  return `${CLIENT_PORTAL_URL.replace(/\/$/, '')}/set-password?token=${encodeURIComponent(token)}`
}

function alreadyConverted(inquiry: any) {
  return !!(inquiry.converted_at || inquiry.status === 'converted' || inquiry.lifecycle_stage === 'converted')
}

async function conversionPreview(env: AppEnv['Bindings'], id: string) {
  const inquiry = await env.DB.prepare('SELECT * FROM contact_inquiries WHERE id=?').bind(id).first<any>()
  if (!inquiry) return null
  const [existing, notes, emails, activity, lists] = await Promise.all([
    env.DB.prepare('SELECT id,email,role,status,password_hash FROM users WHERE lower(email)=lower(?)').bind(inquiry.email).first<any>(),
    env.DB.prepare('SELECT COUNT(*) n FROM internal_notes WHERE inquiry_id=?').bind(id).first<{ n: number }>(),
    env.DB.prepare('SELECT COUNT(*) n FROM email_log WHERE inquiry_id=?').bind(id).first<{ n: number }>(),
    env.DB.prepare('SELECT COUNT(*) n FROM activity_events WHERE inquiry_id=?').bind(id).first<{ n: number }>(),
    env.DB.prepare('SELECT COUNT(*) n FROM crm_list_members WHERE inquiry_id=?').bind(id).first<{ n: number }>().catch(() => ({ n: 0 })),
  ])
  const blockers: string[] = []
  if (alreadyConverted(inquiry)) blockers.push('This lead has already been converted.')
  if (inquiry.archived_at) blockers.push('Restore this lead from the archive before converting it.')
  if (existing && existing.role !== 'client') {
    blockers.push('A staff or vendor account already uses this email. Link or change the address from Users instead of creating a duplicate.')
  }
  const linkExisting = !!(existing && existing.role === 'client' && !alreadyConverted(inquiry))
  const attribution = {
    source: inquiry.source || null, record_type: inquiry.record_type || null, lifecycle_stage: inquiry.lifecycle_stage || null,
    lead_status: inquiry.status || null, service_key: inquiry.service_key || null, owner_staff_user_id: inquiry.owner_staff_user_id || null,
    company_name: inquiry.company_name || null, contact_name: crmPersonName(inquiry) || null, created_at: inquiry.created_at || null, last_contacted_at: inquiry.last_contacted_at || null,
  }
  return {
    inquiry, blockers, ready: blockers.length === 0, link_existing: linkExisting,
    transfer: { notes: notes?.n || 0, emails: emails?.n || 0, activity: activity?.n || 0, list_memberships: (lists as any)?.n || 0 },
    attribution, existing_user: existing ? { id: existing.id, email: existing.email, role: existing.role, status: existing.status, has_password: !!existing.password_hash } : null,
  }
}

conversionRoutes.get('/inquiries/:id/conversion-preview', requireStaff, async (c) => {
  const id = c.req.param('id') ?? ''
  if (!id) return c.json({ error: 'not found' }, 404)
  const preview = await conversionPreview(c.env, id)
  if (!preview) return c.json({ error: 'not found' }, 404)
  return c.json({
    preview: {
      ready: preview.ready,
      blockers: preview.blockers,
      transfer: preview.transfer,
      attribution: preview.attribution,
      link_existing: preview.link_existing,
      lead: { id: preview.inquiry.id, name: preview.inquiry.name, email: preview.inquiry.email, phone: preview.inquiry.phone, company_name: preview.inquiry.company_name, first_name: preview.inquiry.first_name, last_name: preview.inquiry.last_name, job_title: preview.inquiry.job_title, service_key: preview.inquiry.service_key },
      existing_user: preview.existing_user,
    },
  })
})

conversionRoutes.post('/inquiries/:id/convert', requireStaff, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id') ?? ''
  if (!id) return c.json({ error: 'not found' }, 404)
  const preview = await conversionPreview(c.env, id)
  if (!preview) return c.json({ error: 'not found' }, 404)
  if (!preview.ready) return c.json({ error: preview.blockers[0], blockers: preview.blockers }, 409)
  const inquiry = preview.inquiry

  const displayName = crmInviteName(inquiry) || toDisplayCase(inquiry.name)
  const businessName = toDisplayCase(inquiry.company_name) || (inquiry.record_type === 'business' ? toDisplayCase(inquiry.name) : null)
  const firstName = toDisplayCase(inquiry.first_name) || (inquiry.record_type === 'business' ? null : displayName.trim().split(/\s+/).filter(Boolean)[0] || null)
  const lastName = toDisplayCase(inquiry.last_name) || (inquiry.record_type === 'business' ? null : displayName.trim().split(/\s+/).filter(Boolean).slice(1).join(' ') || null)
  const conversionId = uuid()
  const previewSnapshot = { lead: { id: inquiry.id, name: inquiry.name, email: inquiry.email, phone: inquiry.phone, company_name: inquiry.company_name, first_name: inquiry.first_name, last_name: inquiry.last_name }, transfer: preview.transfer, blockers: [], linked_existing: preview.link_existing }

  const existingClient = preview.existing_user?.role === 'client' ? preview.existing_user : null
  const clientId = existingClient?.id || uuid()
  const createdNew = !existingClient
  const needsSetup = createdNew || existingClient?.has_password === false

  const statements: ReturnType<typeof c.env.DB.prepare>[] = []
  if (createdNew) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, phone, two_factor_enabled, status)
         VALUES (?, ?, NULL, 'client', ?, ?, ?, ?, 0, 'active')`,
      ).bind(clientId, inquiry.email, displayName || null, firstName, lastName, inquiry.phone ?? null),
      c.env.DB.prepare(
        `INSERT INTO client_profiles (id, user_id, business_name, services_enrolled, onboarding_completed) VALUES (?, ?, ?, ?, 0)`,
      ).bind(uuid(), clientId, businessName, inquiry.service_key ? JSON.stringify([inquiry.service_key]) : null),
    )
  } else {
    const profile = await c.env.DB.prepare('SELECT id FROM client_profiles WHERE user_id = ?').bind(clientId).first<{ id: string }>()
    if (!profile) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO client_profiles (id, user_id, business_name, services_enrolled, onboarding_completed) VALUES (?, ?, ?, ?, 0)`,
        ).bind(uuid(), clientId, businessName, inquiry.service_key ? JSON.stringify([inquiry.service_key]) : null),
      )
    } else if (businessName) {
      statements.push(
        c.env.DB.prepare(`UPDATE client_profiles SET business_name = COALESCE(business_name, ?) WHERE user_id = ?`).bind(businessName, clientId),
      )
    }
    statements.push(
      c.env.DB.prepare(
        `UPDATE users SET full_name = COALESCE(full_name, ?), first_name = COALESCE(first_name, ?), last_name = COALESCE(last_name, ?), phone = COALESCE(phone, ?) WHERE id = ?`,
      ).bind(displayName || null, firstName, lastName, inquiry.phone ?? null, clientId),
    )
  }

  statements.push(
    c.env.DB.prepare(`UPDATE internal_notes SET client_user_id = ? WHERE inquiry_id = ? AND client_user_id IS NULL`).bind(clientId, id),
    c.env.DB.prepare(`UPDATE activity_events SET client_user_id = ? WHERE inquiry_id = ? AND client_user_id IS NULL`).bind(clientId, id),
    c.env.DB.prepare(`UPDATE email_log SET client_user_id = ? WHERE inquiry_id = ? AND client_user_id IS NULL`).bind(clientId, id),
    c.env.DB.prepare(
      `UPDATE contact_inquiries SET client_user_id = ?, converted_at = datetime('now'), status = 'converted', lifecycle_stage = 'converted', updated_at = datetime('now') WHERE id = ?`,
    ).bind(clientId, id),
    c.env.DB.prepare(
      `INSERT INTO lead_conversions (id,inquiry_id,client_user_id,converted_by,notes_transferred,emails_transferred,activity_transferred,attribution_json,preview_json)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(conversionId, id, clientId, user.id, preview.transfer.notes, preview.transfer.emails, preview.transfer.activity, JSON.stringify(preview.attribution), JSON.stringify(previewSnapshot)),
    activityInsert(c.env, { actorUserId: user.id, clientUserId: clientId, kind: 'lead_converted', detail: { name: inquiry.name, email: inquiry.email, source: inquiry.source || null, service_key: inquiry.service_key || null, linked_existing: preview.link_existing } }),
  )

  await c.env.DB.batch(statements)

  await logAudit(c.env, { actorUserId: user.id, actorIp: actorIp(c.req.raw), actorUserAgent: actorUserAgent(c.req.raw), actorGeo: actorGeo(c.req.raw), action: 'client_converted', entityType: 'lead_conversion', entityId: conversionId, before: previewSnapshot, after: { client_user_id: clientId, attribution: preview.attribution, linked_existing: preview.link_existing } })

  let setupToken: string | null = null
  if (needsSetup) {
    setupToken = await createActivationToken(c.env, clientId)
    const setupUrl = setupUrlFor(setupToken)
    c.executionCtx.waitUntil(
      sendAccountWelcome(c.env, {
        userId: clientId, role: 'client', email: inquiry.email, firstName, businessName,
        creationType: 'lead_conversion', actionLabel: 'Set Up My Pinnacle Account', actionUrl: setupUrl, actorUserId: user.id,
      }).catch((err) => console.error('[account-email] converted lead invite failed', err)),
    )
  }
  const client = await c.env.DB.prepare('SELECT public_ref FROM users WHERE id = ?').bind(clientId).first<{ public_ref: string | null }>()
  return c.json({ ok: true, client_user_id: clientId, client_public_ref: client?.public_ref || null, setup_token: setupToken, conversion_id: conversionId, linked_existing: preview.link_existing }, 201)
})

conversionRoutes.get('/inquiries/:id/conversion', requireStaff, async (c) => {
  const id = c.req.param('id') ?? ''
  if (!id) return c.json({ error: 'not found' }, 404)
  const row = await c.env.DB.prepare(
    `SELECT lc.*, u.full_name AS converted_by_name, u.email AS converted_by_email
     FROM lead_conversions lc JOIN users u ON u.id = lc.converted_by WHERE lc.inquiry_id = ?`,
  ).bind(id).first()
  if (!row) return c.json({ error: 'this lead has not been converted' }, 404)
  return c.json({ conversion: row })
})

conversionRoutes.get('/conversions', requireStaff, async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT lc.*, ci.name AS lead_name, ci.email AS lead_email,
            u.full_name AS converted_by_name, u.email AS converted_by_email
     FROM lead_conversions lc JOIN contact_inquiries ci ON ci.id = lc.inquiry_id JOIN users u ON u.id = lc.converted_by
     ORDER BY lc.created_at DESC LIMIT 300`,
  ).all()
  return c.json({ conversions: res.results ?? [] })
})
