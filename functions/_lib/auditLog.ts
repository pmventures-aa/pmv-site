import type { Env } from './types'
import { uuid } from './crypto'

export type AuditAction =
  | 'login'
  | 'logout'
  | 'record_created'
  | 'record_updated'
  | 'record_archived'
  | 'record_restored'
  | 'record_deleted'
  | 'record_permanently_deleted'
  | 'email_sent'
  | 'status_changed'
  | 'permission_changed'
  | 'task_assigned'
  | 'file_uploaded'
  | 'client_converted'
  | 'service_application_assigned'
  | 'service_application_signed'
  | 'service_application_submitted'
  | 'application_pdf_generated'
  | 'internal_document_attached'
  | 'representative_notified'

export interface AuditGeo {
  city?: string | null
  region?: string | null
  country?: string | null
}

export interface AuditOpts {
  actorUserId?: string | null
  actorIp?: string | null
  actorUserAgent?: string | null
  actorGeo?: AuditGeo | null
  action: AuditAction | string
  entityType?: string | null
  entityId?: string | null
  before?: unknown
  after?: unknown
}

function legacyAuditInsert(env: Env, opts: AuditOpts): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO audit_log (id, actor_user_id, actor_ip, actor_user_agent, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(uuid(), opts.actorUserId ?? null, opts.actorIp ?? null, opts.actorUserAgent ?? null, opts.action, opts.entityType ?? null, opts.entityId ?? null, opts.before !== undefined ? JSON.stringify(opts.before) : null, opts.after !== undefined ? JSON.stringify(opts.after) : null)
}

export function auditInsert(env: Env, opts: AuditOpts): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO audit_log (id, actor_user_id, actor_ip, actor_user_agent, actor_city, actor_region, actor_country, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(uuid(), opts.actorUserId ?? null, opts.actorIp ?? null, opts.actorUserAgent ?? null, opts.actorGeo?.city ?? null, opts.actorGeo?.region ?? null, opts.actorGeo?.country ?? null, opts.action, opts.entityType ?? null, opts.entityId ?? null, opts.before !== undefined ? JSON.stringify(opts.before) : null, opts.after !== undefined ? JSON.stringify(opts.after) : null)
}

export async function logAudit(env: Env, opts: AuditOpts): Promise<void> {
  try {
    await auditInsert(env, opts).run()
    return
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const missingGeoColumns = /actor_(city|region|country)|no such column|has no column named/i.test(message)
    if (missingGeoColumns) {
      try { await legacyAuditInsert(env, opts).run(); return }
      catch (legacyError) { console.error('[audit] legacy fallback failed', legacyError); return }
    }
    console.error('[audit] write failed', error)
  }
}

export function actorIp(request: Request): string | null {
  return request.headers.get('CF-Connecting-IP')
}

function cleanMeta(value: unknown, max = 120): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const cleaned = String(value).replace(/[|;\r\n]/g, ' ').trim().slice(0, max)
  return cleaned || null
}

// Store the normal UA first for compatibility, followed by a compact PMV
// fingerprint suffix. This avoids a schema migration while preserving richer
// security context for new audit events. Values come from request headers and
// Cloudflare's IP-derived request.cf metadata; none of this is GPS tracking.
export function actorUserAgent(request: Request): string | null {
  const ua = request.headers.get('User-Agent') || ''
  const cf = (request as unknown as { cf?: Record<string, unknown> }).cf || {}
  const meta: Array<[string, unknown]> = [
    ['ch', request.headers.get('sec-ch-ua')],
    ['platform', request.headers.get('sec-ch-ua-platform')],
    ['mobile', request.headers.get('sec-ch-ua-mobile')],
    ['model', request.headers.get('sec-ch-ua-model')],
    ['language', request.headers.get('accept-language')?.split(',')[0]],
    ['timezone', cf.timezone],
    ['postal', cf.postalCode],
    ['latitude', cf.latitude],
    ['longitude', cf.longitude],
    ['colo', cf.colo],
    ['asn', cf.asn],
    ['network', cf.asOrganization],
  ]
  const encoded = meta.map(([key, value]) => {
    const v = cleanMeta(value)
    return v ? `${key}=${v}` : null
  }).filter(Boolean)
  if (!ua && encoded.length === 0) return null
  return encoded.length ? `${ua || 'Unknown user agent'} | PMV:${encoded.join(';')}` : ua
}

export function actorGeo(request: Request): AuditGeo {
  const cf = (request as unknown as { cf?: Record<string, unknown> }).cf
  if (!cf) return { city: null, region: null, country: null }
  const pick = (key: string): string | null => {
    const value = cf[key]
    return typeof value === 'string' && value.length > 0 ? value : null
  }
  return { city: pick('city'), region: pick('region'), country: pick('country') }
}
