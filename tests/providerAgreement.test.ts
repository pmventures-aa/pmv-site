import { describe, expect, it } from 'vitest'
import {
  PROVIDER_AGREEMENT_PATH,
  PROVIDER_AGREEMENT_URL,
  PROVIDER_AGREEMENT_VERSION,
  normalizeProviderSignature,
} from '../shared/providerAgreement'

describe('provider agreement', () => {
  it('uses a versioned public agreement URL', () => {
    expect(PROVIDER_AGREEMENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(PROVIDER_AGREEMENT_PATH).toBe('/provider-agreement')
    expect(PROVIDER_AGREEMENT_URL).toBe('https://pinnaclemanagementventures.com/provider-agreement')
  })

  it('normalizes harmless signature differences without accepting a different name', () => {
    expect(normalizeProviderSignature('  Cody   Jenkins ')).toBe('cody jenkins')
    expect(normalizeProviderSignature('CODY JENKINS')).toBe('cody jenkins')
    expect(normalizeProviderSignature('Cody J. Jenkins')).not.toBe(normalizeProviderSignature('Cody Jenkins'))
    expect(normalizeProviderSignature(null)).toBe('')
  })
})
