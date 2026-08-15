import type { Env, SessionUser } from './types'
import { canAccessClient } from './access'

export type ClientReference = {
  id: string
  public_ref: string
}

export async function resolveClientReference(env: Env, ref: string | null | undefined): Promise<ClientReference | null> {
  const value = String(ref || '').trim()
  if (!value) return null
  return await env.DB.prepare(
    `SELECT id, public_ref
     FROM users
     WHERE role = 'client' AND (public_ref = ? OR id = ?)
     LIMIT 1`,
  ).bind(value, value).first<ClientReference>()
}

export async function loadStaffClientReference(
  env: Env,
  user: SessionUser,
  ref: string | null | undefined,
): Promise<ClientReference | null> {
  const client = await resolveClientReference(env, ref)
  if (!client) return null
  if (!(await canAccessClient(env, user, client.id))) return null
  return client
}
