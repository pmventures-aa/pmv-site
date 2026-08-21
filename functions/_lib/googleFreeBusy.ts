import type { Env } from './types'
import { decryptSensitive, encryptSensitive } from './crypto'
import { googleConfig, isConfigured, makeGoogleAdapter } from './externalCalendar'

// Google Calendar free/busy for consultation availability.
//
// Deliberately freebusy, not event sync. Blocking a slot only needs to know
// that a span is taken; it does not need titles, attendees, or a two-way
// mirror of someone's calendar. Google returns exactly that from /freeBusy,
// and asking for nothing more means a leaked or over-broad grant cannot
// expose what the host is actually doing.
//
// Token storage: the columns have always been named *_enc, but tokens were
// written in plaintext with encryption deferred. Wiring booking availability
// on top of them makes a long-lived Google refresh token load-bearing, so
// they are encrypted here with the same AES-GCM helper the ACH fields use.
// Reads accept either form so existing connections keep working and upgrade
// on their next refresh.

const FREEBUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy'
// Availability is requested on nearly every page view of the booking page.
// A short cache keeps a burst of visitors from becoming a burst of Google
// calls, while staying fresh enough that a just-added meeting blocks quickly.
const CACHE_TTL_SECONDS = 120
const REQUEST_TIMEOUT_MS = 6000

export interface BusySpan { startsAt: string; endsAt: string }

interface AccountRow {
  id: string
  access_token_enc: string | null
  refresh_token_enc: string | null
  access_token_expires: string | null
  target_calendar_id: string
  status: string
}

/** Stored ciphertext is `<ivB64>.<ctB64>`; anything else is legacy plaintext. */
function looksEncrypted(value: string): boolean {
  const parts = value.split('.')
  return parts.length === 2 && parts[0].length >= 12 && parts[1].length > 0
}

export async function readToken(env: Env, stored: string | null): Promise<string | null> {
  if (!stored) return null
  if (!looksEncrypted(stored)) return stored
  try {
    return await decryptSensitive(stored, env.PAYMENT_ENCRYPTION_KEY)
  } catch {
    // A token we cannot decrypt is a token we cannot use. Treating it as
    // absent makes the caller reconnect rather than fail obscurely.
    return null
  }
}

export async function writeToken(env: Env, plaintext: string | null): Promise<string | null> {
  if (!plaintext) return null
  try {
    return await encryptSensitive(plaintext, env.PAYMENT_ENCRYPTION_KEY)
  } catch {
    return null
  }
}

async function withTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * A usable access token for this user, refreshing it when expired.
 *
 * Returns null rather than throwing for every "not connected" shape, because
 * the caller's job is to render availability, not to explain Google.
 */
export async function googleAccessTokenFor(env: Env, userId: string): Promise<{ token: string; calendarId: string } | null> {
  const cfg = googleConfig(env)
  if (!isConfigured(cfg)) return null

  const row = await env.DB.prepare(
    `SELECT id, access_token_enc, refresh_token_enc, access_token_expires, target_calendar_id, status
       FROM calendar_provider_accounts
      WHERE user_id = ? AND provider = 'google' AND status = 'active'`,
  ).bind(userId).first<AccountRow>().catch(() => null)
  if (!row) return null

  const calendarId = row.target_calendar_id || 'primary'
  const expires = row.access_token_expires ? Date.parse(row.access_token_expires) : 0
  // Refresh a minute early so a token cannot expire mid-request.
  if (expires && expires - 60_000 > Date.now()) {
    const token = await readToken(env, row.access_token_enc)
    if (token) return { token, calendarId }
  }

  const refresh = await readToken(env, row.refresh_token_enc)
  if (!refresh) return null

  try {
    const next = await makeGoogleAdapter(cfg).refresh(refresh)
    const nextExpires = new Date(Date.now() + (next.expires_in || 3600) * 1000).toISOString()
    await env.DB.prepare(
      `UPDATE calendar_provider_accounts
          SET access_token_enc = ?, access_token_expires = ?, last_error = NULL
        WHERE id = ?`,
    ).bind(await writeToken(env, next.access_token), nextExpires, row.id).run()
    return { token: next.access_token, calendarId }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'refresh failed'
    // Record why, so Settings can say "reconnect" instead of failing silently.
    await env.DB.prepare(
      `UPDATE calendar_provider_accounts SET status = 'error', last_error = ? WHERE id = ?`,
    ).bind(message.slice(0, 200), row.id).run().catch(() => {})
    return null
  }
}

/**
 * Busy spans from the user's Google calendar between two instants.
 *
 * Returns an empty list for every "cannot answer" case: not configured, not
 * connected, refresh failed, Google unreachable. That is deliberate and worth
 * being explicit about, because it fails OPEN: a Google outage means slots
 * stay bookable rather than the booking page going blank. The alternative,
 * failing closed, would silently show no availability at all and look exactly
 * like being fully booked.
 */
export async function googleBusySpans(env: Env, userId: string, fromIso: string, toIso: string): Promise<BusySpan[]> {
  const cacheKey = `gcal-busy:${userId}:${fromIso}:${toIso}`
  try {
    const cached = await env.SESSIONS.get(cacheKey)
    if (cached) return JSON.parse(cached) as BusySpan[]
  } catch { /* a cache miss is not a failure */ }

  const auth = await googleAccessTokenFor(env, userId)
  if (!auth) return []

  let response: Response
  try {
    response = await withTimeout(FREEBUSY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin: fromIso, timeMax: toIso, items: [{ id: auth.calendarId }] }),
    })
  } catch (err) {
    console.error('[gcal-freebusy] request failed', err instanceof Error ? err.message : err)
    return []
  }
  if (!response.ok) {
    console.error('[gcal-freebusy] returned', response.status)
    return []
  }

  const payload = await response.json().catch(() => null) as
    { calendars?: Record<string, { busy?: Array<{ start?: string; end?: string }>; errors?: unknown[] }> } | null
  const calendar = payload?.calendars?.[auth.calendarId]
  const spans: BusySpan[] = (calendar?.busy || [])
    .filter((b): b is { start: string; end: string } => !!b.start && !!b.end)
    .map((b) => ({ startsAt: new Date(b.start).toISOString(), endsAt: new Date(b.end).toISOString() }))

  try {
    await env.SESSIONS.put(cacheKey, JSON.stringify(spans), { expirationTtl: CACHE_TTL_SECONDS })
  } catch { /* caching is an optimization */ }

  return spans
}

/** Whether this user has a Google calendar connected and usable. */
export async function googleCalendarConnected(env: Env, userId: string): Promise<boolean> {
  return (await googleAccessTokenFor(env, userId)) !== null
}
