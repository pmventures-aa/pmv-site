import type { Env } from './types'
import { uuid } from './crypto'

// Compliance-grade audit trail — separate from activity.ts's activityInsert,
// which feeds the staff notification bell/feed. This table is append-only.
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
  ).bind(
    uuid(),
    opts.actorUserId ?? null,
    opts.actorIp ?? null,
    opts.actorUserAgent ?? null,
    opts.action,
    opts.entityType ?? null,
    opts.entityId ?? null,
    opts.before !== undefined ? JSON.stringify(opts.before) : null,
    opts.after !== undefined ? JSON.stringify(opts.after) : null,
  )
}

export function auditInsert(env: Env, opts: AuditOpts): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO audit_log (id, actor_user_id, actor_ip, actor_user_agent, actor_city, actor_region, actor_country, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    uuid(),
    opts.actorUserId ?? null,
    opts.actorIp ?? null,
    opts.actorUserAgent ?? null,
    opts.actorGeo?.city ?? null,
    opts.actorGeo?.region ?? null,
    opts.actorGeo?.country ?? null,
    opts.action,
    opts.entityType ?? null,
    opts.entityId ?? null,
    opts.before !== undefined ? JSON.stringify(opts.before) : null,
    opts.after !== undefined ? JSON.stringify(opts.after) : null,
  )
}

export async function logAudit(env: Env, opts: AuditOpts): Promise<void> {
  try {
    await auditInsert(env, opts).run()
  } catch (error) {
    // Production deploys can briefly lead D1 migrations. Preserve authentication
    // and other critical user flows by falling back to the pre-0039 audit schema
    // when the new geo columns are not available yet.
    const message = error instanceof Error ? error.message : String(error)
    const missingGeoColumns = /actor_(city|region|country)|no such column|has no column named/i.test(message)
    if (!missingGeoColumns) throw error
    await legacyAuditInsert(env, opts).run()
  }
}

export function actorIp(request: Request): string | null {
  return request.headers.get('CF-Connecting-IP')
}

export function actorUserAgent(request: Request): string | null {
  return request.headers.get('User-Agent')
}

// Cloudflare's Workers/Pages runtime attaches request.cf with coarse geo
// metadata (city, region, country) resolved from the connecting IP. Pull the
// fields we display in the audit log; each falls back to null in local dev
// where request.cf is undefined.
export function actorGeo(request: Request): AuditGeo {
  const cf = (request as unknown as { cf?: Record<string, unknown> }).cf
  if (!cf) return { city: null, region: null, country: null }
  const pick = (key: string): string | null => {
    const value = cf[key]
    return typeof value === 'string' && value.length > 0 ? value : null
  }
  return { city: pick('city'), region: pick('region'), country: pick('country') }
}
