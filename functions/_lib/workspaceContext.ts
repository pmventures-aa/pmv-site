import type { Env, SessionUser } from './types'
import { resolveVendorWorld, resolveWorld, type WorkspaceContext } from '../../shared/workspace'

export async function loadWorkspaceContext(env: Env, user: SessionUser): Promise<WorkspaceContext> {
  if (user.role === 'client') {
    const rows = await env.DB.prepare(
      `SELECT service_key FROM client_services
       WHERE client_user_id = ? AND status IN ('requested','submitted','active')`,
    ).bind(user.id).all<{ service_key: string }>()
    const service_keys = (rows.results || []).map((row) => row.service_key)
    return {
      service_keys,
      party_type: null,
      vendor_category: null,
      role_name: null,
      world: resolveWorld(service_keys),
    }
  }

  if (user.role === 'staff' || user.role === 'admin') {
    const member = await env.DB.prepare(
      `SELECT tm.party_type, tm.vendor_category, tm.title, rd.name AS role_name
       FROM team_members tm
       LEFT JOIN role_definitions rd ON rd.id = tm.role_definition_id
       WHERE tm.user_id = ?`,
    ).bind(user.id).first<{ party_type: string | null; vendor_category: string | null; title: string | null; role_name: string | null }>()
    const party_type = member?.party_type === 'vendor' ? 'vendor' : member ? 'employee' : user.role === 'admin' ? 'employee' : 'employee'
    const vendor_category = member?.vendor_category || null
    const role_name = member?.role_name || member?.title || null
    const world = party_type === 'vendor' ? resolveVendorWorld([], vendor_category) : 'general'
    return { service_keys: [], party_type, vendor_category, role_name, world }
  }

  return { service_keys: [], party_type: null, vendor_category: null, role_name: null, world: 'general' }
}
