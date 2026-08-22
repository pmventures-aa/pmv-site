import { Hono } from 'hono'
import type { AppEnv, SessionUser } from '../types'
import { requireStaff } from '../mid'
import { uuid } from '../crypto'
import { logActivity } from '../activity'
import {
  getOrCreateProviderSchedule,
  loadProviderBlackouts,
  loadProviderWindows,
  providerFitness,
} from '../providerSchedule'
import { isValidTimezone, parseHhMm } from '../../../shared/availability'

export const providerAvailabilityRoutes = new Hono<AppEnv>()

// A provider owns their own working hours. Nobody else edits them, including
// admins: hours are a statement about someone's life, and a coordinator
// quietly widening them would produce assignments the provider never agreed
// to be available for. Staff may READ them, which is what dispatch needs.
function canEdit(user: SessionUser, vendorUserId: string): boolean {
  return user.id === vendorUserId
}

function canRead(user: SessionUser, vendorUserId: string): boolean {
  if (user.id === vendorUserId) return true
  return user.party_type !== 'vendor'
}

async function payload(env: AppEnv['Bindings'], vendorUserId: string) {
  const row = await getOrCreateProviderSchedule(env, vendorUserId)
  const [windows, blackouts] = await Promise.all([
    loadProviderWindows(env, row.id),
    loadProviderBlackouts(env, row.id),
  ])
  return {
    schedule: {
      id: row.id,
      vendor_user_id: vendorUserId,
      timezone: row.timezone,
      active: row.active === 1,
    },
    windows,
    blackouts,
    // An empty week is "has not said yet", which reads differently from
    // "never available" and should be surfaced as a prompt, not a state.
    configured: windows.length > 0,
  }
}

providerAvailabilityRoutes.get('/provider-availability/:vendorUserId', requireStaff, async (c) => {
  const user = c.get('user')
  const vendorUserId = c.req.param('vendorUserId') || ''
  if (!vendorUserId) return c.json({ error: 'provider is required' }, 400)
  if (!canRead(user, vendorUserId)) return c.json({ error: 'forbidden' }, 403)
  return c.json(await payload(c.env, vendorUserId))
})

/** Replace the weekly pattern. Sent whole, because a partial week is ambiguous. */
providerAvailabilityRoutes.put('/provider-availability/:vendorUserId/windows', requireStaff, async (c) => {
  const user = c.get('user')
  const vendorUserId = c.req.param('vendorUserId') || ''
  if (!canEdit(user, vendorUserId)) return c.json({ error: 'only the provider can set their own hours' }, 403)

  const body = await c.req.json().catch(() => ({})) as { windows?: unknown; timezone?: unknown }
  const row = await getOrCreateProviderSchedule(c.env, vendorUserId)

  if (typeof body.timezone === 'string' && isValidTimezone(body.timezone)) {
    await c.env.DB.prepare(
      "UPDATE availability_schedules SET timezone = ?, updated_at = datetime('now') WHERE id = ?",
    ).bind(body.timezone, row.id).run()
  }

  const incoming = Array.isArray(body.windows) ? body.windows : []
  const clean: Array<{ weekday: number; start: number; end: number }> = []
  for (const raw of incoming) {
    if (!raw || typeof raw !== 'object') continue
    const w = raw as { weekday?: unknown; start?: unknown; end?: unknown }
    const weekday = Number(w.weekday)
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue
    const start = typeof w.start === 'string' ? parseHhMm(w.start) : Number(w.start)
    const end = typeof w.end === 'string' ? parseHhMm(w.end) : Number(w.end)
    if (start === null || end === null || !Number.isFinite(start) || !Number.isFinite(end)) continue
    if (start < 0 || start >= 1440 || end <= 0 || end > 1440 || end <= start) continue
    clean.push({ weekday, start, end })
    if (clean.length >= 40) break
  }

  await c.env.DB.prepare('DELETE FROM availability_windows WHERE schedule_id = ?').bind(row.id).run()
  if (clean.length) {
    await c.env.DB.batch(clean.map((w) => c.env.DB.prepare(
      'INSERT INTO availability_windows (id, schedule_id, weekday, start_minute, end_minute) VALUES (?, ?, ?, ?, ?)',
    ).bind(uuid(), row.id, w.weekday, w.start, w.end)))
  }

  await logActivity(c.env, {
    actorUserId: user.id,
    clientUserId: null,
    kind: 'provider_hours_updated',
    detail: { vendor_user_id: vendorUserId, windows: clean.length },
  })
  return c.json(await payload(c.env, vendorUserId))
})

providerAvailabilityRoutes.post('/provider-availability/:vendorUserId/time-off', requireStaff, async (c) => {
  const user = c.get('user')
  const vendorUserId = c.req.param('vendorUserId') || ''
  if (!canEdit(user, vendorUserId)) return c.json({ error: 'only the provider can set their own time off' }, 403)

  const body = await c.req.json().catch(() => ({})) as { startsAt?: unknown; endsAt?: unknown; reason?: unknown }
  const startsAt = typeof body.startsAt === 'string' ? body.startsAt : ''
  const endsAt = typeof body.endsAt === 'string' ? body.endsAt : ''
  if (!startsAt || !endsAt || !(Date.parse(startsAt) < Date.parse(endsAt))) {
    return c.json({ error: 'a start and a later end are required' }, 400)
  }

  const row = await getOrCreateProviderSchedule(c.env, vendorUserId)
  const id = uuid()
  await c.env.DB.prepare(
    'INSERT INTO availability_blackouts (id, schedule_id, starts_at, ends_at, reason, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(id, row.id, startsAt, endsAt, typeof body.reason === 'string' ? body.reason.slice(0, 500) : null, user.id).run()

  return c.json({ blackout: { id, startsAt, endsAt, reason: body.reason ?? null } }, 201)
})

providerAvailabilityRoutes.delete('/provider-availability/:vendorUserId/time-off/:id', requireStaff, async (c) => {
  const user = c.get('user')
  const vendorUserId = c.req.param('vendorUserId') || ''
  if (!canEdit(user, vendorUserId)) return c.json({ error: 'only the provider can change their own time off' }, 403)

  const row = await getOrCreateProviderSchedule(c.env, vendorUserId)
  // Scoped to the provider's own schedule, so an id from someone else's
  // calendar cannot be deleted by guessing it.
  await c.env.DB.prepare(
    'DELETE FROM availability_blackouts WHERE id = ? AND schedule_id = ?',
  ).bind(c.req.param('id') || '', row.id).run()
  return c.json({ ok: true })
})

/**
 * Is this provider free for this span? Staff-facing, for dispatch.
 *
 * Distinguishes "has not told us their hours" from "not free", because those
 * are different facts: an unknown schedule is a person to ask, not a person
 * to skip.
 */
providerAvailabilityRoutes.get('/provider-availability/:vendorUserId/fitness', requireStaff, async (c) => {
  const user = c.get('user')
  const vendorUserId = c.req.param('vendorUserId') || ''
  if (!canRead(user, vendorUserId)) return c.json({ error: 'forbidden' }, 403)
  const startsAt = c.req.query('startsAt') || ''
  const endsAt = c.req.query('endsAt') || ''
  if (!startsAt || !endsAt) return c.json({ error: 'startsAt and endsAt are required' }, 400)
  return c.json(await providerFitness(c.env, vendorUserId, startsAt, endsAt))
})
