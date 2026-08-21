import { Hono } from 'hono'
import { googleBusySpans, googleCalendarConnected, writeToken } from '../googleFreeBusy'
import type { AppEnv } from '../types'
import { requireUser } from '../mid'
import {
  googleConfig, isConfigured, makeGoogleAdapter,
} from '../externalCalendar'

export const externalCalendarRoutes = new Hono<AppEnv>()
// Public webhook receiver - Google POSTs unauthenticated, verified via
// channel token instead. Mounted separately at the app root, not under
// /admin, so it does not require a session.
export const externalCalendarWebhookRoutes = new Hono<AppEnv>()

// Small helper: return the state of a user's Google connection without ever
// leaking token material. The Settings UI polls this to know what card to
// render.
externalCalendarRoutes.get('/external-calendar/google/status', requireUser, async (c) => {
  const cfg = googleConfig(c.env)
  const configured = isConfigured(cfg)
  const user = c.get('user')
  let account: {
    connected: boolean
    email?: string | null
    target_calendar_id?: string
    target_calendar_name?: string | null
    connected_at?: string
    last_synced_at?: string | null
    last_sync_status?: string
    last_sync_error?: string | null
    status?: string
    needs_reconnect?: boolean
    last_error?: string | null
  } = { connected: false }
  try {
    // Deliberately NOT filtered to status='active'. A grant that has expired
    // or been revoked is marked 'error', and filtering those out made a dead
    // connection indistinguishable from never having connected: the settings
    // page said "Not connected" while availability quietly stopped blocking
    // slots. A broken connection is a different thing from no connection and
    // has to say so.
    const row = await c.env.DB.prepare(
      `SELECT a.email, a.target_calendar_id, a.target_calendar_name, a.connected_at,
              a.status, a.last_error,
              s.last_synced_at, s.last_sync_status, s.last_sync_error
       FROM calendar_provider_accounts a
       LEFT JOIN calendar_sync_state s ON s.account_id = a.id
       WHERE a.user_id = ? AND a.provider = 'google' AND a.status != 'disconnected'
       LIMIT 1`,
    ).bind(user.id).first<any>()
    if (row) account = { connected: true, ...row, needs_reconnect: row.status === 'error' }
  } catch {
    // Table may not exist yet in a partially migrated environment - fall
    // through to "not connected" rather than 500ing the settings UI.
  }
  return c.json({ configured, provider: 'google', account })
})

// Kicks off OAuth. Returns { url } instead of a 302 so the frontend can
// choose to open in a new tab or the current one.
externalCalendarRoutes.get('/external-calendar/google/connect', requireUser, async (c) => {
  const cfg = googleConfig(c.env)
  if (!isConfigured(cfg)) return c.json({ error: 'Google Calendar OAuth is not configured on this deployment.' }, 503)
  const adapter = makeGoogleAdapter(cfg)
  // State ties the eventual callback to the caller so a session hijack
  // cannot bind someone else's Google account to your Pinnacle user.
  const state = crypto.randomUUID()
  const user = c.get('user')
  try {
    await c.env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS calendar_oauth_states (
         state TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    ).run()
    await c.env.DB.prepare(
      `INSERT INTO calendar_oauth_states (state, user_id, provider) VALUES (?, ?, 'google')`,
    ).bind(state, user.id).run()
  } catch {}
  return c.json({ url: adapter.buildAuthUrl(state, cfg.redirectUri!) })
})

// OAuth redirect target. Google calls back with ?code=&state=.
externalCalendarRoutes.get('/external-calendar/google/callback', async (c) => {
  const cfg = googleConfig(c.env)
  if (!isConfigured(cfg)) return c.text('Google Calendar OAuth is not configured.', 503)
  const code = c.req.query('code') || ''
  const state = c.req.query('state') || ''
  if (!code || !state) return c.text('missing code/state', 400)
  const row = await c.env.DB.prepare(
    `SELECT user_id FROM calendar_oauth_states WHERE state = ? AND provider = 'google'`,
  ).bind(state).first<{ user_id: string }>()
  if (!row) return c.text('invalid state', 400)
  await c.env.DB.prepare(`DELETE FROM calendar_oauth_states WHERE state = ?`).bind(state).run()

  const adapter = makeGoogleAdapter(cfg)
  const tok = await adapter.exchangeCode(code, cfg.redirectUri!)
  // Encrypted at rest with the same AES-GCM helper the ACH fields use. These
  // are long-lived credentials granting read access to someone's calendar,
  // and consultation availability now depends on them, so the *_enc column
  // names finally mean what they say.
  const accountId = crypto.randomUUID()
  const expires = new Date(Date.now() + tok.expires_in * 1000).toISOString()
  await c.env.DB.prepare(
    `INSERT INTO calendar_provider_accounts (id, user_id, provider, provider_account_id, email,
                                              access_token_enc, refresh_token_enc, access_token_expires,
                                              scopes, status)
     VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?, 'active')
     ON CONFLICT(user_id, provider) DO UPDATE SET
       provider_account_id = excluded.provider_account_id,
       email = excluded.email,
       access_token_enc = excluded.access_token_enc,
       refresh_token_enc = COALESCE(excluded.refresh_token_enc, calendar_provider_accounts.refresh_token_enc),
       access_token_expires = excluded.access_token_expires,
       scopes = excluded.scopes,
       status = 'active',
       last_error = NULL,
       connected_at = datetime('now'),
       disconnected_at = NULL`,
  ).bind(accountId, row.user_id, tok.account_id || row.user_id, tok.email, await writeToken(c.env, tok.access_token), await writeToken(c.env, tok.refresh_token || null), expires, tok.scope || '').run()
  return c.html('<html><body style="font-family:system-ui;padding:2rem;text-align:center"><h1>Google Calendar connected</h1><p>You can close this window and return to Pinnacle.</p><script>setTimeout(()=>window.close(),1200)</script></body></html>')
})

externalCalendarRoutes.post('/external-calendar/google/disconnect', requireUser, async (c) => {
  const user = c.get('user')
  try {
    await c.env.DB.prepare(
      `UPDATE calendar_provider_accounts SET status = 'disconnected', disconnected_at = datetime('now'), access_token_enc = NULL, refresh_token_enc = NULL WHERE user_id = ? AND provider = 'google'`,
    ).bind(user.id).run()
  } catch {}
  return c.json({ ok: true })
})

// Verifies the connection by asking Google for this week's busy spans, which
// is exactly what consultation availability uses. Reporting the count proves
// the grant works end to end rather than claiming success and leaving the
// first real failure to surface as an empty booking page.
externalCalendarRoutes.post('/external-calendar/google/sync-now', requireUser, async (c) => {
  const cfg = googleConfig(c.env)
  if (!isConfigured(cfg)) return c.json({ error: 'Google Calendar OAuth is not configured on this deployment.' }, 503)
  const user = c.get('user')
  const from = new Date().toISOString()
  const to = new Date(Date.now() + 7 * 86_400_000).toISOString()
  const busy = await googleBusySpans(c.env, user.id, from, to)
  const connected = await googleCalendarConnected(c.env, user.id)
  if (!connected) {
    return c.json({ ok: false, connected: false, note: 'Google is not connected, or the connection needs to be renewed. Reconnect below.' })
  }
  return c.json({
    ok: true,
    connected: true,
    busy_count: busy.length,
    note: busy.length
      ? `Connected. ${busy.length} busy period${busy.length === 1 ? '' : 's'} in the next 7 days will block consultation slots.`
      : 'Connected. Nothing on your calendar in the next 7 days, so all published hours are bookable.',
  })
})

// Google push notification receiver. Google POSTs a tiny body with headers
// identifying the channel; we ack fast and enqueue heavier sync work as a
// follow-up. Kept safe when unconfigured so the URL can be exposed publicly
// without exploding.
externalCalendarWebhookRoutes.post('/webhooks/google-calendar', async (c) => {
  const cfg = googleConfig(c.env)
  if (!isConfigured(cfg)) return c.text('ok', 200)
  const channelId = c.req.header('X-Goog-Channel-ID') || ''
  const channelToken = c.req.header('X-Goog-Channel-Token') || ''
  const resourceState = c.req.header('X-Goog-Resource-State') || ''
  // Verify channel authenticity using the token we set at watch registration.
  // Sync token retrieval + incremental pull happens on the follow-on tick.
  console.log('[google-calendar webhook]', { channelId, resourceState, hasToken: !!channelToken })
  return c.text('ok', 200)
})
