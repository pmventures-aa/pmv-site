import type { Env, SessionUser } from './types'
import { scopeFilter } from './scope'
import { buildIcs, type CalendarEvent } from '../../shared/ics'

function randomFeedToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function calendarFeedTokenForUser(db: D1Database, userId: string, rotate = false): Promise<string> {
  if (!rotate) {
    const current = await db.prepare('SELECT token FROM calendar_feed_tokens WHERE user_id = ?')
      .bind(userId).first<{ token: string }>()
    if (current?.token) return current.token
  }
  const token = randomFeedToken()
  await db.prepare(
    `INSERT INTO calendar_feed_tokens (user_id, token, rotated_at)
     VALUES (?, ?, CASE WHEN ? THEN datetime('now') ELSE NULL END)
     ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, rotated_at = datetime('now')`,
  ).bind(userId, token, rotate ? 1 : 0).run()
  return token
}

export async function userIdForCalendarFeedToken(db: D1Database, token: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null
  const row = await db.prepare('SELECT user_id FROM calendar_feed_tokens WHERE token = ?')
    .bind(token).first<{ user_id: string }>()
  return row?.user_id || null
}

export function calendarFeedUrls(origin: string, token: string) {
  const httpsUrl = `${origin.replace(/\/$/, '')}/api/calendar-feed/${token}`
  const webcalUrl = httpsUrl.replace(/^https:/, 'webcal:').replace(/^http:/, 'webcal:')
  return { https_url: httpsUrl, webcal_url: webcalUrl }
}

export async function loadFeedAppointments(env: Env, user: SessionUser): Promise<CalendarEvent[]> {
  const { where, params } = await scopeFilter(env, user)
  const rows = await env.DB.prepare(
    `SELECT id, title, starts_at, status FROM appointments
     WHERE ${where} AND status != 'cancelled' AND starts_at >= datetime('now', '-1 day')
     ORDER BY starts_at ASC LIMIT 200`,
  ).bind(...params).all<{ id: string; title: string | null; starts_at: string; status: string }>()
  return (rows.results || []).map((row) => ({
    id: row.id,
    title: row.title || 'Pinnacle appointment',
    startsAt: row.starts_at,
    description: `Pinnacle appointment (${row.status.replace(/_/g, ' ')})`,
  }))
}

export function icsResponse(events: CalendarEvent[], calendarName: string) {
  const body = buildIcs(events, calendarName)
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="pinnacle-calendar.ics"',
      'Cache-Control': 'no-store',
    },
  })
}
