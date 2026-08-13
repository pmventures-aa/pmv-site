import type { Env, SessionUser } from './types'
import { scopeFilter } from './scope'
import { buildIcs, type CalendarEvent } from '../../shared/ics'

const encoder = new TextEncoder()

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret) as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message) as unknown as BufferSource)
  return [...new Uint8Array(sig)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function signCalendarFeedToken(userId: string, secret: string): Promise<string> {
  const sig = await hmacHex(secret, `calv1:${userId}`)
  return `${userId}.${sig.slice(0, 32)}`
}

export async function verifyCalendarFeedToken(token: string, secret: string): Promise<string | null> {
  const dot = token.indexOf('.')
  if (dot < 8) return null
  const userId = token.slice(0, dot)
  const given = token.slice(dot + 1)
  const expected = (await hmacHex(secret, `calv1:${userId}`)).slice(0, 32)
  if (given.length !== expected.length) return null
  let mismatch = 0
  for (let i = 0; i < expected.length; i += 1) mismatch |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return mismatch === 0 ? userId : null
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
