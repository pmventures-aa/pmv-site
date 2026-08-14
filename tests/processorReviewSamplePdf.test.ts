import { describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import type { Env } from '../functions/_lib/types'
import {
  ensureProcessorReviewSampleDocument,
  isProcessorReviewSampleDocument,
  PROCESSOR_REVIEW_DOCUMENT_CONTENT_TYPE,
  PROCESSOR_REVIEW_DOCUMENT_ID,
  PROCESSOR_REVIEW_DOCUMENT_SOURCE,
  renderProcessorReviewSamplePdf,
} from '../functions/_lib/processorReviewSamplePdf'

function database(bindings: unknown[][]): D1Database {
  return {
    prepare: vi.fn(() => ({
      bind: (...values: unknown[]) => {
        bindings.push(values)
        return { run: vi.fn(async () => ({ success: true })) }
      },
    })),
  } as unknown as D1Database
}

describe('processor review sample PDF', () => {
  it('renders a valid branded PDF document', async () => {
    const bytes = await renderProcessorReviewSamplePdf()
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')

    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getTitle()).toBe('Sample Engagement Letter — Pinnacle Management Ventures')
    expect(pdf.getAuthor()).toBe('Pinnacle Management Ventures')
    expect(pdf.getSubject()).toBe('Processor review client workspace sample document')
  })

  it('stores the PDF in R2 before linking complete document metadata', async () => {
    const bindings: unknown[][] = []
    const put = vi.fn(async () => undefined)
    const env = {
      DB: database(bindings),
      UPLOADS: { put },
    } as unknown as Env

    await ensureProcessorReviewSampleDocument(env, 'processor-review-client', 'admin-user')

    expect(put).toHaveBeenCalledOnce()
    const [key, bytes, options] = put.mock.calls[0]
    expect(key).toBe(`client-documents/processor-review-client/processor-review/${PROCESSOR_REVIEW_DOCUMENT_ID}.pdf`)
    expect(new TextDecoder().decode((bytes as Uint8Array).slice(0, 5))).toBe('%PDF-')
    expect(options).toMatchObject({ httpMetadata: { contentType: PROCESSOR_REVIEW_DOCUMENT_CONTENT_TYPE } })
    expect(bindings[0]).toEqual([
      PROCESSOR_REVIEW_DOCUMENT_ID,
      'processor-review-client',
      'Sample engagement letter.pdf',
      key,
      PROCESSOR_REVIEW_DOCUMENT_CONTENT_TYPE,
      (bytes as Uint8Array).byteLength,
      PROCESSOR_REVIEW_DOCUMENT_SOURCE,
      'admin-user',
    ])
  })

  it('records generated metadata without a fake storage key when R2 is unavailable', async () => {
    const bindings: unknown[][] = []
    const env = { DB: database(bindings) } as unknown as Env

    await ensureProcessorReviewSampleDocument(env, 'processor-review-client', 'admin-user')

    expect(bindings[0][3]).toBeNull()
    expect(bindings[0][4]).toBe(PROCESSOR_REVIEW_DOCUMENT_CONTENT_TYPE)
    expect(bindings[0][5]).toEqual(expect.any(Number))
    expect(bindings[0][6]).toBe(PROCESSOR_REVIEW_DOCUMENT_SOURCE)
  })

  it('limits the no-R2 fallback to the reserved generated sample record', () => {
    expect(isProcessorReviewSampleDocument({
      id: PROCESSOR_REVIEW_DOCUMENT_ID,
      source: PROCESSOR_REVIEW_DOCUMENT_SOURCE,
    })).toBe(true)
    expect(isProcessorReviewSampleDocument({
      id: PROCESSOR_REVIEW_DOCUMENT_ID,
      source: 'manual',
    })).toBe(false)
    expect(isProcessorReviewSampleDocument({
      id: 'another-document',
      source: PROCESSOR_REVIEW_DOCUMENT_SOURCE,
    })).toBe(false)
  })
})
