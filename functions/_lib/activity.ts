import type { Env } from './types'
import { uuid } from './crypto'

// Central log for the staff-facing activity feed / notification bell.
// client_user_id is nullable — events with no client (new inquiry, new
// staff/admin user) are still shown to all staff (see admin/activity route).
export function activityInsert(
  env: Env,
  opts: { actorUserId?: string | null; clientUserId?: string | null; kind: string; detail?: Record<string, unknown> },
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO activity_events (id, actor_user_id, client_user_id, kind, detail) VALUES (?, ?, ?, ?, ?)`,
  ).bind(uuid(), opts.actorUserId ?? null, opts.clientUserId ?? null, opts.kind, opts.detail ? JSON.stringify(opts.detail) : null)
}

export async function logActivity(
  env: Env,
  opts: { actorUserId?: string | null; clientUserId?: string | null; kind: string; detail?: Record<string, unknown> },
): Promise<void> {
  await activityInsert(env, opts).run()
}
