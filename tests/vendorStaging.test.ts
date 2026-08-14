import { describe, expect, it } from 'vitest'
import { canCompleteStagedVendorSignup, dispatchProviderPlan, vendorInvitePlan } from '../functions/_lib/vendorStaging'

const staged = { id: 'u1', role: 'staff', status: 'pending', password_hash: null, party_type: 'vendor' as string | null }
const applied = { ...staged, password_hash: 'hash' }
const active = { ...staged, status: 'active', password_hash: 'hash' }
const client = { id: 'u2', role: 'client', status: 'active', password_hash: 'hash', party_type: null }
const pendingEmployee = { id: 'u3', role: 'staff', status: 'pending', password_hash: null, party_type: 'employee' as string | null }

describe('vendor invite staging', () => {
  it('creates a profile when the email is new', () => {
    expect(vendorInvitePlan(null)).toBe('create')
  })

  it('reuses a pending vendor instead of colliding', () => {
    expect(vendorInvitePlan(staged)).toBe('reuse')
    expect(vendorInvitePlan(applied)).toBe('reuse')
    expect(vendorInvitePlan({ ...staged, party_type: null })).toBe('reuse')
  })

  it('rejects active vendors, clients, and pending employees', () => {
    expect(vendorInvitePlan(active)).toBe('conflict')
    expect(vendorInvitePlan(client)).toBe('conflict')
    expect(vendorInvitePlan(pendingEmployee)).toBe('conflict')
  })

  it('lets a staged vendor with no password finish signup', () => {
    expect(canCompleteStagedVendorSignup(staged)).toBe(true)
    expect(canCompleteStagedVendorSignup(applied)).toBe(false)
    expect(canCompleteStagedVendorSignup(active)).toBe(false)
  })
})

describe('dispatch provider provisioning', () => {
  it('creates, reuses, activates, or rejects provider emails', () => {
    expect(dispatchProviderPlan(null)).toBe('create')
    expect(dispatchProviderPlan(active)).toBe('reuse')
    expect(dispatchProviderPlan(staged)).toBe('activate')
    expect(dispatchProviderPlan(client)).toBe('conflict')
    expect(dispatchProviderPlan(pendingEmployee)).toBe('conflict')
  })
})
