import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { renderVendorApplicationPdf } from '../functions/_lib/vendorApplicationPdf'

const base = {
  userId: 'usr_corwin',
  submittedAt: '2026-08-15T14:00:00.000Z',
  provider: {
    name: 'Corwin Hicks',
    email: 'corwin@example.com',
    phone: '555-555-0142',
    companyName: 'Hicks Notary Services LLC',
    vendorCategory: 'Mobile Notary / Signing',
  },
  documents: [
    { document_type: 'government_id_front', file_name: 'id-front.jpg' },
    { document_type: 'professional_license', file_name: 'commission.pdf' },
  ],
  contactLine: 'Pinnacle Management Ventures | pinnaclemanagementventures.com',
}

describe('Provider Application PDF', () => {
  it('renders a loadable branded provider application PDF', async () => {
    const bytes = await renderVendorApplicationPdf({
      ...base,
      application: {
        entity_type: 'LLC',
        has_ein: true,
        enrollments: ['Mobile Notary / Signing', 'Remote Online Notary (RON)'],
        service_area: ['Miami-Dade', 'Broward'],
        years_experience: '7',
        license_status: 'yes',
        insurance_status: 'yes',
        commission_number: 'GG-4820193',
        commission_state: 'FL',
        commission_expiration: '2028-04-01',
        ron_provider: 'Proof',
        notes: 'Available weekends.',
      },
    })
    expect(bytes.byteLength).toBeGreaterThan(1000)
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1)
    expect(pdf.getTitle()).toBe('Provider Application — Corwin Hicks')
    expect(pdf.getSubject()).toContain('usr_corwin')
  })

  it('still renders when application answers are sparse (missing notary number)', async () => {
    const bytes = await renderVendorApplicationPdf({
      ...base,
      provider: { ...base.provider, vendorCategory: 'Property Field Services' },
      documents: [],
      application: { entity_type: 'Individual', enrollments: ['Property Field Services'], service_area: ['Orlando'] },
    })
    // A courier/field applicant with no commission number must not break the
    // renderer — the credential section still prints with an em dash.
    expect(bytes.byteLength).toBeGreaterThan(1000)
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1)
  })
})
