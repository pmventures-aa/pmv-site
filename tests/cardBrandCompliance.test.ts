import { describe, expect, it } from 'vitest'
import { billingCompliance, isAllowedVaultMethod, isForbiddenCardKey, maskPaymentMethod, rejectCardPayload } from '../shared/cardBrandCompliance'

describe('card brand compliance', () => {
  it('rejects card PAN and CVV keys anywhere in a payload', () => {
    expect(rejectCardPayload({ card_number: '4111111111111111' })).toMatch(/cannot be submitted/i)
    expect(rejectCardPayload({ banking: { cvv: '123' } })).toMatch(/cannot be submitted/i)
    expect(rejectCardPayload({ answers: { note: 'ok' }, banking: { routing_number: '021000021' } })).toBeNull()
  })

  it('treats only ACH as a vault method', () => {
    expect(isAllowedVaultMethod('ach')).toBe(true)
    expect(isAllowedVaultMethod('card')).toBe(false)
    expect(isForbiddenCardKey('primary_account_number')).toBe(true)
  })

  it('masks payment methods to last four only', () => {
    const masked = maskPaymentMethod({
      id: '1',
      method_type: 'ach',
      account_holder_name: 'Ada',
      bank_name: 'Chase',
      account_type: 'checking',
      account_last4: '4321',
    })
    expect(masked.account_last4).toBe('4321')
    expect(JSON.stringify(masked)).not.toMatch(/routing/)
    expect(billingCompliance.noCardStorage).toMatch(/never collected/i)
  })
})
