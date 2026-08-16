// Letterhead PDF export for the Document Hub. Renders the editor HTML with
// the same branding as the on-screen page: crest, firm name/tagline/aside,
// gold rule, and a confidentiality footer on every page. Preserves headings,
// bold/italic/underline, links, lists, quotes and horizontal rules.

import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import { FIRM_NAME, FIRM_PHONE, FIRM_REGION, FIRM_SITE_HOST, FIRM_TAGLINE, SUPPORT_EMAIL } from '../../shared/letterhead'
import { parseHtml, type ExportRun } from './officeExport'

const PAD = 54
const CONTENT_W = 612 - PAD * 2

const WIN_ANSI_EXTRA = new Set(
  '\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178'
)

function toWinAnsi(text: string): string {
  let out = ''
  for (const ch of String(text)) {
    const code = ch.codePointAt(0) ?? 0
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || ch === '\n' || ch === '\t' || WIN_ANSI_EXTRA.has(ch)) out += ch
    else out += '?'
  }
  return out
}

type Word = { text: string; font: PDFFont; size: number; color: { r: number; g: number; b: number }; underline: boolean; spaceBefore: boolean; br?: boolean }

export async function buildPdf(input: { title: string; html: string; branded?: boolean; logoBytes?: Uint8Array | ArrayBuffer | null }): Promise<Uint8Array> {
  const branded = !!input.branded
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${input.title} — ${FIRM_NAME}`)
  pdf.setAuthor(FIRM_NAME)
  pdf.setSubject('Pinnacle Management Ventures document export')
  pdf.setProducer(FIRM_NAME)
  pdf.setCreator(FIRM_NAME)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique)
  const boldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique)
  let logo: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null
  if (input.logoBytes) {
    try { logo = await pdf.embedPng(input.logoBytes) } catch { try { logo = await pdf.embedJpg(input.logoBytes) } catch { logo = null } }
  }
  const NAVY = rgb(0.043, 0.075, 0.14)
  const GOLD = rgb(0.78, 0.61, 0.23)
  const SLATE = rgb(0.42, 0.47, 0.54)
  const INK = rgb(0.12, 0.15, 0.2)
  const blocks = parseHtml(input.html)

  let page = pdf.addPage([612, 792])
  let y = 792 - PAD

  const newPage = () => {
    page = pdf.addPage([612, 792])
    y = 792 - PAD
  }
  const footer = () => {
    page.drawText(FIRM_NAME, { x: PAD, y: 22, size: 7, font: regular, color: SLATE })
    const right = branded ? `Confidential  ·  ${SUPPORT_EMAIL}` : FIRM_NAME
    page.drawText(right, { x: 612 - PAD - regular.widthOfTextAtSize(right, 7), y: 22, size: 7, font: regular, color: SLATE })
  }
  const ensure = (h: number) => {
    if (y - h < 44) { footer(); newPage() }
  }
  const letterhead = () => {
    if (logo) {
      const scaled = logo.scaleToFit(38, 46)
      page.drawImage(logo, { x: PAD, y: y - scaled.height, width: scaled.width, height: scaled.height })
    }
    const hx = PAD + (logo ? 52 : 0)
    page.drawText('PINNACLE', { x: hx, y: y - 6, size: 16, font: bold, color: NAVY })
    page.drawText('MANAGEMENT VENTURES', { x: hx, y: y - 20, size: 7, font: bold, color: GOLD })
    page.drawText(FIRM_TAGLINE, { x: hx, y: y - 31, size: 8, font: regular, color: SLATE })
    let ay = y - 6
    for (const line of [FIRM_REGION, FIRM_PHONE, FIRM_SITE_HOST]) {
      page.drawText(line, { x: 612 - PAD - regular.widthOfTextAtSize(line, 8), y: ay, size: 8, font: regular, color: SLATE })
      ay -= 11
    }
    page.drawRectangle({ x: PAD, y: y - 54, width: CONTENT_W, height: 1.4, color: GOLD })
    y -= 72
  }
  if (branded) letterhead()

  const wordsFor = (runs: ExportRun[], size: number): Word[] => {
    const words: Word[] = []
    for (const r of runs) {
      const font = r.bold ? (r.italic ? boldItalic : bold) : r.italic ? italic : regular
      const color = r.href ? NAVY : INK
      const underline = !!r.underline || !!r.href
      const parts = r.text.split('\n')
      parts.forEach((part, pi) => {
        part.split(' ').forEach((tok, ti) => {
          if (!tok) return
          const spaceBefore = pi > 0 || ti > 0 || (ti === 0 && part.startsWith(' '))
          words.push({ text: toWinAnsi(tok), font, size, color, underline, spaceBefore })
        })
        if (pi < parts.length - 1) words.push({ text: '', font: regular, size, color: INK, underline: false, spaceBefore: true, br: true })
      })
    }
    return words
  }
  const drawRuns = (runs: ExportRun[], size: number, x0: number, right: number, lineHeight: number, gap: number) => {
    if (!runs.length) return
    let x = x0
    for (const w of wordsFor(runs, size)) {
      if (w.br) { x = x0; y -= lineHeight; if (y < 44) { footer(); newPage(); x = x0 } continue }
      if (!w.text) continue
      const ww = w.font.widthOfTextAtSize(w.text, size)
      const spaceW = w.spaceBefore ? regular.widthOfTextAtSize(' ', size) : 0
      if (x + spaceW + ww > right && x > x0) { x = x0; y -= lineHeight; if (y < 44) { footer(); newPage() } }
      if (w.spaceBefore) x += spaceW
      page.drawText(w.text, { x, y, size, font: w.font, color: w.color })
      if (w.underline) page.drawLine({ start: { x, y: y - 1.6 }, end: { x: x + ww, y: y - 1.6 }, thickness: 0.6, color: w.color })
      x += ww
    }
    y -= gap
  }

  for (const b of blocks) {
    if (b.kind === 'hr') {
      ensure(16)
      page.drawLine({ start: { x: PAD, y: y - 4 }, end: { x: 612 - PAD, y: y - 4 }, thickness: 0.8, color: SLATE })
      y -= 14
      continue
    }
    if (b.kind === 'heading') {
      const size = b.level === 1 ? 17 : b.level === 2 ? 14 : 12
      ensure(30)
      y -= b.level === 1 ? 12 : 8
      drawRuns(b.runs, size, PAD, 612 - PAD, size * 1.35, 6)
      continue
    }
    if (b.kind === 'quote') {
      ensure(26)
      drawRuns(b.runs, 10.5, PAD + 24, 612 - PAD - 24, 15, 8)
      continue
    }
    if (b.kind === 'listitem') {
      ensure(20)
      const marker = b.ordered ? `${b.index}.` : '•'
      drawRuns([{ text: marker, bold: true }], 11, PAD, 612 - PAD, 15.4, 0)
      y -= 15.4
      if (y < 44) { footer(); newPage() }
      drawRuns(b.runs, 11, PAD + 20, 612 - PAD, 15.4, 4)
      continue
    }
    ensure(20)
    drawRuns(b.runs, 11, PAD, 612 - PAD, 15.4, 5)
  }
  footer()
  return pdf.save({ useObjectStreams: false })
}