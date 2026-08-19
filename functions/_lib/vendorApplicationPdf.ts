import { DOC_LABELS, type ApplicationDocKey } from '../../shared/providerApplication'
import { PdfForm, appendAttachments, NAVY as NAVY_TEXT, type AttachmentInput, type Field } from './pdfForm'

// Branded, form-structured PDF of a provider (vendor) application. Reads the
// flat answer object persisted in vendor_application_profiles.application_json
// and lays it out as a real intake form on Pinnacle letterhead — numbered
// sections, boxed fields, uppercase values — so staff have one reviewable
// record attached to the provider profile, with the applicant's uploaded
// documents appended after it. Internal document, not for applicant distribution.

export interface VendorApplicationPdfInput {
  userId: string
  submittedAt: string
  provider: {
    name: string
    displayName?: string | null
    email: string
    phone?: string | null
    companyName?: string | null
    vendorCategory?: string | null
  }
  // The persisted application_json (shape is best-effort; unknown keys ignored).
  application: Record<string, unknown>
  documents: Array<{ document_type: string; file_name: string | null }>
  // Actual uploaded files, appended page-for-page onto the end of the record.
  attachments?: AttachmentInput[]
  contactLine: string
  logoBytes?: ArrayBuffer | Uint8Array | null
}

function str(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map((v) => str(v)).filter(Boolean).join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value).trim()
}

function humanizeKey(key: string): string {
  const s = key.replace(/_/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const YES_NO: Record<string, string> = { yes: 'Yes', no: 'No', unsure: 'Unsure' }
function yesNo(value: unknown): string {
  const s = str(value).toLowerCase()
  return YES_NO[s] ?? str(value)
}

export async function renderVendorApplicationPdf(input: VendorApplicationPdfInput): Promise<Uint8Array> {
  const app = input.application || {}
  const form = await PdfForm.create({
    documentTitle: `Provider Application — ${input.provider.name}`,
    subject: `Internal provider application ${input.userId}`,
    contactLine: input.contactLine,
    internalNote: 'INTERNAL DOCUMENT — NOT FOR APPLICANT DISTRIBUTION',
    logoBytes: input.logoBytes,
  })

  form.header('Provider Application', input.provider.vendorCategory || 'Provider network enrollment')

  form.section('Provider')
  form.fields([
    { label: 'Full legal name', value: input.provider.name },
    { label: 'Display name', value: input.provider.displayName || '' },
    { label: 'Email', value: input.provider.email },
    { label: 'Phone', value: input.provider.phone || '' },
    { label: 'Business / practice', value: input.provider.companyName || str(app.company_name) },
    { label: 'Entity type', value: str(app.entity_type) },
    { label: 'Uses an EIN', value: yesNo(app.has_ein) },
    { label: 'Provider ID', value: input.userId },
    { label: 'Submitted', value: input.submittedAt, full: true },
  ])

  form.section('Enrollment & coverage')
  form.fields([
    { label: 'Service categories', value: str(app.enrollments), full: true },
    { label: 'Service area', value: str(app.service_area), full: true },
    { label: 'Years of experience', value: str(app.years_experience) },
    { label: 'Travel radius', value: str(app.travel_radius) },
    ...(str(app.other_service) ? [{ label: 'Other service detail', value: str(app.other_service), full: true } as Field] : []),
  ])

  form.section('Credentials & compliance')
  form.fields([
    { label: 'Professional license held', value: yesNo(app.license_status) },
    { label: 'Insurance held', value: yesNo(app.insurance_status) },
    { label: 'Notary commission number', value: str(app.commission_number) },
    { label: 'Commission state', value: str(app.commission_state) },
    { label: 'Commission expiration', value: str(app.commission_expiration) },
    { label: 'RON platform / provider', value: str(app.ron_provider) },
    ...(str(app.technology_platforms) ? [{ label: 'Technology platforms', value: str(app.technology_platforms), full: true } as Field] : []),
    ...(str(app.accounting_credentials) ? [{ label: 'Accounting credentials', value: str(app.accounting_credentials), full: true } as Field] : []),
  ])

  const trackAnswers = (app.track_answers && typeof app.track_answers === 'object') ? app.track_answers as Record<string, unknown> : {}
  const trackEntries = Object.entries(trackAnswers).filter(([, v]) => str(v) !== '')
  if (trackEntries.length > 0) {
    form.section('Service-specific answers')
    form.fields(trackEntries.map(([key, value]) => ({ label: humanizeKey(key), value: str(value), full: true })))
  }

  if (str(app.notes)) {
    form.section('Applicant notes')
    form.paragraph(str(app.notes), { size: 10, color: NAVY_TEXT, gap: 6 })
  }

  form.section('Uploaded verification documents')
  if (input.documents.length === 0) {
    form.paragraph('No documents were uploaded with this application.')
  } else {
    form.fields(input.documents.map((doc, i) => ({
      label: `Document ${i + 1}`,
      value: `${doc.file_name || 'Uploaded file'}  ·  ${DOC_LABELS[doc.document_type as ApplicationDocKey] || doc.document_type.replace(/_/g, ' ')}`,
      full: true,
    })))
  }

  // Merge the actual uploaded files onto the end so the reviewer has the whole
  // packet in one document. The individual files remain available separately.
  const result = await appendAttachments(form.pdf, input.attachments ?? [])
  if (result.skipped.length > 0) {
    form.section('Attachments not embedded')
    form.paragraph(`These uploads could not be embedded inline (unsupported or unreadable format) and remain available as individual downloads on the provider profile: ${result.skipped.join(', ')}.`)
  }

  form.section('Internal review block')
  form.fields([
    { label: 'Review status', value: '' },
    { label: 'Reviewer', value: '' },
  ])
  form.notesBox('Review notes', 54)

  return form.save()
}
