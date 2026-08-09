import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { renderApplicationPdf } from '../functions/_lib/applicationPdf'

describe('Application for Services PDF', () => {
  it('renders a loadable branded internal application PDF', async () => {
    const bytes = await renderApplicationPdf({
      applicationId: 'app-test-123',
      submittedAt: '2026-08-09T16:00:00.000Z',
      serviceName: 'Property Management',
      client: {
        name: 'Test Client',
        businessName: 'Test Holdings LLC',
        email: 'client@example.com',
        phone: '555-555-0100',
      },
      answers: [
        {
          question_key: 'management_tier',
          question_label: 'Choose the level of support',
          step_label: 'Choose a service tier',
          step_order: 2,
          sort_order: 10,
          value: 'tier_2',
        },
        {
          question_key: 'eviction_help_now',
          question_label: 'Do you need eviction help now?',
          step_label: 'Eviction Documentation & Court Representation',
          step_order: 4,
          sort_order: 10,
          value: 'Yes, actively',
        },
      ],
      attachments: [{ file_name: 'current-lease.pdf' }],
      assignedRep: 'Assigned Representative',
      pipelineStage: 'Submitted',
      submissionSource: 'portal',
      disclaimer: 'Standard PMV compliance disclaimer.',
      contactLine: 'Pinnacle Management Ventures | pinnaclemanagementventures.com',
      evictionDisclaimer: 'May require attorney coordination.',
      mayRequireAttorneyCoordination: true,
    })

    expect(bytes.byteLength).toBeGreaterThan(1000)
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1)
    expect(pdf.getTitle()).toBe('Application for Services — Property Management')
    expect(pdf.getSubject()).toContain('app-test-123')
  })
})
