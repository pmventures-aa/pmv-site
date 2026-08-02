import type { Env, SessionUser } from './types'

// Returns the list of client_user_ids the given user may read.
// - client: only themselves
// - staff:  clients they are assigned to
// - admin:  all (returns null = "no restriction")
export async function visibleClientIds(env: Env, user: SessionUser): Promise<string[] | null> {
  if (user.role === 'admin') return null
  if (user.role === 'client') return [user.id]
  const rows = await env.DB.prepare(
    'SELECT client_user_id FROM staff_assignments WHERE staff_user_id = ?',
  ).bind(user.id).all<{ client_user_id: string }>()
  return (rows.results ?? []).map((r) => r.client_user_id)
}

// True if `user` may access data belonging to `clientUserId`.
export async function canAccessClient(env: Env, user: SessionUser, clientUserId: string): Promise<boolean> {
  const ids = await visibleClientIds(env, user)
  if (ids === null) return true
  return ids.includes(clientUserId)
}
