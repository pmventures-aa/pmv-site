import { describe, expect, it } from 'vitest'
import { resolveNamedPermission } from '../functions/_lib/capabilities'
import { slugRoleKey } from '../src/pages/admin/settings/RoleTemplatesPanel'

describe('named permission resolution', () => {
  it('gives admins every grant regardless of role or override', () => {
    expect(resolveNamedPermission({ accountRole: 'admin', override: 0, directGrant: 0, roleGrant: 0 })).toBe(true)
  })

  it('denies non-staff accounts', () => {
    expect(resolveNamedPermission({ accountRole: 'client', override: 1, directGrant: 1, roleGrant: 1 })).toBe(false)
  })

  it('lets a per-user override win over the role template', () => {
    expect(resolveNamedPermission({ accountRole: 'staff', override: 1, directGrant: 0, roleGrant: 0 })).toBe(true)
    expect(resolveNamedPermission({ accountRole: 'staff', override: 0, directGrant: 1, roleGrant: 1 })).toBe(false)
  })

  it('inherits role and legacy grants when no override is set', () => {
    expect(resolveNamedPermission({ accountRole: 'staff', override: null, directGrant: 0, roleGrant: 1 })).toBe(true)
    expect(resolveNamedPermission({ accountRole: 'staff', override: null, directGrant: 1, roleGrant: 0 })).toBe(true)
    expect(resolveNamedPermission({ accountRole: 'staff', override: null, directGrant: 0, roleGrant: 0 })).toBe(false)
  })
})

describe('coding role keys', () => {
  it('normalizes display names into stable keys', () => {
    expect(slugRoleKey('Support Admin')).toBe('support_admin')
    expect(slugRoleKey('  Billing Specialist!! ')).toBe('billing_specialist')
  })
})
