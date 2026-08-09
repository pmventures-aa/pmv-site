import type { Env } from './types'
import { uuid } from './crypto'

export interface ActivityOpts {
  actorUserId?: string | null
  clientUserId?: string | null
  inquiryId?: string | null
  // Accepted as a routing hint for call sites, but intentionally not persisted.
  // Staff activity visibility remains based on the existing client assignment scope.
  recipientUserId?: string | null
  kind: string
  detail?: Record<string, unknown>
}

// Central log for the staff-facing activity feed / notification bell.
// client_user_id and inquiry_id are nullable so the same event can follow a
// pre-client CRM record through conversion without duplicating history.
export function activityInsert(env: Env, opts: ActivityOpts): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO activity_events (id, actor_user_id, client_user_id, inquiry_id, kind, detail) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    uuid(),
    opts.actorUserId ?? null,
    opts.clientUserId ?? null,
    opts.inquiryId ?? null,
    opts.kind,
    opts.detail ? JSON.stringify(opts.detail) : null,
  )
}

export async function logActivity(env: Env, opts: ActivityOpts): Promise<void> {
  await activityInsert(env, opts).run()
}
