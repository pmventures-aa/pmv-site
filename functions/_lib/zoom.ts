// Zoom meeting generation for consultations.
//
// Uses Server-to-Server OAuth: account-level credentials, no per-user consent
// flow, no Marketplace review. Three secrets (account id, client id, client
// secret) plus a host address. When any is missing the whole module is inert
// and callers carry on without a link, which is what keeps booking working on
// a deployment that has not been configured yet.
//
// Two rules this module exists to enforce:
//
//   * The create response contains BOTH join_url and start_url. start_url is a
//     bearer credential that drops the holder into the meeting AS THE HOST. It
//     is never returned from here, never stored, and never logged. Only the
//     join url leaves this file.
//   * Zoom is never allowed to fail a booking. Every function returns a result
//     object rather than throwing, so the caller records the booking either
//     way and the link becomes a thing that can be added later.

import type { Env } from './types'

const TOKEN_URL = 'https://zoom.us/oauth/token'
const API_BASE = 'https://api.zoom.us/v2'
// Zoom access tokens last an hour. Cache just under that so a request never
// races the expiry.
const TOKEN_CACHE_KEY = 'zoom:s2s:token'
const TOKEN_TTL_SECONDS = 3300
// A slow Zoom must not hold a booking request open.
const REQUEST_TIMEOUT_MS = 8000

export interface ZoomMeeting {
  meetingId: string
  joinUrl: string
  /** Numeric passcode when Zoom assigns one. Safe to show the attendee. */
  password: string | null
}

export type ZoomResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'not_configured' | 'auth_failed' | 'request_failed'; detail: string }

interface ZoomConfig {
  accountId: string
  clientId: string
  clientSecret: string
  hostEmail: string
}

export function zoomConfig(env: Env): ZoomConfig | null {
  const accountId = env.ZOOM_ACCOUNT_ID?.trim()
  const clientId = env.ZOOM_CLIENT_ID?.trim()
  const clientSecret = env.ZOOM_CLIENT_SECRET?.trim()
  if (!accountId || !clientId || !clientSecret) return null
  return { accountId, clientId, clientSecret, hostEmail: env.ZOOM_HOST_EMAIL?.trim() || 'me' }
}

export function isZoomConfigured(env: Env): boolean {
  return zoomConfig(env) !== null
}

function base64(input: string): string {
  // btoa is available in Workers; this is ASCII credential material only.
  return btoa(input)
}

async function withTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch an access token, reusing the cached one when it is still good.
 *
 * The token is cached in KV rather than module scope because Workers isolates
 * are short-lived and numerous; without it every booking would mint a fresh
 * token and burn through Zoom's rate limit.
 */
export async function getZoomToken(env: Env): Promise<ZoomResult<string>> {
  const config = zoomConfig(env)
  if (!config) return { ok: false, reason: 'not_configured', detail: 'Zoom credentials are not set' }

  try {
    const cached = await env.SESSIONS.get(TOKEN_CACHE_KEY)
    if (cached) return { ok: true, value: cached }
  } catch {
    // A KV read failure just means we mint a fresh token.
  }

  let response: Response
  try {
    response = await withTimeout(
      `${TOKEN_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(config.accountId)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${base64(`${config.clientId}:${config.clientSecret}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    )
  } catch (err) {
    return { ok: false, reason: 'request_failed', detail: err instanceof Error ? err.message : 'token request failed' }
  }

  if (!response.ok) {
    // Deliberately does not include the response body: a failed token exchange
    // can echo credential material back, and this string reaches logs.
    return { ok: false, reason: 'auth_failed', detail: `Zoom token exchange returned ${response.status}` }
  }

  const payload = await response.json().catch(() => null) as { access_token?: string; expires_in?: number } | null
  const token = payload?.access_token
  if (!token) return { ok: false, reason: 'auth_failed', detail: 'Zoom token response had no access_token' }

  try {
    const ttl = Math.max(60, Math.min(TOKEN_TTL_SECONDS, (payload?.expires_in ?? TOKEN_TTL_SECONDS) - 300))
    await env.SESSIONS.put(TOKEN_CACHE_KEY, token, { expirationTtl: ttl })
  } catch {
    // Caching is an optimization, not a requirement.
  }

  return { ok: true, value: token }
}

export interface CreateMeetingInput {
  topic: string
  /** UTC ISO instant. */
  startsAt: string
  durationMinutes: number
  /** IANA timezone, shown to the host in the Zoom UI. */
  timezone: string
  agenda?: string
}

export async function createZoomMeeting(env: Env, input: CreateMeetingInput): Promise<ZoomResult<ZoomMeeting>> {
  const config = zoomConfig(env)
  if (!config) return { ok: false, reason: 'not_configured', detail: 'Zoom credentials are not set' }

  const token = await getZoomToken(env)
  if (!token.ok) return token

  // Zoom wants 'YYYY-MM-DDTHH:mm:ssZ'; a millisecond component is rejected.
  const startTime = `${new Date(input.startsAt).toISOString().slice(0, 19)}Z`

  let response: Response
  try {
    response = await withTimeout(`${API_BASE}/users/${encodeURIComponent(config.hostEmail)}/meetings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: input.topic.slice(0, 200),
        type: 2, // scheduled meeting
        start_time: startTime,
        duration: Math.max(5, Math.min(480, Math.round(input.durationMinutes))),
        timezone: input.timezone,
        agenda: (input.agenda || '').slice(0, 2000),
        settings: {
          // On, so a forwarded join link is not an open door into the call.
          waiting_room: true,
          join_before_host: false,
          approval_type: 2, // no registration required
          auto_recording: 'none',
          audio: 'both',
        },
      }),
    })
  } catch (err) {
    return { ok: false, reason: 'request_failed', detail: err instanceof Error ? err.message : 'meeting create failed' }
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    return { ok: false, reason: 'request_failed', detail: `Zoom create returned ${response.status}: ${body.slice(0, 200)}` }
  }

  const payload = await response.json().catch(() => null) as
    { id?: number | string; join_url?: string; password?: string } | null
  if (!payload?.id || !payload.join_url) {
    return { ok: false, reason: 'request_failed', detail: 'Zoom create response was missing id or join_url' }
  }

  // Note what is NOT read here: payload.start_url. It is a host credential and
  // must not travel any further than this response object.
  return {
    ok: true,
    value: { meetingId: String(payload.id), joinUrl: payload.join_url, password: payload.password || null },
  }
}

export interface UpdateMeetingInput {
  startsAt: string
  durationMinutes: number
  timezone: string
  topic?: string
}

export async function updateZoomMeeting(env: Env, meetingId: string, input: UpdateMeetingInput): Promise<ZoomResult<true>> {
  const config = zoomConfig(env)
  if (!config) return { ok: false, reason: 'not_configured', detail: 'Zoom credentials are not set' }
  const token = await getZoomToken(env)
  if (!token.ok) return token

  const startTime = `${new Date(input.startsAt).toISOString().slice(0, 19)}Z`
  let response: Response
  try {
    response = await withTimeout(`${API_BASE}/meetings/${encodeURIComponent(meetingId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_time: startTime,
        duration: Math.max(5, Math.min(480, Math.round(input.durationMinutes))),
        timezone: input.timezone,
        ...(input.topic ? { topic: input.topic.slice(0, 200) } : {}),
      }),
    })
  } catch (err) {
    return { ok: false, reason: 'request_failed', detail: err instanceof Error ? err.message : 'meeting update failed' }
  }

  // 204 on success. A 404 means it is already gone, which is not a problem
  // worth surfacing to a caller that only wanted it changed.
  if (response.ok || response.status === 404) return { ok: true, value: true }
  return { ok: false, reason: 'request_failed', detail: `Zoom update returned ${response.status}` }
}

export async function deleteZoomMeeting(env: Env, meetingId: string): Promise<ZoomResult<true>> {
  const config = zoomConfig(env)
  if (!config) return { ok: false, reason: 'not_configured', detail: 'Zoom credentials are not set' }
  const token = await getZoomToken(env)
  if (!token.ok) return token

  let response: Response
  try {
    response = await withTimeout(`${API_BASE}/meetings/${encodeURIComponent(meetingId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
  } catch (err) {
    return { ok: false, reason: 'request_failed', detail: err instanceof Error ? err.message : 'meeting delete failed' }
  }

  // Already deleted is the outcome the caller wanted.
  if (response.ok || response.status === 404) return { ok: true, value: true }
  return { ok: false, reason: 'request_failed', detail: `Zoom delete returned ${response.status}` }
}
