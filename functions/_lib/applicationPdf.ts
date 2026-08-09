import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { displayAnswer, type IntakeValue } from './intake'

export interface ApplicationPdfAnswer {
  question_key: string
  question_label: string
  step_label: string | null
  step_order: number
  sort_order: number
  value: IntakeValue
}

export interface ApplicationPdfAttachment {
  file_name: string | null
}

export interface ApplicationPdfInput {
  applicationId: string
  submittedAt: string
  serviceName: string
  client: {
    name: string
    businessName?: string | null
    email: string
    phone?: string | null
    preferredContact?: string | null
  }
  answers: ApplicationPdfAnswer[]
  attachments: ApplicationPdfAttachment[]
  assignedRep?: string | null
  pipelineStage: string
  submissionSource: string
  disclaimer: string
  contactLine: string
  evictionDisclaimer?: string | null
  mayRequireAttorneyCoordination?: boolean
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
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next
      continue
    }
    if (line) lines.push(line)
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      line = word
      continue
    }
    let chunk = ''
    for (const ch of word) {
      const candidate = chunk + ch
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && chunk) {
        lines.push(chunk)
        chunk = ch
      } else chunk = candidate
    }
    line = chunk
  }
  if (line) lines.push(line)
  return lines
}

function groupAnswers(answers: ApplicationPdfAnswer[]) {
  const groups = new Map<string, ApplicationPdfAnswer[]>()
  for (const answer of [...answers].sort((a, b) => a.step_order - b.step_order || a.sort_order - b.sort_order)) {
    const key = answer.step_label || 'Service details'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(answer)
  }
  return groups
}

export async function renderApplicationPdf(input: ApplicationPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Application for Services — ${input.serviceName}`)
  pdf.setAuthor('Pinnacle Management Ventures')
  pdf.setSubject(`Internal service application ${input.applicationId}`)
  pdf.setKeywords(['Pinnacle Management Ventures', 'Application for Services', 'Internal'])

  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let logo: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null
  if (input.logoBytes) {
    try {
      logo = await pdf.embedPng(input.logoBytes)
    } catch {
      try {
        logo = await pdf.embedJpg(input.logoBytes)
      } catch {
        logo = null
      }
    }
  }

  let page: PDFPage
  let y: number

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH, height: 8, color: GOLD })
    page.drawText('INTERNAL DOCUMENT — NOT FOR CLIENT DISTRIBUTION', {
      x: MARGIN,
      y: 24,
      size: 8,
      font: bold,
      color: rgb(0.65, 0.16, 0.16),
    })
    page.drawText(input.contactLine, { x: MARGIN, y: 12, size: 7, font: regular, color: SLATE })
    y = PAGE_HEIGHT - MARGIN
  }

  const ensure = (height: number) => {
    if (y - height < 48) newPage()
  }

  const line = (text: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const size = opts.size ?? 10
    const f = opts.font ?? regular
    const indent = opts.indent ?? 0
    const lines = wrapText(text, f, size, CONTENT_WIDTH - indent)
    const height = lines.length * (size + 3) + (opts.gap ?? 2)
    ensure(height)
    for (const l of lines) {
      page.drawText(l, { x: MARGIN + indent, y, size, font: f, color: opts.color ?? NAVY })
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
  page.drawText('Application for Services', { x: MARGIN, y: y - 62, size: 22, font: bold, color: NAVY })
  y -= 82
  line(input.serviceName, { size: 13, font: bold, color: GOLD, gap: 4 })
  labelValue('Application ID', input.applicationId)
  labelValue('Submitted', input.submittedAt)

  section('Client')
  labelValue('Client', input.client.name)
  if (input.client.businessName) labelValue('Business', input.client.businessName)
  labelValue('Email', input.client.email)
  if (input.client.phone) labelValue('Phone', input.client.phone)
  if (input.client.preferredContact) labelValue('Preferred contact', input.client.preferredContact)

  for (const [stepLabel, answers] of groupAnswers(input.answers)) {
    section(stepLabel)
    for (const answer of answers) {
      const value = displayAnswer(answer.value)
      if (value === '—' || value.trim() === '') continue
      labelValue(answer.question_label, value)
    }
  }

  section('Attachments')
  if (input.attachments.length === 0) {
    line('No client-uploaded attachments.', { color: SLATE })
  } else {
    input.attachments.forEach((attachment, i) => line(`${i + 1}. ${attachment.file_name || 'Uploaded file'}`, { indent: 6 }))
  }

  section('Internal staff block')
  labelValue('Assigned representative', input.assignedRep || 'Unassigned')
  labelValue('Pipeline stage', input.pipelineStage)
  labelValue('Submission source', input.submissionSource)
  if (input.mayRequireAttorneyCoordination) {
    labelValue('Attorney coordination', 'MAY REQUIRE ATTORNEY COORDINATION — REVIEW BEFORE COMMITTING SCOPE')
  }
  labelValue('Staff notes', '________________________________________________________________________\n________________________________________________________________________')

  section('Compliance')
  line(input.disclaimer, { size: 8, color: SLATE, gap: 5 })
  if (input.evictionDisclaimer && input.mayRequireAttorneyCoordination) {
    line(input.evictionDisclaimer, { size: 8, color: rgb(0.55, 0.17, 0.12), gap: 5 })
  }

  return pdf.save()
}
