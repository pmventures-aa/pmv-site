import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireUser } from '../mid'

export const presenceRoutes = new Hono<AppEnv>()

// Presence signal for green/yellow/red status dots. Reads users.last_seen_at
// (bumped throttled from session.ts touchSession) and returns a status keyed
// by user id. Caller passes ?ids=a,b,c so we only compute presence for the
// users the UI actually needs, keeping the response tiny and avoiding an
// N+1 pattern where each dot polls independently. Both HQ (staff) and
// portal (clients) consume the same endpoint; the payload never includes
// full user rows, only status + last_seen_at, so the endpoint is safe to
// call from a portal user asking about their assigned staff and vice
// versa.
//
// Thresholds:
//   * green  = last_seen_at within 3 minutes  (actively working)
//   * yellow = within 15 minutes               (idle, may be back)
//   * red    = older than 15 minutes OR null   (offline / never seen)

const GREEN_MS = 3 * 60_000
const YELLOW_MS = 15 * 60_000

export type PresenceStatus = 'green' | 'yellow' | 'red'

interface UserSeenRow { id: string; last_seen_at: string | null }

function classify(lastSeen: string | null): PresenceStatus {
  if (!lastSeen) return 'red'
  const seen = Date.parse(lastSeen.includes('T') ? lastSeen : lastSeen.replace(' ', 'T') + 'Z')
  if (Number.isNaN(seen)) return 'red'
  const elapsed = Date.now() - seen
  if (elapsed <= GREEN_MS) return 'green'
  if (elapsed <= YELLOW_MS) return 'yellow'
  return 'red'
}

presenceRoutes.get('/presence', requireUser, async (c) => {
  const raw = c.req.query('ids') || ''
  const ids = raw.split(',').map((v) => v.trim()).filter(Boolean).slice(0, 100)
  if (ids.length === 0) return c.json({ statuses: {} })
  const placeholders = ids.map(() => '?').join(',')
  const res = await c.env.DB.prepare(`SELECT id, last_seen_at FROM users WHERE id IN (${placeholders})`).bind(...ids).all<UserSeenRow>()
  const map: Record<string, { status: PresenceStatus; last_seen_at: string | null }> = {}
  for (const row of res.results ?? []) {
    map[row.id] = { status: classify(row.last_seen_at), last_seen_at: row.last_seen_at }
  }
  // Include ids the DB didn't return (deleted / unknown) as 'red' so the UI
  // always gets a value per id it asked for.
  for (const id of ids) if (!map[id]) map[id] = { status: 'red', last_seen_at: null }
  return c.json({ statuses: map })
})
