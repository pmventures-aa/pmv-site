import type { Env } from './types'
import { uuid } from './crypto'

// Compliance-grade audit trail — separate from activity.ts's activityInsert,
// which feeds the staff notification bell/feed (has per-user mute prefs,
// expected to be summarized for display). This table is append-only: no
// route should ever UPDATE or DELETE a row here. Call sites that already
// log an activity_event for a given action add a parallel auditInsert in
// the same D1 batch, so the two can never drift apart.
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

// Pulls the caller's IP the same way login-throttling already does
// (CF-Connecting-IP is set by Cloudflare's edge and isn't spoofable by the
// client) — kept here so every route logging an audit entry gets it the
// same way instead of re-deriving it inconsistently.
export function actorIp(request: Request): string | null {
  return request.headers.get('CF-Connecting-IP')
}

export function actorUserAgent(request: Request): string | null {
  return request.headers.get('User-Agent')
}
