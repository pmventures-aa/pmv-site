import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { uuid } from '../crypto'
import { recordSecurityEvent } from '../security'
import { actorIp, actorGeo } from '../auditLog'
import { requirePermission } from '../authorize'

// Field-location session lifecycle endpoints. Pairs with the schema
// from migration 0080 (field_location_sessions + field_location_points).
//
// Design intent:
//
//   - A session is the durable record of a field visit. The client hook
//     opens one when the provider enters an active status (EN_ROUTE /
//     ON_SITE / WORK_IN_PROGRESS) and closes it when the assignment
//     completes / cancels / fails or the operator manually stops.
//   - Points are throttled at the client (elapsed time OR meaningful
//     movement) AND at the server (never accept two points within 10s
//     and 15m of the same session). Both throttles matter: the client
//     saves battery + bandwidth, the server protects against buggy or
//     misbehaving clients that would otherwise flood the point stream.
//   - The single most-recent point is also mirrored into
//     field_agent_locations so the live map's single-row lookup stays
//     fast (it does not have to scan field_location_points).
//   - Sensitive lifecycle transitions (session started, session ended)
//     are recorded via recordSecurityEvent(); raw points are NOT
//     audited - they live in field_location_points.
//
// Authorization: the caller must be the provider on the assignment, or
// an admin. Read/history routes will layer on the granular
// field.location.* permissions in a follow-on slice - the write path
// here is scoped to "you own this assignment".

export const fieldLocationRoutes = new Hono<AppEnv>()

// Server-side throttle: reject a point that lands within DEBOUNCE_MS
// AND is within DEBOUNCE_METERS of the last accepted point. Both
// conditions must hold - a fast-moving provider should still stream
// updates, and a stationary provider should still emit an occasional
// heartbeat.
const DEBOUNCE_MS = 10_000
const DEBOUNCE_METERS = 15
// A session that has not received a heartbeat in this long is treated
// as timed out: the /end path with ended_reason='timeout' can be
// invoked by a background cleanup, and the live map should mark such
// pins stale rather than showing them as live.
const SESSION_TIMEOUT_MS = 6 * 60_000

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

// Haversine distance (meters) between two coordinates. Good enough for
// throttling; not used for legal/evidentiary geospatial math.
function distanceMeters(latA: number, lngA: number, latB: number, lngB: number): number {
  const R = 6_371_000
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRad(latB - latA)
  const dLng = toRad(lngB - lngA)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

interface AssignmentBrief {
  id: string
  vendor_user_id: string
  status: string
}

async function loadAssignmentBrief(env: AppEnv['Bindings'], id: string): Promise<AssignmentBrief | null> {
  return await env.DB.prepare(
    'SELECT id, vendor_user_id, status FROM field_assignments WHERE id = ?',
  ).bind(id).first<AssignmentBrief>()
}

interface SessionRow {
  id: string
  assignment_id: string
  provider_id: string
  status: string
  started_at: string
  ended_at: string | null
  last_latitude: number | null
  last_longitude: number | null
  last_seen_at: string | null
  point_count: number
}

const ACTIVE_ASSIGNMENT_STATUSES = new Set(['assigned', 'traveling', 'on_site', 'documented'])
const VALID_END_REASONS = new Set([
  'assignment_completed',
  'assignment_cancelled',
  'assignment_failed',
  'operator_stopped',
  'timeout',
  'permission_revoked',
])
const VALID_SOURCES = new Set(['browser', 'pwa', 'native', 'manual', 'geofence'])

// POST /admin/field-location/session/start
// Body: { assignment_id: string, source?: 'browser'|'pwa'|'native'|'manual'|'geofence' }
// Returns: { session: { id, assignment_id, started_at, ... } }
fieldLocationRoutes.post('/field-location/session/start', requireStaff, async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const assignmentId = typeof body.assignment_id === 'string' ? body.assignment_id : ''
  if (!assignmentId) return c.json({ error: 'assignment_id is required' }, 400)
  const source = typeof body.source === 'string' && VALID_SOURCES.has(body.source) ? body.source : 'browser'

  const assignment = await loadAssignmentBrief(c.env, assignmentId)
  if (!assignment) return c.json({ error: 'assignment not found' }, 404)
  if (assignment.vendor_user_id !== user.id && user.role !== 'admin') {
    return c.json({ error: 'forbidden' }, 403)
  }
  if (!ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)) {
    return c.json({ error: 'assignment is not in an active field status' }, 409)
  }

  // If the caller already has an active session for this assignment,
  // return it rather than opening a duplicate. The unique index in
  // migration 0080 also enforces this at the storage layer.
  const existing = await c.env.DB.prepare(
    `SELECT id, assignment_id, provider_id, status, started_at, ended_at, last_latitude, last_longitude, last_seen_at, point_count
       FROM field_location_sessions
       WHERE assignment_id = ? AND status = 'active'
       LIMIT 1`,
  ).bind(assignmentId).first<SessionRow>()
  if (existing && existing.provider_id === user.id) return c.json({ session: existing })

  const id = `fls_${uuid().replace(/-/g, '')}`
  await c.env.DB.prepare(
    `INSERT INTO field_location_sessions (id, assignment_id, provider_id, status, started_at)
     VALUES (?, ?, ?, 'active', datetime('now'))`,
  ).bind(id, assignmentId, user.id).run()

  await recordSecurityEvent(c.env, {
    actor: user,
    event: 'FIELD_LOCATION_SESSION_STARTED',
    resourceType: 'field_assignment',
    resourceId: assignmentId,
    metadata: { session_id: id, source },
    request: c.req.raw,
  })

  const session = await c.env.DB.prepare(
    `SELECT id, assignment_id, provider_id, status, started_at, ended_at, last_latitude, last_longitude, last_seen_at, point_count
       FROM field_location_sessions WHERE id = ?`,
  ).bind(id).first<SessionRow>()
  return c.json({ session })
})

// POST /admin/field-location/session/:id/point
// Body: { lat, lng, accuracy_meters?, altitude_meters?, heading_degrees?, speed_mps?, source?, captured_at? }
// Returns: { accepted: true } or { accepted: false, reason: 'throttled' }
fieldLocationRoutes.post('/field-location/session/:id/point', requireStaff, async (c) => {
  const user = c.get('user')
  const sessionId = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const lat = num(body.lat)
  const lng = num(body.lng)
  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return c.json({ error: 'valid lat and lng are required' }, 400)
  }

  const session = await c.env.DB.prepare(
    `SELECT id, assignment_id, provider_id, status, started_at, ended_at, last_latitude, last_longitude, last_seen_at, point_count
       FROM field_location_sessions WHERE id = ?`,
  ).bind(sessionId).first<SessionRow>()
  if (!session) return c.json({ error: 'session not found' }, 404)
  if (session.status !== 'active') return c.json({ error: 'session is not active' }, 409)
  if (session.provider_id !== user.id && user.role !== 'admin') {
    return c.json({ error: 'forbidden' }, 403)
  }

  // Server-side throttle: reject if within DEBOUNCE_MS AND DEBOUNCE_METERS
  // of the previous accepted point. Both conditions matter.
  if (session.last_latitude != null && session.last_longitude != null && session.last_seen_at) {
    const elapsedMs = Date.now() - new Date(`${session.last_seen_at.replace(' ', 'T')}Z`).getTime()
    const movedMeters = distanceMeters(session.last_latitude, session.last_longitude, lat, lng)
    if (elapsedMs < DEBOUNCE_MS && movedMeters < DEBOUNCE_METERS) {
      return c.json({ accepted: false, reason: 'throttled', elapsed_ms: elapsedMs, moved_meters: Math.round(movedMeters) })
    }
  }

  const source = typeof body.source === 'string' && VALID_SOURCES.has(body.source) ? body.source : 'browser'
  const accuracy = num(body.accuracy_meters)
  const altitude = num(body.altitude_meters)
  const heading = num(body.heading_degrees)
  const speed = num(body.speed_mps)
  const capturedAt = typeof body.captured_at === 'string' ? body.captured_at : null
  const pointId = `flp_${uuid().replace(/-/g, '')}`

  // Two writes in a single batch: insert the point + update the session
  // denormalized last_*.  If we ever move to a queue we can drop the
  // per-point session update and derive it on read; for now one D1
  // round trip per accepted point is fine given the throttle above.
  const inserts = [
    c.env.DB.prepare(
      `INSERT INTO field_location_points (
         id, session_id, assignment_id, provider_id,
         latitude, longitude, accuracy_meters, altitude_meters, heading_degrees, speed_mps, source, captured_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
    ).bind(
      pointId, sessionId, session.assignment_id, session.provider_id,
      lat, lng, accuracy, altitude, heading, speed, source, capturedAt,
    ),
    c.env.DB.prepare(
      `UPDATE field_location_sessions
         SET last_latitude = ?, last_longitude = ?, last_accuracy_m = ?, last_seen_at = datetime('now'),
             point_count = point_count + 1,
             start_latitude = COALESCE(start_latitude, ?),
             start_longitude = COALESCE(start_longitude, ?)
         WHERE id = ?`,
    ).bind(lat, lng, accuracy, lat, lng, sessionId),
    // Mirror into the fast live-map projection so /network-map keeps
    // its single-row lookup shape.
    c.env.DB.prepare(
      `INSERT INTO field_agent_locations (user_id, assignment_id, lat, lng, accuracy_m, source, sharing_active, updated_at)
       VALUES (?, ?, ?, ?, ?, 'assignment', 1, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         assignment_id = excluded.assignment_id,
         lat = excluded.lat,
         lng = excluded.lng,
         accuracy_m = excluded.accuracy_m,
         source = 'assignment',
         sharing_active = 1,
         updated_at = datetime('now')`,
    ).bind(session.provider_id, session.assignment_id, lat, lng, accuracy),
  ]
  await c.env.DB.batch(inserts)

  return c.json({ accepted: true, session_id: sessionId, point_id: pointId })
})

// POST /admin/field-location/session/:id/end
// Body: { ended_reason: 'assignment_completed'|'assignment_cancelled'|'assignment_failed'|'operator_stopped'|'timeout'|'permission_revoked' }
fieldLocationRoutes.post('/field-location/session/:id/end', requireStaff, async (c) => {
  const user = c.get('user')
  const sessionId = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const endedReason = typeof body.ended_reason === 'string' && VALID_END_REASONS.has(body.ended_reason)
    ? body.ended_reason
    : 'operator_stopped'

  const session = await c.env.DB.prepare(
    'SELECT id, assignment_id, provider_id, status FROM field_location_sessions WHERE id = ?',
  ).bind(sessionId).first<SessionRow>()
  if (!session) return c.json({ error: 'session not found' }, 404)
  if (session.provider_id !== user.id && user.role !== 'admin') {
    return c.json({ error: 'forbidden' }, 403)
  }
  if (session.status !== 'active') return c.json({ ok: true, already_ended: true })

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE field_location_sessions
         SET status = 'ended', ended_at = datetime('now'), ended_reason = ?
         WHERE id = ? AND status = 'active'`,
    ).bind(endedReason, sessionId),
    c.env.DB.prepare(
      `UPDATE field_agent_locations SET sharing_active = 0
         WHERE user_id = ? AND assignment_id = ?`,
    ).bind(session.provider_id, session.assignment_id),
  ])

  await recordSecurityEvent(c.env, {
    actor: user,
    event: 'FIELD_LOCATION_SESSION_ENDED',
    resourceType: 'field_assignment',
    resourceId: session.assignment_id,
    metadata: { session_id: sessionId, ended_reason: endedReason },
    request: c.req.raw,
  })
  return c.json({ ok: true, ended_reason: endedReason })
})

// GET /admin/field-location/session/active
// Returns: { session: SessionRow | null }
// Convenience for the client hook on mount: if there is an active
// session for this user, resume rather than opening a new one.
fieldLocationRoutes.get('/field-location/session/active', requireStaff, async (c) => {
  const user = c.get('user')
  const session = await c.env.DB.prepare(
    `SELECT id, assignment_id, provider_id, status, started_at, ended_at, last_latitude, last_longitude, last_seen_at, point_count
       FROM field_location_sessions
       WHERE provider_id = ? AND status = 'active'
       ORDER BY started_at DESC
       LIMIT 1`,
  ).bind(user.id).first<SessionRow>()
  if (!session) return c.json({ session: null })
  // Client can decide "this is stale" but we tag anything past
  // SESSION_TIMEOUT_MS as such so the hook can auto-end and start
  // fresh rather than resuming a dead session.
  const lastSeen = session.last_seen_at
    ? new Date(`${session.last_seen_at.replace(' ', 'T')}Z`).getTime()
    : new Date(`${session.started_at.replace(' ', 'T')}Z`).getTime()
  const stale = Date.now() - lastSeen > SESSION_TIMEOUT_MS
  return c.json({ session, stale, geo: actorGeo(c.req.raw), ip: actorIp(c.req.raw) })
})

// GET /admin/field-location/assignment/:id/history
// Query: ?limit=<int> (default 500, max 5000)
// Returns: {
//   assignment_id, sessions: [{ id, started_at, ended_at, ended_reason,
//     start_latitude, start_longitude, last_latitude, last_longitude,
//     last_accuracy_m, last_seen_at, point_count }],
//   points: [{ id, session_id, latitude, longitude, accuracy_meters,
//     heading_degrees, speed_mps, source, captured_at }]
// }
//
// Gated by field.location.view_history (see PR #171 - shims to
// manage_team so any dispatch role keeps its history view without a
// role edit, but the granular grant can be revoked independently for
// roles that need finer control). Fires FIELD_LOCATION_HISTORY_VIEWED
// - the read itself is an audit event because a location trail is
// sensitive operational data.
fieldLocationRoutes.get(
  '/field-location/assignment/:id/history',
  requireStaff,
  requirePermission('field.location.view_history'),
  async (c) => {
    const user = c.get('user')
    const assignmentId = c.req.param('id')
    if (!assignmentId) return c.json({ error: 'assignment id is required' }, 400)
    const requestedLimit = Number(c.req.query('limit') || '500')
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(5000, Math.trunc(requestedLimit))) : 500

    const assignment = await loadAssignmentBrief(c.env, assignmentId)
    if (!assignment) return c.json({ error: 'assignment not found' }, 404)

    const sessions = await c.env.DB.prepare(
      `SELECT id, assignment_id, provider_id, status, started_at, ended_at, ended_reason,
              start_latitude, start_longitude, last_latitude, last_longitude,
              last_accuracy_m, last_seen_at, point_count
         FROM field_location_sessions
         WHERE assignment_id = ?
         ORDER BY started_at ASC`,
    ).bind(assignmentId).all()

    const points = await c.env.DB.prepare(
      `SELECT id, session_id, latitude, longitude, accuracy_meters, altitude_meters,
              heading_degrees, speed_mps, source, captured_at
         FROM field_location_points
         WHERE assignment_id = ?
         ORDER BY captured_at ASC
         LIMIT ?`,
    ).bind(assignmentId, limit).all()

    await recordSecurityEvent(c.env, {
      actor: user,
      event: 'FIELD_LOCATION_HISTORY_VIEWED',
      resourceType: 'field_assignment',
      resourceId: assignmentId,
      metadata: {
        session_count: sessions.results?.length ?? 0,
        point_count: points.results?.length ?? 0,
      },
      request: c.req.raw,
    })

    return c.json({
      assignment_id: assignmentId,
      sessions: sessions.results ?? [],
      points: points.results ?? [],
      truncated: (points.results?.length ?? 0) >= limit,
    })
  },
)

// Exported for tests.
export const _internal = {
  distanceMeters,
  DEBOUNCE_MS,
  DEBOUNCE_METERS,
  SESSION_TIMEOUT_MS,
  VALID_END_REASONS,
  VALID_SOURCES,
  ACTIVE_ASSIGNMENT_STATUSES,
}
