/** Card brand / PCI rules this app enforces.
 *
 * Visa, Mastercard, Amex, and Discover require that PAN, expiration, and
 * CVV/CVC never sit on a merchant server that is not a PCI Level 1 vault.
 * Pinnacle invoices record amounts. Card charges, if any, happen at the
 * listed processor (Payment Cloud / Authorize.net). This portal only keeps
 * ACH last-four for bank accounts collected during an application.
 */

export const CARD_DATA_KEYS = [
  'card_number', 'cardnumber', 'card_pan', 'pan', 'primary_account_number',
  'cvv', 'cvc', 'cid', 'cvv2', 'cvc2', 'card_cvv', 'security_code',
  'track1', 'track2', 'magnetic_stripe',
] as const

export const VAULT_METHOD_TYPES = ['ach'] as const

export const billingCompliance = {
  merchant: 'Pinnacle Management Ventures records invoices and payment instructions. It does not take card numbers in this portal.',
  noCardStorage: 'Card numbers, expiration dates, and CVV/CVC codes are never collected or stored here.',
  processor: 'If a card or wallet charge is needed, your Pinnacle team sends a processor-hosted payment link. That page belongs to the card processor, not this site.',
  storedAch: 'Bank accounts on file are ACH only. You see the last four digits. Full routing and account numbers are encrypted and are not shown in the portal.',
  disputes: 'For a billing question, open a request. Do not send card numbers in messages.',
  storedCredentials: 'This app does not store card credentials, so Visa/Mastercard stored-credential (CIT/MIT) indicators are not used here.',
}

export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function isForbiddenCardKey(key: string): boolean {
  const n = normalizeKey(key)
  return (CARD_DATA_KEYS as readonly string[]).some((item) => normalizeKey(item) === n)
}

export function rejectCardPayload(value: unknown, path = ''): string | null {
  if (value == null) return null
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = rejectCardPayload(value[i], `${path}[${i}]`)
      if (hit) return hit
    }
    return null
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (isForbiddenCardKey(key)) {
        return 'Card numbers and security codes cannot be submitted to this portal.'
      }
      const hit = rejectCardPayload(child, path ? `${path}.${key}` : key)
      if (hit) return hit
    }
  }
  return null
}

export function isAllowedVaultMethod(type: string | null | undefined): boolean {
  return (VAULT_METHOD_TYPES as readonly string[]).includes(String(type || '').toLowerCase())
}

export function maskPaymentMethod(row: {
  method_type?: string | null
  account_holder_name?: string | null
  bank_name?: string | null
  account_type?: string | null
  account_last4?: string | null
  created_at?: string | null
  id?: string
}) {
  return {
    id: row.id,
    method_type: isAllowedVaultMethod(row.method_type) ? row.method_type : 'ach',
    account_holder_name: row.account_holder_name || null,
    bank_name: row.bank_name || null,
    account_type: row.account_type || null,
    account_last4: row.account_last4 || null,
    created_at: row.created_at || null,
  }
}
