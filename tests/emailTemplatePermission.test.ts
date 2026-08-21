import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NAMED_PERMISSIONS, resolveNamedPermission } from '../functions/_lib/capabilities'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const caps = read('../functions/_lib/capabilities.ts')
const route = read('../functions/_lib/routes/hqEmailTemplates.ts')

// Editing this copy changes what lands in clients' inboxes. The baseline is
// owner-only; every other holder is there because someone granted it.

describe('manage_email_templates is a real, grantable permission', () => {
  it('is registered, so it appears in the roles and permissions UI', () => {
    expect(NAMED_PERMISSIONS).toContain('manage_email_templates')
  })

  it('has no legacy team_members column to inherit from', () => {
    // A legacy column would hand it to anyone who already had that column set.
    expect(caps).not.toMatch(/manage_email_templates:\s*'can_/)
  })
})

describe('the write gate', () => {
  it('is owner plus an explicit grant, not the admin role', () => {
    expect(route).toContain('isOwnerAccount(env, user as any)')
    expect(route).toContain("hasGrantedPermission(env, user as any, 'manage_email_templates')")
  })

  it('no longer rides on the broad settings or communications permissions', () => {
    // Those are held by people who should not necessarily rewrite client email.
    expect(route).not.toContain("'can_manage_settings'")
    expect(route).not.toContain("'can_manage_communications'")
  })

  it('still guards every write route', () => {
    // create, patch, restore, duplicate, delete, test-send.
    expect(route.match(/await canManage\(/g)?.length).toBe(6)
  })

  it('leaves reading open to staff, so people can look without editing', () => {
    const listRoute = route.slice(route.indexOf("get('/email-templates'"), route.indexOf("post('/email-templates'"))
    expect(listRoute).not.toContain('canManage')
  })
})

describe('explicit-grant resolution', () => {
  it('skips the admin shortcut that hasNamedPermission applies', () => {
    // hasNamedPermission returns true for any admin, which would defeat an
    // owner-only baseline entirely.
    expect(caps).toContain('export async function hasGrantedPermission')
    const fn = caps.slice(caps.indexOf('export async function hasGrantedPermission'))
    expect(fn.slice(0, 400)).not.toContain("user.role === 'admin') return true")
  })

  it('lets an explicit deny beat a role grant', () => {
    expect(caps).toContain('if (row?.override_grant === 0 || row?.override_grant === 1) return row.override_grant === 1')
  })

  it('treats owner as admin role plus the is_owner flag', () => {
    expect(caps).toContain('SELECT is_owner FROM team_members WHERE user_id = ?')
  })

  it('does not change how other permissions resolve', () => {
    // The shared resolver is untouched: admins still hold everything else.
    expect(resolveNamedPermission({ accountRole: 'admin', override: null, directGrant: 0, roleGrant: 0 })).toBe(true)
    expect(resolveNamedPermission({ accountRole: 'staff', override: null, directGrant: 0, roleGrant: 1 })).toBe(true)
    expect(resolveNamedPermission({ accountRole: 'staff', override: 0, directGrant: 1, roleGrant: 1 })).toBe(false)
    expect(resolveNamedPermission({ accountRole: 'client', override: null, directGrant: 1, roleGrant: 1 })).toBe(false)
  })
})
