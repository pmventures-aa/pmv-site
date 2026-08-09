import type { Env } from './types'
import { uuid } from './crypto'

export interface ActivityOpts {
  actorUserId?: string | null
  clientUserId?: string | null
  recipientUserId?: string | null
  kind: string
  detail?: Record<string, unknown>
}

// Central log for the staff-facing activity feed / notification bell.
// client_user_id is nullable for firm-wide events. recipient_user_id is also
// optional: when set, the admin activity routes only surface that event to the
// intended staff member (plus admins through direct client access elsewhere).
export function activityInsert(env: Env, opts: ActivityOpts): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO activity_events (id, actor_user_id, client_user_id, recipient_user_id, kind, detail)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    uuid(),
    opts.actorUserId ?? null,
    opts.clientUserId ?? null,
    opts.recipientUserId ?? null,
    opts.kind,
    opts.detail ? JSON.stringify(opts.detail) : null,
  )
}

export async function logActivity(env: Env, opts: ActivityOpts): Promise<void> {
  await activityInsert(env, opts).run()
}
