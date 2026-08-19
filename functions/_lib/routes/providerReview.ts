// Provider review journey + follow-up ("pend") requests.
//
//   providerReviewAdminRoutes -> '/admin'  (staff drive the journey)
//   providerReviewSelfRoutes  -> '/'       (the provider sees status + responds)
//
// No authorization-gate change here: admin endpoints require staff; self
// endpoints act only on the caller's own team_members row and their own
// follow-up requests. Admitting under-review providers to login is a separate,
// deliberate step (vendor accounts are currently staff-role).

import { Hono } from 'hono'
import type { AppEnv, Env } from '../types'
import { requireStaff, requireUser } from '../mid'
import { uuid } from '../crypto'
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

providerReviewSelfRoutes.get('/self/review', requireUser, async (c) => {
  const me = c.get('user')!
  const tm = await c.env.DB.prepare('SELECT review_stage, network_status, vendor_category FROM team_members WHERE user_id=?').bind(me.id).first<{ review_stage: string; network_status: string; vendor_category: string | null }>()
  if (!tm) return c.json({ error: 'Not a provider account' }, 404)
  return c.json({ stage: tm.review_stage, networkStatus: tm.network_status, vendorCategory: tm.vendor_category, followUps: await listFollowUps(c.env, me.id) })
})

providerReviewSelfRoutes.post('/self/follow-ups/:id/respond', requireUser, async (c) => {
  const me = c.get('user')!
  const id = c.req.param('id')!
  const response = text((await c.req.json().catch(() => ({})) as Record<string, unknown>).response, 4000)
  if (!response) return c.json({ error: 'Enter a response.' }, 400)
  const owned = await c.env.DB.prepare('SELECT id FROM follow_up_requests WHERE id=? AND subject_user_id=? AND status!=\'resolved\'').bind(id, me.id).first()
  if (!owned) return c.json({ error: 'Not found' }, 404)
  await c.env.DB.prepare("UPDATE follow_up_requests SET response_text=?, status='answered', answered_at=datetime('now'), updated_at=datetime('now') WHERE id=?").bind(response, id).run()
  return c.json({ ok: true })
})
