import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildPdf } from '../functions/_lib/documentExport'
import { DOC_PAGE_SIZES } from '../shared/docLayout'

describe('document PDF export page geometry', () => {
  for (const size of DOC_PAGE_SIZES) {
    it(`renders a ${size.key} page at the right point dimensions`, async () => {
      const bytes = await buildPdf({ title: 'Sample', html: '<h1>Title</h1><p>Body text.</p>', branded: true, pageSize: size.key })
      const pdf = await PDFDocument.load(bytes)
      const page = pdf.getPage(0)
      expect(Math.round(page.getWidth())).toBe(Math.round(size.pt.w))
      expect(Math.round(page.getHeight())).toBe(Math.round(size.pt.h))
    })
  }

  it('falls back to Letter for an unknown page size', async () => {
    const bytes = await buildPdf({ title: 'Sample', html: '<p>Body.</p>', pageSize: 'tabloid' })
    const page = (await PDFDocument.load(bytes)).getPage(0)
    expect(Math.round(page.getWidth())).toBe(612)
    expect(Math.round(page.getHeight())).toBe(792)
  })
})
