import { describe, expect, it } from 'vitest'
import { normalizeTrustedPermissions } from '../functions/_lib/trustedAccess'

describe('Trusted Contact permissions', () => {
  it('keeps edit only on sections with delegated write APIs', () => {
    const permissions = normalizeTrustedPermissions({
      business_profile: 'edit',
      tasks: 'edit',
      documents: 'edit',
      billing: 'edit',
      messages: 'view',
    })

    expect(permissions.business_profile).toBe('edit')
    expect(permissions.tasks).toBe('edit')
    expect(permissions.documents).toBe('view')
    expect(permissions.billing).toBe('view')
    expect(permissions.messages).toBe('view')
  })

  it('defaults missing and invalid grants to none', () => {
    const permissions = normalizeTrustedPermissions({
      services: 'owner',
      support: true,
    })

    expect(permissions.services).toBe('none')
    expect(permissions.support).toBe('none')
    expect(permissions.calendar).toBe('none')
  })
})
