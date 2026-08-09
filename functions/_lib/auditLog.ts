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

export interface AuditOpts {
  actorUserId?: string | null
  actorIp?: string | null
  actorUserAgent?: string | null
  action: AuditAction
  entityType?: string | null
  entityId?: string | null
  before?: unknown
  after?: unknown
}

export function auditInsert(env: Env, opts: AuditOpts): D1PreparedStatement {
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

export async function logAudit(env: Env, opts: AuditOpts): Promise<void> {
  await auditInsert(env, opts).run()
}

export function actorIp(request: Request): string | null {
  return request.headers.get('CF-Connecting-IP')
}

export function actorUserAgent(request: Request): string | null {
  return request.headers.get('User-Agent')
}
