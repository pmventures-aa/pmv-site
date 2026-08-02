import type { Env, SessionUser } from './types'
import { visibleClientIds, canAccessClient } from './access'
export { canAccessClient }

export class ScopeError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// Determines which client_user_id a write should apply to.
// - client role: always themselves (any bodyClientId is ignored)
// - staff/admin: must supply a client_user_id they can access
export async function resolveClientId(env: Env, user: SessionUser, bodyClientId?: string | null): Promise<string> {
  if (user.role === 'client') return user.id
  if (!bodyClientId) throw new ScopeError('client_user_id is required', 400)
  const ok = await canAccessClient(env, user, bodyClientId)
  if (!ok) throw new ScopeError('forbidden: no access to this client', 403)
  return bodyClientId
}

// Loads a row from `table` by id and verifies the current user may access
// the row's client_user_id. Returns the row or throws ScopeError.
export async function loadScopedRow<T extends { client_user_id: string }>(
  env: Env,
  user: SessionUser,
  table: string,
  id: string,
): Promise<T> {
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<T>()
  if (!row) throw new ScopeError('not found', 404)
  const ok = await canAccessClient(env, user, row.client_user_id)
  if (!ok) throw new ScopeError('forbidden', 403)
  return row
}

// Returns a SQL WHERE fragment + bind params scoping a query to what `user` may see.
// `null` restriction (admin) means "no filter".
export async function scopeFilter(
  env: Env,
  user: SessionUser,
  column = 'client_user_id',
): Promise<{ where: string; params: string[] }> {
  const ids = await visibleClientIds(env, user)
  if (ids === null) return { where: '1=1', params: [] }
  if (ids.length === 0) return { where: '1=0', params: [] }
  return { where: `${column} IN (${ids.map(() => '?').join(',')})`, params: ids }
}
