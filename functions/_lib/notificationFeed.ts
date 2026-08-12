import type { Env } from './types'
import { uuid } from './crypto'

// Insert a row into notification_feed. Fires-and-forgets from a caller:
// wraps its own errors so a feed write can never break a business action.
// De-dupes by (user_id, kind, subject_id) inside a short window so a
// rapid-fire trigger (e.g. burst of @mentions) doesn't spam.
export interface FeedNotification {
  userId: string
  kind: string
  subjectType?: string | null
  subjectId?: string | null
  title: string
  body?: string | null
  deepLinkPath?: string | null
  actorUserId?: string | null
  dedupeWindowSeconds?: number
}

export async function pushNotification(env: Env, n: FeedNotification): Promise<void> {
  try {
    if (n.dedupeWindowSeconds && n.subjectId) {
      const recent = await env.DB.prepare(
        `SELECT 1 FROM notification_feed WHERE user_id = ? AND kind = ? AND subject_id = ?
         AND created_at > datetime('now', '-' || ? || ' seconds') LIMIT 1`
      ).bind(n.userId, n.kind, n.subjectId, Math.max(1, Math.floor(n.dedupeWindowSeconds))).first()
      if (recent) return
    }
    await env.DB.prepare(
      `INSERT INTO notification_feed (id, user_id, kind, subject_type, subject_id, title, body, deep_link_path, actor_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(uuid(), n.userId, n.kind, n.subjectType ?? null, n.subjectId ?? null, n.title, n.body ?? null, n.deepLinkPath ?? null, n.actorUserId ?? null).run()
  } catch (err) {
    console.error('[notif-feed] insert failed', err)
  }
}

export async function pushMany(env: Env, notifications: FeedNotification[]): Promise<void> {
  for (const n of notifications) await pushNotification(env, n)
}
