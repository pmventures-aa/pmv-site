import type { Env, SessionUser } from './types'

export const TRUSTED_SECTIONS = [
  'business_profile',
  'services',
  'documents',
  'billing',
  'tasks',
  'calendar',
  'messages',
  'support',
] as const
export type TrustedSection = (typeof TRUSTED_SECTIONS)[number]
export type TrustedMode = 'none' | 'view' | 'edit'
export type TrustedPermissions = Record<TrustedSection, TrustedMode>

// Only sections with a deliberately scoped delegated-write API may receive an
// edit grant. Everything else is view-only until its write workflow is built.
export const TRUSTED_EDITABLE_SECTIONS = ['business_profile', 'tasks'] as const satisfies readonly TrustedSection[]
const EDITABLE = new Set<TrustedSection>(TRUSTED_EDITABLE_SECTIONS)

export const TRUSTED_SECTION_LABELS: Record<TrustedSection, string> = {
  business_profile: 'Business Profile',
  services: 'Services & Applications',
  documents: 'Documents',
  billing: 'Billing',
  tasks: 'Tasks',
  calendar: 'Calendar',
  messages: 'Messages',
  support: 'Support',
}

export function normalizeTrustedPermissions(value: unknown): TrustedPermissions {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const out = {} as TrustedPermissions
  for (const key of TRUSTED_SECTIONS) {
    const mode = source[key]
    if (mode === 'edit') out[key] = EDITABLE.has(key) ? 'edit' : 'view'
    else out[key] = mode === 'view' ? 'view' : 'none'
  }
  return out
}

export interface TrustedContext {
  relationship_id: string
  client_user_id: string
  client_name: string
  client_business_name: string | null
  relationship_label: string | null
  permissions: TrustedPermissions
}

export async function trustedContexts(env: Env, user: SessionUser): Promise<TrustedContext[]> {
  if (user.role !== 'trusted_contact') return []
  const rows = await env.DB.prepare(
    `SELECT tc.id relationship_id, tc.client_user_id, tc.relationship_label, tc.permissions_json,
            u.full_name client_name, cp.business_name client_business_name
     FROM trusted_contacts tc
     JOIN users u ON u.id = tc.client_user_id
     LEFT JOIN client_profiles cp ON cp.user_id = tc.client_user_id
     WHERE tc.contact_user_id = ? AND tc.status = 'active'
     ORDER BY COALESCE(cp.business_name, u.full_name, u.email)`,
  ).bind(user.id).all<any>()
  return (rows.results ?? []).map((row) => ({
    relationship_id: row.relationship_id,
    client_user_id: row.client_user_id,
    client_name: row.client_name || 'Pinnacle client',
    client_business_name: row.client_business_name || null,
    relationship_label: row.relationship_label || null,
    permissions: normalizeTrustedPermissions((() => { try { return JSON.parse(row.permissions_json || '{}') } catch { return {} } })()),
  }))
}

export async function trustedAccess(
  env: Env,
  user: SessionUser,
  clientUserId: string,
  section: TrustedSection,
  required: 'view' | 'edit' = 'view',
): Promise<TrustedContext | null> {
  const contexts = await trustedContexts(env, user)
  const context = contexts.find((item) => item.client_user_id === clientUserId)
  if (!context) return null
  const mode = context.permissions[section]
  if (mode === 'none') return null
  if (required === 'edit' && mode !== 'edit') return null
  return context
}
