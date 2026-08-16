import type { Context } from 'hono'
import type { AppEnv, Env } from './types'
import { uuid } from './crypto'
import { sha256Hex } from './documentSealing'
import { parseUserAgent } from './userAgentParse'

export interface RequestEvidence {
  ip: string | null
  city: string | null
  region: string | null
  country: string | null
  lat: number | null
  lon: number | null
  ua: string | null
  browser_family: string | null
  os_family: string | null
  device_class: string | null
}

export function requestEvidenceFromContext(c: Context<AppEnv>): RequestEvidence {
  const cf = c.req.raw.cf as Record<string, unknown> | undefined
  const ua = c.req.header('user-agent') || null
  const parsed = parseUserAgent(ua)
  return {
    ip: c.req.header('CF-Connecting-IP') || null,
    city: typeof cf?.city === 'string' ? cf.city : null,
    region: typeof cf?.region === 'string' ? cf.region : null,
    country: typeof cf?.country === 'string' ? cf.country : null,
    lat: cf?.latitude != null ? Number(cf.latitude) : null,
    lon: cf?.longitude != null ? Number(cf.longitude) : null,
    ua,
    ...parsed,
  }
}

export async function appendEnvelopeEvent(
  env: Env,
  input: {
    envelopeId: string
    eventType: string
    actorType: string
    actorId?: string | null
    recipientId?: string | null
    metadata?: Record<string, unknown>
    evidence?: Partial<RequestEvidence>
  },
): Promise<string> {
  const prev = await env.DB.prepare(
    'SELECT event_hash FROM envelope_events WHERE envelope_id = ? ORDER BY occurred_at_utc DESC, id DESC LIMIT 1',
  ).bind(input.envelopeId).first<{ event_hash?: string }>()

  const id = uuid()
  const occurred = new Date().toISOString()
  const requestId = uuid()
  const prevHash = prev?.event_hash || 'GENESIS'
  const metadata = input.metadata || {}
  const evidence = input.evidence || {}

  const canonical = JSON.stringify({
    id,
    envelopeId: input.envelopeId,
    recipientId: input.recipientId || null,
    actorType: input.actorType,
    actorId: input.actorId || null,
    type: input.eventType,
    occurred,
    requestId,
    metadata,
    prevHash,
    ip: evidence.ip || null,
    city: evidence.city || null,
    region: evidence.region || null,
    country: evidence.country || null,
    lat: evidence.lat ?? null,
    lon: evidence.lon ?? null,
    ua: evidence.ua || null,
    browser_family: evidence.browser_family || null,
    os_family: evidence.os_family || null,
    device_class: evidence.device_class || null,
  })
  const hash = await sha256Hex(canonical)

  // Spec §4: each event is additionally signed by the server (HMAC-SHA256
  // with SESSION_SECRET) so the ledger detects silent mutation even if the
  // hash-chain rows were somehow rewritten. The signature covers the chain
  // hash, which itself covers the full canonical payload.
  const sigKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET || 'pmv-dev-secret') as unknown as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigBytes = new Uint8Array(await crypto.subtle.sign('HMAC', sigKey, new TextEncoder().encode(`envelope-event:${hash}`) as unknown as BufferSource))
  let serverSignature = ''
  for (const b of sigBytes) serverSignature += String.fromCharCode(b)
  const serverSignatureB64 = btoa(serverSignature)

  await env.DB.prepare(
    `INSERT INTO envelope_events (
      id, envelope_id, recipient_id, actor_type, actor_id, event_type, occurred_at_utc,
      ip_address, geo_city, geo_region, geo_country, geo_lat_approx, geo_lon_approx,
      user_agent, browser_family, os_family, device_class, request_id, metadata_json,
      prev_event_hash, event_hash, server_signature
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id,
    input.envelopeId,
    input.recipientId || null,
    input.actorType,
    input.actorId || null,
    input.eventType,
    occurred,
    evidence.ip || null,
    evidence.city || null,
    evidence.region || null,
    evidence.country || null,
    evidence.lat ?? null,
    evidence.lon ?? null,
    evidence.ua || null,
    evidence.browser_family || null,
    evidence.os_family || null,
    evidence.device_class || null,
    requestId,
    JSON.stringify(metadata),
    prevHash,
    hash,
    serverSignatureB64,
  ).run()

  return hash
}

export async function appendEnvelopeEventFromContext(
  c: Context<AppEnv>,
  input: Omit<Parameters<typeof appendEnvelopeEvent>[1], 'evidence'>,
): Promise<string> {
  return appendEnvelopeEvent(c.env, { ...input, evidence: requestEvidenceFromContext(c) })
}
