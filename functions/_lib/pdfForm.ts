import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'

// Shared toolkit for Pinnacle's internal application PDFs. Produces a
// structured, form-like document — numbered section bands and boxed
// label/value fields laid out in a grid — rather than a plain stacked list,
// so a generated application reads like a real intake form. Values render in
// uppercase for fast scanning. Also merges applicant attachments onto the end
// of the record (the individual files stay available separately).

export const PAGE_WIDTH = 612
export const PAGE_HEIGHT = 792
export const MARGIN = 48
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

export const NAVY = rgb(0.035, 0.075, 0.14)
export const GOLD = rgb(0.72, 0.55, 0.19)
export const SLATE = rgb(0.42, 0.46, 0.52)
export const LIGHT = rgb(0.955, 0.965, 0.975)
export const BORDER = rgb(0.85, 0.87, 0.9)
export const FIELD_BG = rgb(0.995, 0.997, 1)
export const RED = rgb(0.6, 0.16, 0.16)

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
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

export interface Field { label: string; value: string; full?: boolean }

export interface PdfFormOptions {
  documentTitle: string
  author?: string
  subject?: string
  contactLine: string
  internalNote?: string
  logoBytes?: ArrayBuffer | Uint8Array | null
}

// Imperative builder over pdf-lib. Kept as a small class because pdf-lib is
// itself imperative and both application renderers share this exact chrome.
export class PdfForm {
  readonly pdf: PDFDocument
  readonly regular: PDFFont
  readonly bold: PDFFont
  private readonly logo: PDFImage | null
  private readonly opts: PdfFormOptions
  private page!: PDFPage
  private y = 0
  private sectionNo = 0

  private constructor(pdf: PDFDocument, regular: PDFFont, bold: PDFFont, logo: PDFImage | null, opts: PdfFormOptions) {
    this.pdf = pdf; this.regular = regular; this.bold = bold; this.logo = logo; this.opts = opts
  }

  static async create(opts: PdfFormOptions): Promise<PdfForm> {
    const pdf = await PDFDocument.create()
    pdf.setTitle(opts.documentTitle)
    pdf.setAuthor(opts.author ?? 'Pinnacle Management Ventures')
    if (opts.subject) pdf.setSubject(opts.subject)
    const regular = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    let logo: PDFImage | null = null
    if (opts.logoBytes) {
      try { logo = await pdf.embedPng(opts.logoBytes) }
      catch { try { logo = await pdf.embedJpg(opts.logoBytes) } catch { logo = null } }
    }
    return new PdfForm(pdf, regular, bold, logo, opts)
  }

  newPage(): void {
    this.page = this.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH, height: 8, color: GOLD })
    if (this.opts.internalNote) this.page.drawText(this.opts.internalNote, { x: MARGIN, y: 24, size: 8, font: this.bold, color: RED })
    this.page.drawText(this.opts.contactLine, { x: MARGIN, y: 12, size: 7, font: this.regular, color: SLATE })
    this.y = PAGE_HEIGHT - MARGIN
  }

  private ensure(height: number): void { if (this.y - height < 46) this.newPage() }

  // Letterhead + document title. Call once at the top.
  header(bigTitle: string, kicker?: string): void {
    if (!this.page) this.newPage()
    if (this.logo) {
      const scaled = this.logo.scaleToFit(42, 42)
      this.page.drawImage(this.logo, { x: MARGIN, y: this.y - 38, width: scaled.width, height: scaled.height })
    }
    const hx = this.logo ? MARGIN + 54 : MARGIN
    this.page.drawText('PINNACLE', { x: hx, y: this.y - 4, size: 18, font: this.bold, color: NAVY })
    this.page.drawText('MANAGEMENT VENTURES', { x: hx, y: this.y - 18, size: 7, font: this.bold, color: GOLD })
    this.page.drawText(bigTitle, { x: MARGIN, y: this.y - 58, size: 22, font: this.bold, color: NAVY })
    this.y -= 74
    if (kicker) {
      this.page.drawText(kicker.toUpperCase(), { x: MARGIN, y: this.y, size: 10, font: this.bold, color: GOLD })
      this.y -= 14
    }
    // Hairline under the letterhead to seat the title cleanly.
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + CONTENT_WIDTH, y: this.y }, thickness: 1, color: GOLD })
    this.y -= 8
  }

  // Section header: a numbered navy label seated on a hairline rule, with a
  // short gold tick. Lighter and more premium than a full ink band, and it
  // keeps the header attached to at least the first field row.
  section(title: string): void {
    this.ensure(60)
    this.sectionNo += 1
    this.y -= 16
    this.page.drawRectangle({ x: MARGIN, y: this.y - 1, width: 16, height: 10, color: GOLD })
    this.page.drawText(`${this.sectionNo}.  ${title.toUpperCase()}`, { x: MARGIN + 24, y: this.y, size: 10, font: this.bold, color: NAVY })
    this.y -= 8
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + CONTENT_WIDTH, y: this.y }, thickness: 0.75, color: BORDER })
    this.y -= 16
  }

  // A grid of boxed label/value fields. Two columns; a field marked `full`
  // spans the row. Values render uppercase for scanability; empty values show
  // a light rule so the reviewer sees the field exists but is blank.
  fields(items: Field[]): void {
    const gutter = 12
    const colW = (CONTENT_WIDTH - gutter) / 2
    let i = 0
    while (i < items.length) {
      const a = items[i]
      const full = a.full
      const b = full ? undefined : items[i + 1]
      const aLines = wrap((a.value || '').toUpperCase(), this.regular, 10, (full ? CONTENT_WIDTH : colW) - 20)
      const bLines = b ? wrap((b.value || '').toUpperCase(), this.regular, 10, colW - 20) : ['']
      const rows = Math.max(aLines.length, bLines.length, 1)
      const boxH = 18 + rows * 13 + 8
      this.ensure(boxH + 8)
      const top = this.y
      this.drawField(MARGIN, top, full ? CONTENT_WIDTH : colW, boxH, a.label, aLines)
      if (b) this.drawField(MARGIN + colW + gutter, top, colW, boxH, b.label, bLines)
      this.y -= boxH + 8
      i += full ? 1 : 2
    }
  }

  private drawField(x: number, top: number, w: number, h: number, label: string, valueLines: string[]): void {
    this.page.drawRectangle({ x, y: top - h, width: w, height: h, borderColor: BORDER, borderWidth: 0.75, color: FIELD_BG })
    // Gold accent tick on the left edge of each field for a finished, branded feel.
    this.page.drawRectangle({ x, y: top - h, width: 2, height: h, color: GOLD })
    this.page.drawText(label.toUpperCase(), { x: x + 10, y: top - 13, size: 6.5, font: this.bold, color: SLATE })
    let vy = top - 27
    for (const l of valueLines) {
      if (l.trim() === '') continue
      this.page.drawText(l, { x: x + 10, y: vy, size: 10.5, font: this.regular, color: NAVY })
      vy -= 13
    }
  }

  // A free paragraph (disclaimers, notes). Not uppercased.
  paragraph(text: string, opts: { size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}): void {
    const size = opts.size ?? 9
    const lines = wrap(text, this.regular, size, CONTENT_WIDTH)
    this.ensure(lines.length * (size + 3) + (opts.gap ?? 4))
    for (const l of lines) { this.page.drawText(l, { x: MARGIN, y: this.y, size, font: this.regular, color: opts.color ?? SLATE }); this.y -= size + 3 }
    this.y -= opts.gap ?? 4
  }

  // A boxed area for handwritten/typed review notes.
  notesBox(label: string, height = 46): void {
    this.ensure(height + 8)
    const top = this.y
    this.page.drawRectangle({ x: MARGIN, y: top - height, width: CONTENT_WIDTH, height, borderColor: BORDER, borderWidth: 0.75 })
    this.page.drawText(label.toUpperCase(), { x: MARGIN + 6, y: top - 11, size: 6.5, font: this.bold, color: SLATE })
    this.y -= height + 8
  }

  async save(): Promise<Uint8Array> { return this.pdf.save() }
}

export interface AttachmentInput { fileName: string | null; contentType: string | null; bytes: ArrayBuffer | Uint8Array }

// Merge applicant attachments onto the end of the document: PDFs are appended
// page-for-page, images get a fitted full page. Each is preceded by a labeled
// divider so the reviewer knows what they are looking at. Corrupt/unsupported
// files are skipped and returned so the caller can note them — never throws.
export async function appendAttachments(pdf: PDFDocument, attachments: AttachmentInput[]): Promise<{ appended: number; skipped: string[] }> {
  if (attachments.length === 0) return { appended: 0, skipped: [] }
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let appended = 0
  const skipped: string[] = []

  const divider = (index: number, name: string, detail: string) => {
    const p = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    p.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH, height: 8, color: GOLD })
    p.drawText(`ATTACHMENT ${index}`, { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 4, size: 11, font: bold, color: GOLD })
    for (const [j, l] of wrap((name || 'Uploaded file').toUpperCase(), bold, 16, CONTENT_WIDTH).entries()) {
      p.drawText(l, { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 28 - j * 18, size: 16, font: bold, color: NAVY })
    }
    p.drawText(detail, { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 74, size: 9, font: regular, color: SLATE })
    return p
  }

  let index = 0
  for (const att of attachments) {
    index += 1
    const ct = (att.contentType || '').toLowerCase()
    const name = att.fileName || 'Uploaded file'
    const lower = name.toLowerCase()
    try {
      if (ct.includes('pdf') || lower.endsWith('.pdf')) {
        const src = await PDFDocument.load(att.bytes, { ignoreEncryption: true })
        const pageCount = src.getPageCount()
        divider(index, name, `${pageCount} page${pageCount === 1 ? '' : 's'} — appended from the applicant's upload.`)
        const copied = await pdf.copyPages(src, src.getPageIndices())
        for (const p of copied) pdf.addPage(p)
        appended += 1
      } else if (ct.includes('png') || lower.endsWith('.png') || ct.includes('jpg') || ct.includes('jpeg') || /\.jpe?g$/.test(lower)) {
        const img = ct.includes('png') || lower.endsWith('.png') ? await pdf.embedPng(att.bytes) : await pdf.embedJpg(att.bytes)
        divider(index, name, 'Image upload — shown full page below.')
        const p = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        p.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH, height: 8, color: GOLD })
        const maxW = CONTENT_WIDTH
        const maxH = PAGE_HEIGHT - MARGIN * 2
        const scaled = img.scaleToFit(maxW, maxH)
        p.drawImage(img, { x: (PAGE_WIDTH - scaled.width) / 2, y: (PAGE_HEIGHT - scaled.height) / 2, width: scaled.width, height: scaled.height })
        appended += 1
      } else {
        skipped.push(name)
      }
    } catch {
      skipped.push(name)
    }
  }
  return { appended, skipped }
}
