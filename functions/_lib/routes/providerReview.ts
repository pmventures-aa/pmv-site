// Provider review journey + follow-up ("pend") requests.
//
//   providerReviewAdminRoutes -> '/admin'  (staff drive the journey)
//   providerReviewSelfRoutes  -> '/'       (the provider sees status + responds)
//
// Admin endpoints require staff. Self endpoints are gated by requireProvider
// — the one gate that admits an under-review provider (access_scope
// 'provider_review'); every other gate rejects that scope. Handlers here act
// only on the caller's own team_members row and follow-up requests.

import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { requireStaff, requireProvider } from '../mid'
import { uuid } from '../crypto'
import { isValidPhone } from '../../../shared/contactValidation'
import { isReviewStage, type FollowUpRequest } from '../../../shared/providerJourney'

export const providerReviewAdminRoutes = new Hono<AppEnv>()
export const providerReviewSelfRoutes = new Hono<AppEnv>()

interface FollowUpRow {
  id: string; kind: string; title: string; body: string | null; status: string
  response_text: string | null; created_at: string; answered_at: string | null; resolved_at: string | null
}
function followUpView(r: FollowUpRow): FollowUpRequest {
  return {
    id: r.id, kind: r.kind === 'document' ? 'document' : 'info', title: r.title, body: r.body,
    status: (['open', 'answered', 'resolved'].includes(r.status) ? r.status : 'open') as FollowUpRequest['status'],
    responseText: r.response_text, createdAt: r.created_at, answeredAt: r.answered_at, resolvedAt: r.resolved_at,
  }
}
const FU_COLS = 'id, kind, title, body, status, response_text, created_at, answered_at, resolved_at'

async function listFollowUps(env: Env, subjectUserId: string): Promise<FollowUpRequest[]> {
  const rows = await env.DB.prepare(`SELECT ${FU_COLS} FROM follow_up_requests WHERE subject_user_id=? ORDER BY (status='open') DESC, created_at DESC`).bind(subjectUserId).all<FollowUpRow>()
  return (rows.results || []).map(followUpView)
}
function text(v: unknown, max = 2000): string { return typeof v === 'string' ? v.trim().slice(0, max) : '' }

// ---------------------------------------------------------------------------
// Admin (staff)
// ---------------------------------------------------------------------------

providerReviewAdminRoutes.get('/providers/:userId/review', requireStaff, async (c) => {
  const userId = c.req.param('userId')!
  const tm = await c.env.DB.prepare('SELECT review_stage, network_status FROM team_members WHERE user_id=?').bind(userId).first<{ review_stage: string; network_status: string }>()
  if (!tm) return c.json({ error: 'Not found' }, 404)
  return c.json({ stage: tm.review_stage, networkStatus: tm.network_status, followUps: await listFollowUps(c.env, userId) })
})

providerReviewAdminRoutes.post('/providers/:userId/review/stage', requireStaff, async (c) => {
  const userId = c.req.param('userId')!
  const stage = text((await c.req.json().catch(() => ({})) as Record<string, unknown>).stage, 40)
  if (!isReviewStage(stage)) return c.json({ error: 'Unknown stage.' }, 400)
  const tm = await c.env.DB.prepare('SELECT user_id FROM team_members WHERE user_id=?').bind(userId).first()
  if (!tm) return c.json({ error: 'Not found' }, 404)
  // Approval/decline also moves the coarse network_status so downstream gating stays in sync.
  const netSql = stage === 'approved' ? ", network_status='active'" : stage === 'declined' ? ", network_status='declined'" : ''
  await c.env.DB.prepare(`UPDATE team_members SET review_stage=?${netSql} WHERE user_id=?`).bind(stage, userId).run()
  // Approval graduates the account from 'provisional' to 'active' so it leaves
  // the review shell: getUser re-derives access_scope from users.status on the
  // next request, so the provider's own session picks up full scope with no
  // re-login. Only lift a provisional vendor — never touch an already-active
  // account's status here.
  if (stage === 'approved') {
    await c.env.DB.prepare("UPDATE users SET status='active' WHERE id=? AND status='provisional'").bind(userId).run()
  }
  return c.json({ ok: true, stage })
})

providerReviewAdminRoutes.post('/providers/:userId/follow-ups', requireStaff, async (c) => {
  const me = c.get('user')!
  const userId = c.req.param('userId')!
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const title = text(body.title, 200)
  if (!title) return c.json({ error: 'A title is required.' }, 400)
  const tm = await c.env.DB.prepare('SELECT user_id FROM team_members WHERE user_id=?').bind(userId).first()
  if (!tm) return c.json({ error: 'Not found' }, 404)
  const id = uuid()
  await c.env.DB.prepare('INSERT INTO follow_up_requests (id, subject_user_id, created_by_user_id, kind, title, body) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, userId, me.id, body.kind === 'document' ? 'document' : 'info', title, text(body.body, 2000) || null).run()
  // Raising a follow-up puts the provider in the action-needed stage.
  await c.env.DB.prepare("UPDATE team_members SET review_stage='info_requested' WHERE user_id=? AND review_stage NOT IN ('approved','declined')").bind(userId).run()
  return c.json({ ok: true, id }, 201)
})

providerReviewAdminRoutes.post('/follow-ups/:id/resolve', requireStaff, async (c) => {
  const id = c.req.param('id')!
  await c.env.DB.prepare("UPDATE follow_up_requests SET status='resolved', resolved_at=datetime('now'), updated_at=datetime('now') WHERE id=?").bind(id).run()
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Provider self-service (the logged-in provider)
// ---------------------------------------------------------------------------

providerReviewSelfRoutes.get('/self/review', requireProvider, async (c) => {
  const me = c.get('user')!
  const row = await c.env.DB.prepare(
    `SELECT tm.review_stage, tm.network_status, tm.vendor_category, tm.display_name,
            u.full_name, u.email, u.phone
     FROM team_members tm JOIN users u ON u.id = tm.user_id
     WHERE tm.user_id = ?`,
  ).bind(me.id).first<{ review_stage: string; network_status: string; vendor_category: string | null; display_name: string | null; full_name: string | null; email: string; phone: string | null }>()
  if (!row) return c.json({ error: 'Not a provider account' }, 404)
  // A profile is "complete" once the provider has confirmed how they want to be
  // shown (display name), their legal name, and a reachable phone. SSO sign-ups
  // arrive with a name but no phone/display name, so the shell prompts them to
  // self-fill — the reason self-fill exists even for SSO accounts.
  const profileComplete = !!(row.display_name && row.full_name && row.phone)
  return c.json({
    stage: row.review_stage,
    networkStatus: row.network_status,
    vendorCategory: row.vendor_category,
    profileComplete,
    profile: {
      displayName: row.display_name,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
    },
    followUps: await listFollowUps(c.env, me.id),
  })
})

// Provider self-fills the details HQ needs to finish review. Scoped strictly to
// the caller's own rows (users + their team_members). No status/stage change —
// filling your profile never advances your own review; that stays with staff.
providerReviewSelfRoutes.post('/self/profile', requireProvider, async (c) => {
  const me = c.get('user')!
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const fullName = text(body.fullName, 120)
  const displayName = text(body.displayName, 120)
  const phone = text(body.phone, 40)
  if (!fullName) return c.json({ error: 'Enter your full legal name.' }, 400)
  if (!displayName) return c.json({ error: 'Enter a display name.' }, 400)
  if (!isValidPhone(phone)) return c.json({ error: 'Enter a valid phone number.' }, 400)
  await c.env.DB.prepare('UPDATE users SET full_name=?, phone=? WHERE id=?').bind(fullName, phone, me.id).run()
  await c.env.DB.prepare('UPDATE team_members SET display_name=? WHERE user_id=?').bind(displayName, me.id).run()
  return c.json({ ok: true })
})

providerReviewSelfRoutes.post('/self/follow-ups/:id/respond', requireProvider, async (c) => {
  const me = c.get('user')!
  const id = c.req.param('id')!
  const response = text((await c.req.json().catch(() => ({})) as Record<string, unknown>).response, 4000)
  if (!response) return c.json({ error: 'Enter a response.' }, 400)
  const owned = await c.env.DB.prepare('SELECT id FROM follow_up_requests WHERE id=? AND subject_user_id=? AND status!=\'resolved\'').bind(id, me.id).first()
  if (!owned) return c.json({ error: 'Not found' }, 404)
  await c.env.DB.prepare("UPDATE follow_up_requests SET response_text=?, status='answered', answered_at=datetime('now'), updated_at=datetime('now') WHERE id=?").bind(response, id).run()
  return c.json({ ok: true })
})
