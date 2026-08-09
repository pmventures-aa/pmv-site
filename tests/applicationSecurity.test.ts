import { describe, expect, it } from 'vitest'
import { canReadDocument } from '../functions/_lib/documentAccess'
import { resolveApplicationRouting } from '../functions/_lib/applicationRouting'
import { shouldUseNotificationFallback } from '../functions/_lib/email'

describe('service application security and routing', () => {
  it('never allows a client to read an internal document', () => {
    expect(canReadDocument({ role: 'client', userId: 'client-1', clientUserId: 'client-1', visibility: 'internal' })).toBe(false)
    expect(canReadDocument({ role: 'client', userId: 'client-1', clientUserId: 'client-1', visibility: 'client' })).toBe(true)
    expect(canReadDocument({ role: 'client', userId: 'other', clientUserId: 'client-1', visibility: 'client' })).toBe(false)
  })

  it('requires the normal client scope for staff documents', () => {
    expect(canReadDocument({ role: 'staff', userId: 'staff-1', clientUserId: 'client-1', visibility: 'internal', staffCanAccessClient: true })).toBe(true)
    expect(canReadDocument({ role: 'staff', userId: 'staff-1', clientUserId: 'client-1', visibility: 'internal', staffCanAccessClient: false })).toBe(false)
  })

  it('routes one assignment as the implicit primary representative', () => {
    const routing = resolveApplicationRouting([{ staff_user_id: 'rep-1', is_primary: 0, full_name: 'Rep One' }])
    expect(routing.unassigned).toBe(false)
    expect(routing.primary?.staff_user_id).toBe('rep-1')
    expect(routing.staffUserIds).toEqual(['rep-1'])
  })

  it('honors an explicit primary when a client has multiple assignments', () => {
    const routing = resolveApplicationRouting([
      { staff_user_id: 'rep-1', is_primary: 0 },
      { staff_user_id: 'rep-2', is_primary: 1 },
    ])
    expect(routing.primary?.staff_user_id).toBe('rep-2')
    expect(routing.staffUserIds).toEqual(['rep-2'])
  })

  it('routes a multi-assigned client without a primary to the assigned team instead of inventing one', () => {
    const routing = resolveApplicationRouting([
      { staff_user_id: 'rep-1', is_primary: 0 },
      { staff_user_id: 'rep-2', is_primary: 0 },
    ])
    expect(routing.primary).toBeNull()
    expect(routing.staffUserIds).toEqual(['rep-1', 'rep-2'])
    expect(routing.unassigned).toBe(false)
  })

  it('flags no assignments as unassigned and uses the firm fallback', () => {
    const routing = resolveApplicationRouting([])
    expect(routing.unassigned).toBe(true)
    expect(routing.staffUserIds).toEqual([])
    expect(shouldUseNotificationFallback(routing.staffUserIds, [], 'no_staff')).toBe(true)
  })

  it('does not bypass an assigned rep email preference with the firm fallback', () => {
    expect(shouldUseNotificationFallback(['rep-1'], [], 'no_staff')).toBe(false)
    expect(shouldUseNotificationFallback(['rep-1'], [], 'no_recipients')).toBe(true)
  })
})
