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

export interface ApplicationPdfAttachment { file_name: string | null }
export interface ApplicationPdfInput {
  applicationId: string
  submittedAt: string
  serviceName: string
  client: { name: string; businessName?: string | null; email: string; phone?: string | null; preferredContact?: string | null }
  answers: ApplicationPdfAnswer[]
  attachments: ApplicationPdfAttachment[]
  assignedRep?: string | null
  pipelineStage: string
  submissionSource: string
  disclaimer: string
  contactLine: string
  evictionDisclaimer?: string | null
  mayRequireAttorneyCoordination?: boolean
  signature?: { name: string; signedAt: string; electronicIntent: boolean } | null
  logoBytes?: ArrayBuffer | Uint8Array | null
}

const PAGE_WIDTH = 612, PAGE_HEIGHT = 792, MARGIN = 48, CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const NAVY = rgb(0.035, 0.075, 0.14), BLUE = rgb(0.10, 0.24, 0.40), GOLD = rgb(0.78, 0.61, 0.23), SLATE = rgb(0.30, 0.34, 0.40), LIGHT = rgb(0.94, 0.96, 0.98), WHITE = rgb(1,1,1)
const SIGNATURE_NAME_KEY = '__pmv_signature_name__'
const SIGNATURE_DATE_KEY = '__pmv_signature_signed_at__'

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []; let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= maxWidth) { line = next; continue }
    if (line) lines.push(line)
    if (font.widthOfTextAtSize(word, size) <= maxWidth) { line = word; continue }
    let chunk = ''
    for (const ch of word) { const candidate = chunk + ch; if (font.widthOfTextAtSize(candidate, size) > maxWidth && chunk) { lines.push(chunk); chunk = ch } else chunk = candidate }
    line = chunk
  }
  if (line) lines.push(line)
  return lines
}

function groupAnswers(answers: ApplicationPdfAnswer[]) {
  const groups = new Map<string, ApplicationPdfAnswer[]>()
  for (const answer of [...answers].filter((a) => !a.question_key.startsWith('__pmv_signature_')).sort((a, b) => a.step_order - b.step_order || a.sort_order - b.sort_order)) {
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
  pdf.setSubject(`Client service application ${input.applicationId}`)
  pdf.setKeywords(['Pinnacle Management Ventures', 'Application for Services', input.serviceName])
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let logo: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null
  if (input.logoBytes) { try { logo = await pdf.embedPng(input.logoBytes) } catch { try { logo = await pdf.embedJpg(input.logoBytes) } catch { logo = null } } }

  const mirroredName = input.answers.find((a) => a.question_key === SIGNATURE_NAME_KEY)
  const mirroredDate = input.answers.find((a) => a.question_key === SIGNATURE_DATE_KEY)
  const inferredSignature = mirroredName && mirroredDate ? { name: displayAnswer(mirroredName.value), signedAt: displayAnswer(mirroredDate.value), electronicIntent: true } : null
  const signature = input.signature || inferredSignature

  let page!: PDFPage; let y!: number
  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 9, width: PAGE_WIDTH, height: 9, color: GOLD })
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 13, width: PAGE_WIDTH, height: 4, color: BLUE })
    page.drawText(input.contactLine, { x: MARGIN, y: 14, size: 7, font: regular, color: SLATE })
    page.drawText('Generated securely through the Pinnacle Client Portal', { x: PAGE_WIDTH - MARGIN - 205, y: 14, size: 7, font: regular, color: SLATE })
    y = PAGE_HEIGHT - MARGIN
  }
  const ensure = (height: number) => { if (y - height < 48) newPage() }
  const line = (text: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const size = opts.size ?? 10, font = opts.font ?? regular, indent = opts.indent ?? 0
    const lines = wrapText(text, font, size, CONTENT_WIDTH - indent)
    ensure(lines.length * (size + 3) + (opts.gap ?? 2))
    for (const textLine of lines) { page.drawText(textLine, { x: MARGIN + indent, y, size, font, color: opts.color ?? NAVY }); y -= size + 3 }
    y -= opts.gap ?? 2
  }
  const section = (title: string) => {
    ensure(34); y -= 7
    page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_WIDTH, height: 24, color: BLUE })
    page.drawRectangle({ x: MARGIN, y: y - 4, width: 5, height: 24, color: GOLD })
    page.drawText(title.toUpperCase(), { x: MARGIN + 14, y: y + 4, size: 9, font: bold, color: WHITE })
    y -= 31
  }
  const labelValue = (label: string, value: string) => { ensure(30); line(label, { size: 8, font: bold, color: SLATE, gap: 0 }); line(value || '—', { size: 10, gap: 5 }) }

  newPage()
  if (logo) { const scaled = logo.scaleToFit(44, 44); page.drawImage(logo, { x: MARGIN, y: y - 39, width: scaled.width, height: scaled.height }) }
  const headerX = logo ? MARGIN + 56 : MARGIN
  page.drawText('PINNACLE', { x: headerX, y: y - 4, size: 19, font: bold, color: NAVY })
  page.drawText('MANAGEMENT VENTURES', { x: headerX, y: y - 19, size: 7, font: bold, color: GOLD })
  y -= 58
  page.drawText('APPLICATION FOR SERVICES', { x: MARGIN, y: y, size: 9, font: bold, color: GOLD })
  y -= 24
  line(input.serviceName, { size: 22, font: bold, color: NAVY, gap: 8 })

  page.drawRectangle({ x: MARGIN, y: y - 38, width: CONTENT_WIDTH, height: 38, color: LIGHT })
  page.drawText(`Application ID: ${input.applicationId}`, { x: MARGIN + 10, y: y - 15, size: 8, font: bold, color: NAVY })
  page.drawText(`Submitted: ${input.submittedAt}`, { x: MARGIN + 10, y: y - 29, size: 8, font: regular, color: SLATE })
  if (input.assignedRep) page.drawText(`Pinnacle contact: ${input.assignedRep}`, { x: MARGIN + 285, y: y - 15, size: 8, font: regular, color: SLATE })
  page.drawText(`Status: ${input.pipelineStage}`, { x: MARGIN + 285, y: y - 29, size: 8, font: regular, color: SLATE })
  y -= 50

  section('Client information')
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
  if (!input.attachments.length) line('No client-uploaded attachments were submitted with this application.', { color: SLATE })
  else input.attachments.forEach((attachment, index) => line(`${index + 1}. ${attachment.file_name || 'Uploaded file'}`, { indent: 6 }))

  section('Electronic signature')
  if (signature?.electronicIntent && signature.name && signature.signedAt) {
    labelValue('Signed by', signature.name)
    labelValue('Signed at', signature.signedAt)
    line('The client affirmatively agreed to use the typed name above as an electronic signature and submitted this application through the authenticated Pinnacle Client Portal.', { size: 8, color: SLATE, gap: 5 })
  } else line('No electronic signature was recorded for this submission.', { color: SLATE })

  section('What happens next')
  line('Pinnacle will review the information provided, confirm the appropriate scope, and follow up with any questions or next steps. This application helps us understand the request; final services remain subject to review and any required written agreement.', { size: 9, color: NAVY, gap: 6 })
  if (input.mayRequireAttorneyCoordination) line('This request may involve attorney coordination or another licensed professional. Pinnacle will confirm the appropriate provider and scope before work proceeds.', { size: 8, color: BLUE, gap: 6 })

  section('Important information')
  line(input.disclaimer, { size: 8, color: SLATE, gap: 5 })
  if (input.evictionDisclaimer && input.mayRequireAttorneyCoordination) line(input.evictionDisclaimer, { size: 8, color: SLATE, gap: 5 })
  return pdf.save()
}
