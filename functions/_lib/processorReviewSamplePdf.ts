import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import type { Env } from './types'
import { PROCESSOR_REVIEW_COMPANY, PROCESSOR_REVIEW_NAME } from '../../shared/processorReviewLogin'

export const PROCESSOR_REVIEW_DOCUMENT_ID = 'processor-review-document'
export const PROCESSOR_REVIEW_DOCUMENT_FILE_NAME = 'Sample engagement letter.pdf'
export const PROCESSOR_REVIEW_DOCUMENT_CONTENT_TYPE = 'application/pdf'
export const PROCESSOR_REVIEW_DOCUMENT_SOURCE = 'generated_processor_review_sample'

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const NAVY = rgb(0.035, 0.075, 0.14)
const GOLD = rgb(0.78, 0.61, 0.23)
const SLATE = rgb(0.3, 0.34, 0.4)
const PALE_GOLD = rgb(0.97, 0.94, 0.84)

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= width) {
      line = next
    } else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

export async function renderProcessorReviewSamplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Sample Engagement Letter — Pinnacle Management Ventures')
  pdf.setAuthor('Pinnacle Management Ventures')
  pdf.setSubject('Processor review client workspace sample document')
  pdf.setKeywords(['Pinnacle Management Ventures', 'sample', 'processor review'])

  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  const paragraph = (text: string, size = 10, font = regular, color = NAVY, gap = 10) => {
    for (const line of wrap(text, font, size, CONTENT_WIDTH)) {
      page.drawText(line, { x: MARGIN, y, size, font, color })
      y -= size + 4
    }
    y -= gap
  }

  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH, height: 8, color: GOLD })
  page.drawText('PINNACLE', { x: MARGIN, y, size: 19, font: bold, color: NAVY })
  page.drawText('MANAGEMENT VENTURES', { x: MARGIN, y: y - 14, size: 8, font: bold, color: GOLD })
  y -= 55

  page.drawText('SAMPLE ENGAGEMENT LETTER', { x: MARGIN, y, size: 20, font: bold, color: NAVY })
  y -= 34
  page.drawRectangle({ x: MARGIN, y: y - 42, width: CONTENT_WIDTH, height: 50, color: PALE_GOLD })
  page.drawText('PROCESSOR REVIEW SAMPLE — NOT A LIVE CLIENT AGREEMENT', {
    x: MARGIN + 12,
    y: y - 12,
    size: 9,
    font: bold,
    color: NAVY,
  })
  page.drawText('This document demonstrates secure document delivery in the staged client workspace.', {
    x: MARGIN + 12,
    y: y - 29,
    size: 8,
    font: regular,
    color: SLATE,
  })
  y -= 72

  paragraph(`Prepared for: ${PROCESSOR_REVIEW_NAME}`, 10, bold, NAVY, 2)
  paragraph(`Company: ${PROCESSOR_REVIEW_COMPANY}`, 10, regular, SLATE, 18)

  paragraph('Purpose', 12, bold, NAVY, 5)
  paragraph('Pinnacle Management Ventures provides operational coordination, administrative support, and implementation guidance according to an agreed statement of work.')

  paragraph('Illustrative scope', 12, bold, NAVY, 5)
  paragraph('For this sample workspace, the proposed scope includes payment-processing implementation coordination, vendor comparison, cutover planning, and staff training. Any live engagement requires separate written approval by both parties.')

  paragraph('Confidentiality and records', 12, bold, NAVY, 5)
  paragraph('Client materials are handled as confidential business records and are made available only to authorized workspace users and assigned Pinnacle personnel.')

  paragraph('Sample status', 12, bold, NAVY, 5)
  paragraph('This generated file is for processor review and product demonstration only. It creates no obligation, authorizes no payment, and is not a substitute for an executed services agreement.')

  page.drawLine({ start: { x: MARGIN, y: 65 }, end: { x: PAGE_WIDTH - MARGIN, y: 65 }, thickness: 0.7, color: GOLD })
  page.drawText('Pinnacle Management Ventures | pinnaclemanagementventures.com', {
    x: MARGIN,
    y: 47,
    size: 8,
    font: regular,
    color: SLATE,
  })
  page.drawText('Secure client workspace sample', {
    x: PAGE_WIDTH - MARGIN - 124,
    y: 47,
    size: 8,
    font: regular,
    color: SLATE,
  })

  return pdf.save()
}

export function isProcessorReviewSampleDocument(document: { id: string; source: string | null }): boolean {
  return document.id === PROCESSOR_REVIEW_DOCUMENT_ID && document.source === PROCESSOR_REVIEW_DOCUMENT_SOURCE
}

export async function ensureProcessorReviewSampleDocument(env: Env, userId: string, actorUserId: string): Promise<void> {
  const bytes = await renderProcessorReviewSamplePdf()
  const objectKey = `client-documents/${userId}/processor-review/${PROCESSOR_REVIEW_DOCUMENT_ID}.pdf`
  const storedKey = env.UPLOADS ? objectKey : null

  if (env.UPLOADS) {
    await env.UPLOADS.put(objectKey, bytes, {
      httpMetadata: { contentType: PROCESSOR_REVIEW_DOCUMENT_CONTENT_TYPE },
      customMetadata: {
        documentId: PROCESSOR_REVIEW_DOCUMENT_ID,
        generated: 'true',
        purpose: 'processor-review',
      },
    })
  }

  await env.DB.prepare(
    `INSERT INTO client_documents
      (id, client_user_id, category, file_name, r2_key, review_status, visibility, content_type, size_bytes, source, uploaded_by_user_id)
     VALUES (?, ?, 'agreement', ?, ?, 'approved', 'client', ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       client_user_id = excluded.client_user_id,
       category = excluded.category,
       file_name = excluded.file_name,
       r2_key = excluded.r2_key,
       review_status = excluded.review_status,
       visibility = excluded.visibility,
       content_type = excluded.content_type,
       size_bytes = excluded.size_bytes,
       source = excluded.source,
       uploaded_by_user_id = excluded.uploaded_by_user_id`,
  ).bind(
    PROCESSOR_REVIEW_DOCUMENT_ID,
    userId,
    PROCESSOR_REVIEW_DOCUMENT_FILE_NAME,
    storedKey,
    PROCESSOR_REVIEW_DOCUMENT_CONTENT_TYPE,
    bytes.byteLength,
    PROCESSOR_REVIEW_DOCUMENT_SOURCE,
    actorUserId,
  ).run()
}
