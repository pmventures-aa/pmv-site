import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { buildIcs, type CalendarEvent } from '../../../shared/ics'

export const providerCalendarFeedRoutes = new Hono<AppEnv>()

// Subscribe-once calendar feed.
//
// Per-assignment invites are decisions a provider makes one at a time. This is
// the standing picture: subscribe to one URL in whatever calendar they already
// use, and every PMV assignment shows up from then on.
//
// The URL is the credential. The feed carries client names and site addresses,
// so the token is 32 bytes of randomness and the route is deliberately narrow:
// it returns text/calendar and nothing else, it never reveals whether a
// missing token belonged to a real provider, and it is not cached by anything
// in front of it.

function newToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function ensureToken(env: AppEnv['Bindings'], vendorUserId: string, rotate = false): Promise<string> {
  const existing = await env.DB.prepare(
    'SELECT token FROM provider_calendar_feeds WHERE vendor_user_id = ?',
  ).bind(vendorUserId).first<{ token: string }>()
  if (existing && !rotate) return existing.token

  const token = newToken()
  if (existing) {
    await env.DB.prepare(
      "UPDATE provider_calendar_feeds SET token = ?, rotated_at = datetime('now') WHERE vendor_user_id = ?",
    ).bind(token, vendorUserId).run()
  } else {
    await env.DB.prepare(
      'INSERT INTO provider_calendar_feeds (vendor_user_id, token) VALUES (?, ?)',
    ).bind(vendorUserId, token).run()
  }
  return token
}

function feedUrl(token: string): string {
  return `https://secure.pinnaclemanagementventures.com/api/calendar/provider/${token}.ics`
}

/** A provider reads, or rotates, their own feed URL. Nobody reads it for them. */
providerCalendarFeedRoutes.get('/provider-calendar-feed', requireStaff, async (c) => {
  const user = c.get('user')
  const token = await ensureToken(c.env, user.id)
  return c.json({ url: feedUrl(token) })
})

providerCalendarFeedRoutes.post('/provider-calendar-feed/rotate', requireStaff, async (c) => {
  const user = c.get('user')
  const token = await ensureToken(c.env, user.id, true)
  // Every previous subscription stops updating, which is what revoke has to
  // mean when the URL itself is the credential.
  return c.json({ url: feedUrl(token), rotated: true })
})

// ---------------------------------------------------------------- the feed

export const providerCalendarFeedPublic = new Hono<AppEnv>()

interface FeedRow {
  id: string
  title: string | null
  starts_at: string
  ends_at: string | null
  address: string | null
  location_name: string | null
  description: string | null
  status: string | null
}

providerCalendarFeedPublic.get('/calendar/provider/:token', async (c) => {
  const raw = c.req.param('token') || ''
  const token = raw.replace(/\.ics$/i, '')
  // Length-checked before touching the database so a short guess costs nothing.
  if (token.length !== 64) return c.text('Not found', 404)

  const owner = await c.env.DB.prepare(
    'SELECT vendor_user_id FROM provider_calendar_feeds WHERE token = ?',
  ).bind(token).first<{ vendor_user_id: string }>()
  // Same answer for a wrong token and a real one that was rotated: the feed
  // either exists for this URL or it does not.
  if (!owner) return c.text('Not found', 404)

  const { results } = await c.env.DB.prepare(
    `SELECT id, title, starts_at, ends_at, address, location_name, description, status
       FROM calendar_events
      WHERE vendor_user_id = ?
        AND status IN ('proposed', 'confirmed', 'completed')
        AND starts_at > datetime('now', '-90 days')
      ORDER BY starts_at
      LIMIT 500`,
  ).bind(owner.vendor_user_id).all<FeedRow>()

  const events: CalendarEvent[] = (results ?? []).map((row) => {
    const startMs = Date.parse(row.starts_at)
    const endMs = row.ends_at ? Date.parse(row.ends_at) : NaN
    const durationMinutes = Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.max(15, Math.round((endMs - startMs) / 60_000))
      : 60
    return {
      id: row.id,
      title: row.title || 'Pinnacle assignment',
      startsAt: row.starts_at,
      durationMinutes,
      description: row.description || undefined,
      location: [row.location_name, row.address].filter(Boolean).join(', ') || undefined,
    }
  })

  return new Response(buildIcs(events, 'Pinnacle Work'), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="pinnacle-work.ics"',
      // The URL is a credential, so nothing in front of this may keep a copy.
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
    },
  })
})
