import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { renderVendorApplicationPdf } from '../functions/_lib/vendorApplicationPdf'
import { appendAttachments } from '../functions/_lib/pdfForm'

const base = {
  userId: 'prov-123',
  submittedAt: '2026-08-09T16:00:00.000Z',
  provider: {
    name: 'Corwin Vega',
    displayName: 'Cor',
    email: 'corwin@example.com',
    phone: '561-388-7879',
    companyName: null,
    vendorCategory: 'Property & Field Services',
  },
  application: {
    entity_type: 'LLC',
    has_ein: 'yes',
    enrollments: ['Property & Field Services', 'Mobile Notary / Signing'],
    service_area: ['Broward County', 'Palm Beach County'],
    years_experience: '7',
    license_status: 'yes',
    insurance_status: 'yes',
    commission_number: 'GG123456',
    notes: 'Available weekends.',
    track_answers: { turnaround_time: 'Same day' },
  },
  documents: [{ document_type: 'government_id', file_name: 'license.pdf' }],
  contactLine: 'Pinnacle Management Ventures | pinnaclemanagementventures.com',
}

async function tinyPdf(pages: number): Promise<Uint8Array> {
  const d = await PDFDocument.create()
  for (let i = 0; i < pages; i++) d.addPage([300, 300])
  return d.save()
}

describe('renderVendorApplicationPdf', () => {
  it('renders a loadable branded application PDF', async () => {
    const bytes = await renderVendorApplicationPdf(base)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThan(0)
    expect(doc.getTitle()).toContain('Corwin Vega')
  })

  it('appends attachment pages onto the end of the record', async () => {
    const withoutAttachments = await PDFDocument.load(await renderVendorApplicationPdf(base))
    const baseCount = withoutAttachments.getPageCount()

    const attach = await tinyPdf(3)
    const bytes = await renderVendorApplicationPdf({ ...base, attachments: [{ fileName: 'license.pdf', contentType: 'application/pdf', bytes: attach }] })
    const doc = await PDFDocument.load(bytes)
    // 3 attachment pages + 1 divider page beyond the base record.
    expect(doc.getPageCount()).toBe(baseCount + 4)
  })
})

describe('appendAttachments', () => {
  it('skips unreadable/unsupported files without throwing', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([300, 300])
    const before = pdf.getPageCount()
    const result = await appendAttachments(pdf, [
      { fileName: 'notes.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('hi') },
      { fileName: 'broken.pdf', contentType: 'application/pdf', bytes: new TextEncoder().encode('not a pdf') },
    ])
    expect(result.appended).toBe(0)
    expect(result.skipped).toContain('notes.txt')
    expect(result.skipped).toContain('broken.pdf')
    expect(pdf.getPageCount()).toBe(before)
  })

  it('embeds a PNG upload as one fitted page with a divider', async () => {
    const pdf = await PDFDocument.create()
    // 1x1 transparent PNG.
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAoGH2P3AAAAAAElFTkSuQmCC'), (c) => c.charCodeAt(0))
    const result = await appendAttachments(pdf, [{ fileName: 'id.png', contentType: 'image/png', bytes: png }])
    expect(result.appended).toBe(1)
    expect(pdf.getPageCount()).toBe(2) // divider + image page
  })
})
