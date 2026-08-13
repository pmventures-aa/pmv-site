import { describe, expect, it } from 'vitest'
import { userEligible } from '../functions/_lib/routes/comms'

const vendor = { email: 'pro@example.com', role: 'staff', status: 'pending', marketing_email_status: 'emailable' }
const activeVendor = { ...vendor, status: 'active' }
const client = { email: 'client@example.com', role: 'client', status: 'active', marketing_email_status: 'emailable' }
const pendingClient = { ...client, status: 'pending' }
const suspended = { ...activeVendor, status: 'suspended' }

describe('comms recipient eligibility', () => {
  it('lets operational and internal mail reach pending vendors', () => {
    expect(userEligible(vendor, 'operational')).toBe(true)
    expect(userEligible(vendor, 'internal')).toBe(true)
    expect(userEligible(activeVendor, 'operational')).toBe(true)
  })

  it('keeps marketing on active, emailable accounts only', () => {
    expect(userEligible(vendor, 'marketing')).toBe(false)
    expect(userEligible(activeVendor, 'marketing')).toBe(true)
    expect(userEligible({ ...activeVendor, marketing_email_status: 'unsubscribed' }, 'marketing')).toBe(false)
  })

  it('does not treat pending clients as operational recipients', () => {
    expect(userEligible(pendingClient, 'operational')).toBe(false)
    expect(userEligible(client, 'operational')).toBe(true)
  })

  it('drops suspended accounts for every message type', () => {
    expect(userEligible(suspended, 'operational')).toBe(false)
    expect(userEligible(suspended, 'internal')).toBe(false)
    expect(userEligible(suspended, 'marketing')).toBe(false)
  })
})
