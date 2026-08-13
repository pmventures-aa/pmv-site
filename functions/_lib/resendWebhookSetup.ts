import type { Env } from './types'

export const DEFAULT_PUBLIC_SITE_BASE = 'https://www.pinnaclemanagementventures.com'
export const RESEND_WEBHOOK_PATH = '/api/webhooks/resend'
export const RESEND_WEBHOOK_SECRET_SETTING = 'resend_webhook_signing_secret'
export const RESEND_WEBHOOK_ID_SETTING = 'resend_webhook_id'

export const RESEND_WEBHOOK_EVENTS = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.failed',
  'email.complained',
  'email.suppressed',
  'email.received',
] as const

export type ResendWebhookEvent = (typeof RESEND_WEBHOOK_EVENTS)[number]

export type ResendWebhookRecord = {
  id: string
  endpoint?: string | null
  events?: string[] | null
  status?: string | null
  created_at?: string | null
  signing_secret?: string | null
}

export type ResendWebhookAction = 'created' | 'updated' | 'recreated' | 'unchanged'

export type ResendWebhookStatus = {
  api_key_configured: boolean
  inbound_domain: string
  endpoint: string
  webhook: {
    id: string
    endpoint: string
    status: string
    events: string[]
    missing_events: string[]
  } | null
  listed_count: number
  env_signing_secret_configured: boolean
  stored_signing_secret_configured: boolean
  signing_secret_configured: boolean
  ready: boolean
  needs_create: boolean
  needs_update: boolean
  needs_secret: boolean
}

export function webhookEndpointUrl(publicBaseUrl?: string | null): string {
  const base = (publicBaseUrl?.trim() || DEFAULT_PUBLIC_SITE_BASE).replace(/\/$/, '')
  return `${base}${RESEND_WEBHOOK_PATH}`
}

export function normalizeWebhookEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint.trim())
    url.hash = ''
    url.search = ''
    url.hostname = url.hostname.toLowerCase()
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = ''
    }
    const path = url.pathname.replace(/\/+$/, '') || '/'
    return `${url.protocol}//${url.host}${path}`
  } catch {
    return endpoint.trim().replace(/\/+$/, '')
  }
}

export function isPmvResendWebhookEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint.trim())
    const path = url.pathname.replace(/\/+$/, '')
    if (path !== RESEND_WEBHOOK_PATH) return false
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    return host === 'pinnaclemanagementventures.com' || host.endsWith('.pinnaclemanagementventures.com')
  } catch {
    return false
  }
}

export function findMatchingWebhook(
  webhooks: ResendWebhookRecord[],
  canonicalEndpoint: string,
): ResendWebhookRecord | null {
  const wanted = normalizeWebhookEndpoint(canonicalEndpoint)
  const exact = webhooks.find((row) => normalizeWebhookEndpoint(row.endpoint || '') === wanted)
  if (exact) return exact
  return webhooks.find((row) => isPmvResendWebhookEndpoint(row.endpoint || '')) || null
}

export function missingWebhookEvents(events: string[] | null | undefined): string[] {
  const have = new Set((events || []).map((event) => event.trim()).filter(Boolean))
  return RESEND_WEBHOOK_EVENTS.filter((event) => !have.has(event))
}

export function mergeWebhookEvents(events: string[] | null | undefined): string[] {
  const merged = new Set((events || []).map((event) => event.trim()).filter(Boolean))
  for (const event of RESEND_WEBHOOK_EVENTS) merged.add(event)
  return [...merged]
}

export async function publicWebhookEndpoint(env: Env): Promise<string> {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'marketing_public_base_url'")
    .first<{ value: string | null }>()
  return webhookEndpointUrl(row?.value)
}

export async function listResendWebhookSecrets(env: Env): Promise<string[]> {
  const out: string[] = []
  const envSecret = env.RESEND_WEBHOOK_SECRET?.trim()
  if (envSecret) out.push(envSecret)
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?')
    .bind(RESEND_WEBHOOK_SECRET_SETTING)
    .first<{ value: string | null }>()
  const stored = row?.value?.trim()
  if (stored && !out.includes(stored)) out.push(stored)
  return out
}

export function describeResendWebhookState(input: {
  apiKeyConfigured: boolean
  inboundDomain: string
  endpoint: string
  webhooks: ResendWebhookRecord[]
  envSecretConfigured: boolean
  storedSecretConfigured: boolean
}): ResendWebhookStatus {
  const match = findMatchingWebhook(input.webhooks, input.endpoint)
  const events = match?.events || []
  const missing = match ? missingWebhookEvents(events) : [...RESEND_WEBHOOK_EVENTS]
  const signingSecretConfigured = input.envSecretConfigured || input.storedSecretConfigured
  const webhook = match
    ? {
        id: match.id,
        endpoint: match.endpoint || input.endpoint,
        status: match.status || 'unknown',
        events,
        missing_events: missing,
      }
    : null
  const needsCreate = !webhook
  const needsUpdate = !!webhook && (missing.length > 0 || webhook.status === 'disabled')
  const needsSecret = !signingSecretConfigured
  return {
    api_key_configured: input.apiKeyConfigured,
    inbound_domain: input.inboundDomain,
    endpoint: input.endpoint,
    webhook,
    listed_count: input.webhooks.length,
    env_signing_secret_configured: input.envSecretConfigured,
    stored_signing_secret_configured: input.storedSecretConfigured,
    signing_secret_configured: signingSecretConfigured,
    ready: !!webhook && !needsUpdate && signingSecretConfigured && input.apiKeyConfigured,
    needs_create: needsCreate,
    needs_update: needsUpdate,
    needs_secret: needsSecret,
  }
}

export async function readResendWebhookStatus(env: Env): Promise<ResendWebhookStatus> {
  const endpoint = await publicWebhookEndpoint(env)
  const webhooks = env.RESEND_API_KEY ? await listResendWebhooks(env) : []
  return describeResendWebhookState({
    apiKeyConfigured: Boolean(env.RESEND_API_KEY),
    inboundDomain: env.RESEND_INBOUND_DOMAIN?.trim() || 'ziloifaluk.resend.app',
    endpoint,
    webhooks,
    envSecretConfigured: Boolean(env.RESEND_WEBHOOK_SECRET?.trim()),
    storedSecretConfigured: await hasStoredWebhookSecret(env),
  })
}

async function hasStoredWebhookSecret(env: Env): Promise<boolean> {
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?')
    .bind(RESEND_WEBHOOK_SECRET_SETTING)
    .first<{ value: string | null }>()
  return Boolean(row?.value?.trim())
}

export async function ensureResendWebhook(env: Env): Promise<{ action: ResendWebhookAction; status: ResendWebhookStatus }> {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured. Add it in Cloudflare Pages secrets first.')
  }

  const endpoint = await publicWebhookEndpoint(env)
  const listed = await listResendWebhooks(env)
  const match = findMatchingWebhook(listed, endpoint)
  const secrets = await listResendWebhookSecrets(env)
  let action: ResendWebhookAction = 'unchanged'

  if (!match) {
    const created = await createResendWebhook(env, endpoint)
    await storeWebhookCredentials(env, created.id, created.signing_secret)
    action = 'created'
  } else {
    const missing = missingWebhookEvents(match.events)
    const disabled = match.status === 'disabled'
    const endpointDrift = normalizeWebhookEndpoint(match.endpoint || '') !== normalizeWebhookEndpoint(endpoint)
    if (missing.length || disabled || endpointDrift) {
      await updateResendWebhook(env, match.id, {
        endpoint,
        events: mergeWebhookEvents(match.events),
        status: 'enabled',
      })
      action = 'updated'
    }

    if (!secrets.length) {
      const detail = await getResendWebhook(env, match.id)
      if (detail.signing_secret) {
        await storeWebhookCredentials(env, match.id, detail.signing_secret)
      } else {
        await deleteResendWebhook(env, match.id)
        const created = await createResendWebhook(env, endpoint)
        await storeWebhookCredentials(env, created.id, created.signing_secret)
        action = 'recreated'
      }
    } else {
      await upsertSetting(env, RESEND_WEBHOOK_ID_SETTING, match.id)
    }
  }

  const status = await readResendWebhookStatus(env)
  return { action, status }
}

async function upsertSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).bind(key, value).run()
}

async function storeWebhookCredentials(env: Env, id: string, signingSecret?: string | null): Promise<void> {
  await upsertSetting(env, RESEND_WEBHOOK_ID_SETTING, id)
  if (signingSecret?.trim()) {
    await upsertSetting(env, RESEND_WEBHOOK_SECRET_SETTING, signingSecret.trim())
  }
}

async function resendJson(env: Env, path: string, init?: RequestInit): Promise<any> {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured')
  const res = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => null) as { message?: string; error?: string; [key: string]: unknown } | null
  if (!res.ok) {
    const message = typeof data?.message === 'string'
      ? data.message
      : typeof data?.error === 'string'
        ? data.error
        : `Resend webhook API failed (${res.status})`
    throw new Error(message)
  }
  return data
}

export async function listResendWebhooks(env: Env): Promise<ResendWebhookRecord[]> {
  const all: ResendWebhookRecord[] = []
  let after: string | undefined
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ limit: '100' })
    if (after) query.set('after', after)
    const data = await resendJson(env, `/webhooks?${query.toString()}`)
    const rows = Array.isArray(data?.data) ? data.data as ResendWebhookRecord[] : []
    all.push(...rows)
    if (!data?.has_more || rows.length === 0) break
    after = rows[rows.length - 1]?.id
    if (!after) break
  }
  return all
}

async function createResendWebhook(env: Env, endpoint: string): Promise<ResendWebhookRecord> {
  const data = await resendJson(env, '/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      endpoint,
      events: [...RESEND_WEBHOOK_EVENTS],
    }),
  })
  if (!data?.id) throw new Error('Resend created a webhook without returning an id.')
  return {
    id: data.id,
    endpoint,
    events: [...RESEND_WEBHOOK_EVENTS],
    status: 'enabled',
    signing_secret: typeof data.signing_secret === 'string' ? data.signing_secret : null,
  }
}

async function getResendWebhook(env: Env, id: string): Promise<ResendWebhookRecord> {
  const data = await resendJson(env, `/webhooks/${encodeURIComponent(id)}`)
  return {
    id: data.id,
    endpoint: data.endpoint,
    events: data.events,
    status: data.status,
    created_at: data.created_at,
    signing_secret: typeof data.signing_secret === 'string' ? data.signing_secret : null,
  }
}

async function updateResendWebhook(env: Env, id: string, body: { endpoint?: string; events?: string[]; status?: 'enabled' | 'disabled' }): Promise<void> {
  await resendJson(env, `/webhooks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

async function deleteResendWebhook(env: Env, id: string): Promise<void> {
  await resendJson(env, `/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
