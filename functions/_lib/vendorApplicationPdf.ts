import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { DOC_LABELS, type ApplicationDocKey } from '../../shared/providerApplication'

// Branded PDF summary of a provider (vendor) application. Reads the flat
// answer object we persist in vendor_application_profiles.application_json
// and lays it out on Pinnacle letterhead so staff have a single reviewable
// record attached to the provider profile. Internal document — not for
// distribution to the applicant.

export interface VendorApplicationPdfInput {
  userId: string
  submittedAt: string
  provider: {
    name: string
    email: string
    phone?: string | null
    companyName?: string | null
    vendorCategory?: string | null
  }
  // The persisted application_json (shape is best-effort; unknown keys are ignored).
  application: Record<string, unknown>
  documents: Array<{ document_type: string; file_name: string | null }>
  contactLine: string
  logoBytes?: ArrayBuffer | Uint8Array | null
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const NAVY = rgb(0.035, 0.075, 0.14)
const GOLD = rgb(0.78, 0.61, 0.23)
const SLATE = rgb(0.3, 0.34, 0.4)
const LIGHT = rgb(0.93, 0.94, 0.96)

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= maxWidth) { line = next; continue }
    if (line) lines.push(line)
    if (font.widthOfTextAtSize(word, size) <= maxWidth) { line = word; continue }
    let chunk = ''
    for (const ch of word) {
      const candidate = chunk + ch
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && chunk) { lines.push(chunk); chunk = ch }
      else chunk = candidate
    }
    line = chunk
  }
  if (line) lines.push(line)
  return lines
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
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Provider Application — ${input.provider.name}`)
  pdf.setAuthor('Pinnacle Management Ventures')
  pdf.setSubject(`Internal provider application ${input.userId}`)
  pdf.setKeywords(['Pinnacle Management Ventures', 'Provider Application', 'Internal'])

  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let logo: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null
  if (input.logoBytes) {
    try { logo = await pdf.embedPng(input.logoBytes) }
    catch { try { logo = await pdf.embedJpg(input.logoBytes) } catch { logo = null } }
  }

  let page!: PDFPage
  let y!: number

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH, height: 8, color: GOLD })
    page.drawText('INTERNAL DOCUMENT — NOT FOR APPLICANT DISTRIBUTION', { x: MARGIN, y: 24, size: 8, font: bold, color: rgb(0.65, 0.16, 0.16) })
    page.drawText(input.contactLine, { x: MARGIN, y: 12, size: 7, font: regular, color: SLATE })
    y = PAGE_HEIGHT - MARGIN
  }
  const ensure = (height: number) => { if (y - height < 48) newPage() }

  const line = (text: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const size = opts.size ?? 10
    const font = opts.font ?? regular
    const indent = opts.indent ?? 0
    const lines = wrapText(text, font, size, CONTENT_WIDTH - indent)
    ensure(lines.length * (size + 3) + (opts.gap ?? 2))
    for (const textLine of lines) {
      page.drawText(textLine, { x: MARGIN + indent, y, size, font, color: opts.color ?? NAVY })
      y -= size + 3
    }
    y -= opts.gap ?? 2
  }

  const section = (title: string) => {
    ensure(32)
    y -= 6
    page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_WIDTH, height: 22, color: LIGHT })
    page.drawText(title.toUpperCase(), { x: MARGIN + 9, y: y + 5, size: 9, font: bold, color: NAVY })
    y -= 28
  }

  const labelValue = (label: string, value: string) => {
    ensure(30)
    line(label, { size: 8, font: bold, color: SLATE, gap: 0 })
    line(value || '—', { size: 10, gap: 5 })
  }

  newPage()
  if (logo) {
    const scaled = logo.scaleToFit(42, 42)
    page.drawImage(logo, { x: MARGIN, y: y - 38, width: scaled.width, height: scaled.height })
  }
  const headerX = logo ? MARGIN + 54 : MARGIN
  page.drawText('PINNACLE', { x: headerX, y: y - 4, size: 18, font: bold, color: NAVY })
  page.drawText('MANAGEMENT VENTURES', { x: headerX, y: y - 18, size: 7, font: bold, color: GOLD })
  page.drawText('Provider Application', { x: MARGIN, y: y - 62, size: 22, font: bold, color: NAVY })
  y -= 82
  line(input.provider.vendorCategory || 'Provider network enrollment', { size: 13, font: bold, color: GOLD, gap: 4 })
  labelValue('Provider ID', input.userId)
  labelValue('Submitted', input.submittedAt)

  section('Provider')
  labelValue('Name', input.provider.name)
  if (input.provider.companyName || str(app.company_name)) labelValue('Business', input.provider.companyName || str(app.company_name))
  labelValue('Email', input.provider.email)
  if (input.provider.phone) labelValue('Phone', input.provider.phone)
  labelValue('Entity type', str(app.entity_type))
  labelValue('Has EIN', yesNo(app.has_ein))

  section('Enrollment & coverage')
  labelValue('Service categories', str(app.enrollments))
  labelValue('Service area', str(app.service_area))
  labelValue('Years of experience', str(app.years_experience))
  if (str(app.travel_radius)) labelValue('Travel radius', str(app.travel_radius))
  if (str(app.other_service)) labelValue('Other service detail', str(app.other_service))

  section('Credentials & compliance')
  labelValue('Professional license held', yesNo(app.license_status))
  labelValue('Insurance held', yesNo(app.insurance_status))
  // Notary commission — always rendered so the reviewer can see whether a
  // commission number was captured, regardless of the enrolled track.
  labelValue('Notary commission number', str(app.commission_number))
  labelValue('Commission state', str(app.commission_state))
  labelValue('Commission expiration', str(app.commission_expiration))
  if (str(app.ron_provider)) labelValue('RON platform / provider', str(app.ron_provider))
  if (str(app.technology_platforms)) labelValue('Technology platforms', str(app.technology_platforms))
  if (str(app.accounting_credentials)) labelValue('Accounting credentials', str(app.accounting_credentials))

  // Track-specific answers captured for the enrolled services.
  const trackAnswers = (app.track_answers && typeof app.track_answers === 'object') ? app.track_answers as Record<string, unknown> : {}
  const trackEntries = Object.entries(trackAnswers).filter(([, v]) => str(v) !== '')
  if (trackEntries.length > 0) {
    section('Service-specific answers')
    for (const [key, value] of trackEntries) labelValue(humanizeKey(key), str(value))
  }

  if (str(app.notes)) {
    section('Applicant notes')
    line(str(app.notes), { size: 10, gap: 5 })
  }

  section('Uploaded verification documents')
  if (input.documents.length === 0) line('No documents were uploaded with this application.', { color: SLATE })
  else input.documents.forEach((doc, index) => line(`${index + 1}. ${doc.file_name || 'Uploaded file'} (${DOC_LABELS[doc.document_type as ApplicationDocKey] || doc.document_type.replace(/_/g, ' ')})`, { indent: 6 }))

  section('Internal review block')
  labelValue('Review status', '________________________________________________')
  labelValue('Reviewer', '________________________________________________')
  labelValue('Notes', '________________________________________________________________________\n________________________________________________________________________')

  return pdf.save()
}
