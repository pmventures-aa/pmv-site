import type { Env } from './types'
import { uuid } from './crypto'

export type ExistingAccount = {
  id: string
  role: string
  status: string
  password_hash: string | null
  party_type: string | null
}

export class VendorInviteConflict extends Error {
  constructor(message = 'that email already has a Pinnacle account') {
    super(message)
    this.name = 'VendorInviteConflict'
  }
}

export function vendorInvitePlan(existing: ExistingAccount | null): 'create' | 'reuse' | 'conflict' {
  if (!existing) return 'create'
  const vendorOrUnassigned = existing.party_type === 'vendor' || !existing.party_type
  if (existing.role === 'staff' && existing.status === 'pending' && vendorOrUnassigned) return 'reuse'
  return 'conflict'
}

export function canCompleteStagedVendorSignup(existing: ExistingAccount): boolean {
  return existing.role === 'staff' && existing.status === 'pending' && !existing.password_hash
}

function vendorTitle(vendorCategory: string, companyName: string): string {
  if (companyName && vendorCategory) return `${vendorCategory}: ${companyName}`
  return companyName || vendorCategory || 'Invited provider'
}

export async function stageVendorProfile(
  env: Env,
  input: { email: string; fullName?: string | null; vendorCategory?: string | null; companyName?: string | null },
): Promise<{ userId: string; created: boolean }> {
  const email = input.email.trim().toLowerCase()
  const existing = await env.DB.prepare(
    `SELECT u.id, u.role, u.status, u.password_hash, tm.party_type
     FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id
     WHERE u.email = ?`,
  ).bind(email).first<ExistingAccount>()

  const plan = vendorInvitePlan(existing)
  if (plan === 'conflict') throw new VendorInviteConflict()

  const fullName = input.fullName?.trim() || null
  const vendorCategory = input.vendorCategory?.trim() || null
  const companyName = input.companyName?.trim() || null
  const title = vendorTitle(vendorCategory || '', companyName || '')

  if (plan === 'reuse' && existing) {
    await env.DB.prepare(
      `UPDATE users SET full_name = COALESCE(?, full_name) WHERE id = ?`,
    ).bind(fullName, existing.id).run()
    const member = await env.DB.prepare('SELECT id FROM team_members WHERE user_id = ?').bind(existing.id).first<{ id: string }>()
    if (member) {
      await env.DB.prepare(
        `UPDATE team_members
         SET party_type = 'vendor',
             vendor_category = COALESCE(?, vendor_category),
             title = CASE WHEN title IS NULL OR title = '' THEN ? ELSE title END,
             network_status = CASE WHEN network_status = 'active' THEN 'vetting' ELSE network_status END
         WHERE user_id = ?`,
      ).bind(vendorCategory, title, existing.id).run()
    } else {
      await env.DB.prepare(
        `INSERT INTO team_members (id, user_id, staff_role, title, party_type, vendor_category, network_status)
         VALUES (?, ?, 'support_specialist', ?, 'vendor', ?, 'vetting')`,
      ).bind(uuid(), existing.id, title, vendorCategory).run()
    }
    return { userId: existing.id, created: false }
  }

  const userId = uuid()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, full_name, two_factor_enabled, status)
       VALUES (?, ?, NULL, 'staff', ?, 0, 'pending')`,
    ).bind(userId, email, fullName),
    env.DB.prepare(
      `INSERT INTO team_members (id, user_id, staff_role, title, party_type, vendor_category, network_status)
       VALUES (?, ?, 'support_specialist', ?, 'vendor', ?, 'vetting')`,
    ).bind(uuid(), userId, title, vendorCategory),
  ])
  return { userId, created: true }
}
