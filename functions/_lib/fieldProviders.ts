import type { Env } from './types'
import { isEligibleProviderAccount } from '../../shared/operations'

export async function resolveEligibleFieldProvider(env: Env, userId: string): Promise<string | null> {
  if (!userId) return null
  const user = await env.DB.prepare(
    'SELECT id, role, status FROM users WHERE id = ?',
  ).bind(userId).first<{ id: string; role: string; status: string }>()
  return user && isEligibleProviderAccount(user.role, user.status) ? user.id : null
}
