import { describe, expect, it } from 'vitest'
import { impersonationDenylistForClient } from '../functions/_lib/impersonationGuard'

describe('impersonation denylist', () => {
  it('blocks the real portal password-change path', () => {
    const paths = impersonationDenylistForClient().map((entry) => `${entry.method} ${entry.path}`)
    expect(paths).toContain('POST /api/portal/change-password')
    expect(paths).not.toContain('POST /api/auth/change-password')
    expect(paths).toContain('POST /api/auth/logout')
    expect(paths).toContain('POST /api/admin/impersonate')
  })
})
