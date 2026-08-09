import type { Env } from './types'
import { uuid } from './crypto'

export interface ActivityOpts {
  actorUserId?: string | null
  clientUserId?: string | null
  // Accepted as a routing hint for call sites, but intentionally not persisted.
  // Staff activity visibility remains based on the existing client assignment scope.
  recipientUserId?: string | null
  kind: string
  detail?: Record<string, unknown>
}

// Central log for the staff-facing activity feed / notification bell.
// client_user_id is nullable — events with no client are still shown firm-wide.
export function activityInsert(env: Env, opts: ActivityOpts): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO activity_events (id, actor_user_id, client_user_id, kind, detail) VALUES (?, ?, ?, ?, ?)`,
  ).bind(uuid(), opts.actorUserId ?? null, opts.clientUserId ?? null, opts.kind, opts.detail ? JSON.stringify(opts.detail) : null)
}

export async function logActivity(env: Env, opts: ActivityOpts): Promise<void> {
  await activityInsert(env, opts).run()
}
