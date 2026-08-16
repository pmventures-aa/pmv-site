import type { Env } from './types'

// Provider-neutral adapter surface for two-way external calendar sync. The
// sprint spec limits scope to Google Calendar first; Microsoft Graph rides
// the same interface later. Nothing here reaches the network unless the
// caller passes real credentials.

export type CalendarProvider = 'google' | 'microsoft'

export interface ProviderAccount {
  id: string
  user_id: string
  provider: CalendarProvider
  provider_account_id: string
  email: string | null
  target_calendar_id: string
  target_calendar_name: string | null
  status: 'active' | 'disconnected' | 'error'
  connected_at: string
}

export interface ExternalEvent {
  external_event_id: string
  etag?: string | null
  updated_at?: string | null
  title: string
  description?: string | null
  starts_at: string
  ends_at?: string | null
  all_day?: boolean
  location?: string | null
  status?: 'confirmed' | 'tentative' | 'cancelled'
}

export interface SyncCursor {
  sync_token?: string | null
}

export interface CalendarAdapter {
  provider: CalendarProvider

  // OAuth
  buildAuthUrl(state: string, redirectUri: string): string
  exchangeCode(code: string, redirectUri: string): Promise<{
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
    account_id: string
    email: string | null
  }>
  refresh(refreshToken: string): Promise<{ access_token: string; expires_in: number }>
  revoke(accessToken: string): Promise<void>

  // Event operations. Callers must decrypt tokens before invoking.
  listChanges(accessToken: string, calendarId: string, cursor: SyncCursor): Promise<{
    events: ExternalEvent[]
    next_sync_token: string | null
    expired: boolean       // true when the provider rejects our sync token; caller must resync
  }>
  createExternalEvent(accessToken: string, calendarId: string, ev: ExternalEvent): Promise<ExternalEvent>
  updateExternalEvent(accessToken: string, calendarId: string, ev: ExternalEvent): Promise<ExternalEvent>
  deleteExternalEvent(accessToken: string, calendarId: string, externalId: string): Promise<void>
  getBusyTime(accessToken: string, calendarId: string, from: string, to: string): Promise<Array<{ from: string; to: string }>>

  // Push notifications
  registerWatch(accessToken: string, calendarId: string, webhookUrl: string, token: string): Promise<{
    channel_id: string
    resource_id: string
    expiration: string
  }>
  stopWatch(accessToken: string, channelId: string, resourceId: string): Promise<void>
}

export interface AdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

export function googleConfig(env: Env): AdapterConfig {
  const e = env as unknown as Record<string, string | undefined>
  return {
    clientId: e.GOOGLE_CLIENT_ID,
    clientSecret: e.GOOGLE_CLIENT_SECRET,
    redirectUri: e.GOOGLE_REDIRECT_URI,
  }
}

export function isConfigured(cfg: AdapterConfig): boolean {
  return !!(cfg.clientId && cfg.clientSecret && cfg.redirectUri)
}

// The Google adapter is a bounded shell that will make real Google Calendar
// API calls when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI
// are set on the Cloudflare Pages environment. Every method that would
// require credentials throws when isConfigured() is false, which the routes
// translate into a 503 that the Settings UI already handles.
export function makeGoogleAdapter(cfg: AdapterConfig): CalendarAdapter {
  function requireCfg() {
    if (!isConfigured(cfg)) {
      throw Object.assign(new Error('Google Calendar OAuth is not configured on this deployment.'), { code: 'unconfigured' })
    }
  }

  return {
    provider: 'google',
    buildAuthUrl(state, redirectUri) {
      requireCfg()
      const params = new URLSearchParams({
        client_id: cfg.clientId!,
        redirect_uri: redirectUri || cfg.redirectUri!,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        scope: [
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/calendar.readonly',
          'openid',
          'email',
        ].join(' '),
        state,
      })
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    },
    async exchangeCode(code, redirectUri) {
      requireCfg()
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: cfg.clientId!, client_secret: cfg.clientSecret!,
          redirect_uri: redirectUri || cfg.redirectUri!, grant_type: 'authorization_code',
        }).toString(),
      })
      if (!res.ok) throw new Error(`google token exchange failed (${res.status})`)
      const body = await res.json() as any
      // Fetch userinfo so we can label the account
      let email: string | null = null
      let account_id = ''
      try {
        const uir = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${body.access_token}` } })
        if (uir.ok) { const ui = await uir.json() as any; email = ui.email || null; account_id = ui.sub || '' }
      } catch {}
      return { access_token: body.access_token, refresh_token: body.refresh_token, expires_in: body.expires_in, scope: body.scope, account_id, email }
    },
    async refresh(refreshToken) {
      requireCfg()
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ refresh_token: refreshToken, client_id: cfg.clientId!, client_secret: cfg.clientSecret!, grant_type: 'refresh_token' }).toString(),
      })
      if (!res.ok) throw new Error(`google token refresh failed (${res.status})`)
      const body = await res.json() as any
      return { access_token: body.access_token, expires_in: body.expires_in }
    },
    async revoke(accessToken) {
      requireCfg()
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, { method: 'POST' })
    },
    async listChanges(accessToken, calendarId, cursor) {
      requireCfg()
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`)
      if (cursor.sync_token) url.searchParams.set('syncToken', cursor.sync_token)
      else { url.searchParams.set('maxResults', '250'); url.searchParams.set('showDeleted', 'true') }
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
      if (res.status === 410) return { events: [], next_sync_token: null, expired: true }
      if (!res.ok) throw new Error(`google list failed (${res.status})`)
      const body = await res.json() as any
      const events: ExternalEvent[] = (body.items || []).map((ev: any) => ({
        external_event_id: ev.id,
        etag: ev.etag,
        updated_at: ev.updated,
        title: ev.summary || '',
        description: ev.description,
        starts_at: ev.start?.dateTime || (ev.start?.date ? `${ev.start.date}T00:00:00Z` : ''),
        ends_at: ev.end?.dateTime || (ev.end?.date ? `${ev.end.date}T00:00:00Z` : null),
        all_day: !!ev.start?.date,
        location: ev.location || null,
        status: (ev.status === 'cancelled' ? 'cancelled' : 'confirmed'),
      }))
      return { events, next_sync_token: body.nextSyncToken || null, expired: false }
    },
    async createExternalEvent(accessToken, calendarId, ev) {
      requireCfg()
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(toGoogleEvent(ev)),
      })
      if (!res.ok) throw new Error(`google create failed (${res.status})`)
      const body = await res.json() as any
      return { ...ev, external_event_id: body.id, etag: body.etag, updated_at: body.updated }
    },
    async updateExternalEvent(accessToken, calendarId, ev) {
      requireCfg()
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(ev.external_event_id)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(ev.etag ? { 'If-Match': ev.etag } : {}) },
        body: JSON.stringify(toGoogleEvent(ev)),
      })
      if (!res.ok) throw new Error(`google update failed (${res.status})`)
      const body = await res.json() as any
      return { ...ev, etag: body.etag, updated_at: body.updated }
    },
    async deleteExternalEvent(accessToken, calendarId, externalId) {
      requireCfg()
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalId)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok && res.status !== 410) throw new Error(`google delete failed (${res.status})`)
    },
    async getBusyTime(accessToken, calendarId, from, to) {
      requireCfg()
      const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeMin: from, timeMax: to, items: [{ id: calendarId }] }),
      })
      if (!res.ok) throw new Error(`google freebusy failed (${res.status})`)
      const body = await res.json() as any
      const busy = body?.calendars?.[calendarId]?.busy || []
      return busy.map((b: any) => ({ from: b.start, to: b.end }))
    },
    async registerWatch(accessToken, calendarId, webhookUrl, token) {
      requireCfg()
      const channelId = crypto.randomUUID()
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: channelId, type: 'web_hook', address: webhookUrl, token }),
      })
      if (!res.ok) throw new Error(`google watch failed (${res.status})`)
      const body = await res.json() as any
      return { channel_id: body.id, resource_id: body.resourceId, expiration: new Date(Number(body.expiration || Date.now() + 6 * 3600e3)).toISOString() }
    },
    async stopWatch(accessToken, channelId, resourceId) {
      requireCfg()
      await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: channelId, resourceId }),
      })
    },
  }
}

function toGoogleEvent(ev: ExternalEvent) {
  const payload: Record<string, unknown> = {
    summary: ev.title,
    description: ev.description || undefined,
    location: ev.location || undefined,
    status: ev.status || 'confirmed',
  }
  if (ev.all_day) {
    payload.start = { date: ev.starts_at.slice(0, 10) }
    payload.end = { date: (ev.ends_at || ev.starts_at).slice(0, 10) }
  } else {
    payload.start = { dateTime: ev.starts_at }
    payload.end = { dateTime: ev.ends_at || ev.starts_at }
  }
  return payload
}

// A tiny SHA-256 hash of the canonical payload we last pushed - used to
// prevent write-echo loops (Pinnacle updates Google, Google webhook fires,
// Pinnacle sees the same content, does not re-write).
export async function payloadHash(ev: ExternalEvent): Promise<string> {
  const canon = JSON.stringify({
    title: ev.title, description: ev.description || '', starts_at: ev.starts_at,
    ends_at: ev.ends_at || '', all_day: !!ev.all_day, location: ev.location || '',
    status: ev.status || 'confirmed',
  })
  const bytes = new TextEncoder().encode(canon)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
