import { describe, it, expect } from 'vitest'
import { questionsForTracks, documentsForTracks, ALL_APPLICATION_DOC_KEYS } from '../shared/providerApplication'

describe('provider application branching', () => {
  it('assembles the union of track questions, de-duplicated', () => {
    const q = questionsForTracks(['mobile_notary', 'ron'])
    const keys = q.map((x) => x.key)
    expect(keys).toContain('loan_signing_certified')
    expect(keys).toContain('ron_states')
    // no duplicate keys across overlapping tracks
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('requires notary + RON credentials for a notary/RON applicant', () => {
    const docs = documentsForTracks(['mobile_notary', 'ron'], { businessEntity: false })
    const required = docs.filter((d) => d.required).map((d) => d.key)
    expect(required).toContain('government_id_front')
    expect(required).toContain('notary_commission')
    expect(required).toContain('ron_credential')
    expect(required).toContain('eo_insurance')
    // no EIN slot for a non-business applicant
    expect(docs.map((d) => d.key)).not.toContain('ein_letter')
  })

  it('requires auto insurance + background consent for couriers, and EIN for a business', () => {
    const docs = documentsForTracks(['document_courier'], { businessEntity: true })
    const keys = docs.map((d) => d.key)
    expect(keys).toContain('ein_letter')
    expect(keys).toContain('auto_insurance')
    expect(keys).toContain('background_check_consent')
    expect(docs.find((d) => d.key === 'auto_insurance')?.required).toBe(true)
  })

  it('always offers a W-9 slot and never requires it at application time', () => {
    const docs = documentsForTracks(['business_operations'], { businessEntity: false })
    const w9 = docs.find((d) => d.key === 'w9')
    expect(w9).toBeTruthy()
    expect(w9?.required).toBe(false)
  })

  it('a shared slot is required if any selected track requires it', () => {
    // property_field requires liability insurance; merchant_technology does not.
    const docs = documentsForTracks(['merchant_technology', 'property_field'], { businessEntity: false })
    expect(docs.find((d) => d.key === 'insurance')?.required).toBe(true)
  })

  it('every declared slot is in the backend allowlist', () => {
    for (const track of ['property_field', 'mobile_notary', 'ron', 'document_courier', 'merchant_technology', 'bookkeeping_financial'] as const) {
      for (const doc of documentsForTracks([track], { businessEntity: true })) {
        expect(ALL_APPLICATION_DOC_KEYS).toContain(doc.key)
      }
    }
  })
})
