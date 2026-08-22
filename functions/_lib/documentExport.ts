// Letterhead PDF export for the Document Hub.
//
// The rule here is that the PDF is the on-screen page, printed. Every size,
// colour and gap comes from shared/documentTheme, which is the same module the
// editor stylesheet is driven from, so there is no second copy of the
// letterhead to drift out of sync. Before this, the export set the body in
// Helvetica while the editor set it in Georgia, broke the firm name across two
// lines, drew a gold rule where the screen draws a sand one, and shrank the
// crest to roughly half the size the author saw.

import { PDFDocument, StandardFonts, popGraphicsState, pushGraphicsState, rgb, setCharacterSpacing, type Color, type PDFFont, type PDFPage } from 'pdf-lib'
import { FIRM_NAME, FIRM_PHONE, FIRM_REGION, FIRM_SITE_HOST, FIRM_TAGLINE, SUPPORT_EMAIL } from '../../shared/letterhead'
import { docMargins, docPageSize } from '../../shared/docLayout'
import {
  DOC_BODY, DOC_COLOPHON, DOC_COLOR, DOC_LETTERHEAD, DOC_SIGNATURE, DOC_TABLE,
  docHeading, pt, type DocFontGenre,
} from '../../shared/documentTheme'
import { parseHtml, type ExportAlign, type ExportCell, type ExportRun } from './officeExport'

const WIN_ANSI_EXTRA = new Set(
  '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
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

function hex(value: string): Color {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(value || '').trim())
  if (!m) return rgb(0, 0, 0)
  const n = parseInt(m[1], 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

type FontFamily = { regular: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont }
type FontSet = Record<DocFontGenre, FontFamily>

function faceFor(fonts: FontSet, genre: DocFontGenre, bold?: boolean, italic?: boolean): PDFFont {
  const family = fonts[genre]
  return bold ? (italic ? family.boldItalic : family.bold) : italic ? family.italic : family.regular
}

// Text style resolved down to something drawable.
type Style = { font: PDFFont; size: number; color: Color; underline: boolean; strike: boolean; highlight?: Color }
type Token = { text: string; style: Style; space: boolean; br?: boolean }
type Line = { tokens: Token[]; width: number; height: number; ascent: number }

// Letter-spacing, which pdf-lib has no concept of. The letterhead tagline and
// the colophon are both tracked on screen, and drawing them untracked is the
// difference between "PROPERTY · DOCUMENTS · OPERATIONS" and a cramped run of
// small caps that does not look like the same letterhead.
function trackedWidth(text: string, font: PDFFont, size: number, tracking: number): number {
  const body = toWinAnsi(text)
  if (!body) return 0
  return font.widthOfTextAtSize(body, size) + tracking * Math.max(0, body.length - 1)
}

function drawTracked(page: PDFPage, text: string, opts: { x: number; y: number; size: number; font: PDFFont; color: Color; tracking: number }) {
  const body = toWinAnsi(text)
  if (!body) return
  if (!opts.tracking) {
    page.drawText(body, { x: opts.x, y: opts.y, size: opts.size, font: opts.font, color: opts.color })
    return
  }
  // Tc (character spacing) applies to the whole string, so the line stays one
  // selectable, searchable run. Drawing it a glyph at a time would also work
  // but registers a fresh font resource per character and leaves the reader
  // with text nobody can copy.
  page.pushOperators(pushGraphicsState(), setCharacterSpacing(opts.tracking))
  page.drawText(body, { x: opts.x, y: opts.y, size: opts.size, font: opts.font, color: opts.color })
  page.pushOperators(setCharacterSpacing(0), popGraphicsState())
}

export async function buildPdf(input: { title: string; html: string; branded?: boolean; logoBytes?: Uint8Array | ArrayBuffer | null; pageSize?: string | null; margins?: string | null }): Promise<Uint8Array> {
  const branded = !!input.branded
  const pageDef = docPageSize(input.pageSize)
  const m = docMargins(input.margins)
  const PAGE_W = pageDef.pt.w
  const PAGE_H = pageDef.pt.h
  const PAD = m.x
  const CONTENT_W = PAGE_W - PAD * 2

  const pdf = await PDFDocument.create()
  pdf.setTitle(`${input.title} - ${FIRM_NAME}`)
  pdf.setAuthor(FIRM_NAME)
  pdf.setSubject('Pinnacle Management Ventures document export')
  pdf.setProducer(FIRM_NAME)
  pdf.setCreator(FIRM_NAME)

  // Georgia cannot be embedded from a Worker without shipping the font file,
  // and Times is the next name in the editor's own stack
  // (Georgia, "Times New Roman", serif), so a reader sees the fallback the
  // browser would have picked rather than a different genre of typeface.
  const fonts: FontSet = {
    serif: {
      regular: await pdf.embedFont(StandardFonts.TimesRoman),
      bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
      italic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
      boldItalic: await pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
    },
    sans: {
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
      boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    },
    mono: {
      regular: await pdf.embedFont(StandardFonts.Courier),
      bold: await pdf.embedFont(StandardFonts.CourierBold),
      italic: await pdf.embedFont(StandardFonts.CourierOblique),
      boldItalic: await pdf.embedFont(StandardFonts.CourierBoldOblique),
    },
  }

  let logo: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null
  if (input.logoBytes) {
    try { logo = await pdf.embedPng(input.logoBytes) } catch { try { logo = await pdf.embedJpg(input.logoBytes) } catch { logo = null } }
  }

  const INK = hex(DOC_COLOR.ink)
  const HEADING = hex(DOC_COLOR.heading)
  const LINK = hex(DOC_COLOR.link)
  const META = hex(DOC_COLOR.meta)
  const ASIDE = hex(DOC_COLOR.aside)
  const RULE = hex(DOC_COLOR.rule)
  const HR = hex(DOC_COLOR.hr)
  const QUOTE_TEXT = hex(DOC_COLOR.quoteText)
  const QUOTE_RULE = hex(DOC_COLOR.quoteRule)
  const TABLE_RULE = hex(DOC_COLOR.tableRule)
  const TABLE_HEAD = hex(DOC_COLOR.tableHeadFill)
  const COLOPHON = hex(DOC_COLOR.colophon)
  const COLOPHON_RULE = hex(DOC_COLOR.colophonRule)
  const SIG_RULE = hex(DOC_COLOR.sigRule)
  const SIG_LABEL = hex(DOC_COLOR.sigLabel)

  const BODY_SIZE = pt(DOC_BODY.sizePx)
  const BODY_LEADING = BODY_SIZE * DOC_BODY.lineHeight

  // Where the colophon sits, measured up from the bottom edge, mirroring
  // .doc-colophon: page margin, then the line of text, then its top padding,
  // then the rule.
  const colophonTextH = pt(DOC_COLOPHON.sizePx) * 1.4
  const colophonRuleY = m.bottom + colophonTextH + pt(DOC_COLOPHON.topPadPx)
  const CONTENT_BOTTOM = colophonRuleY + pt(DOC_COLOPHON.topGapPx)

  let page = pdf.addPage([PAGE_W, PAGE_H])
  // y is the top edge of the next line box, never a baseline.
  let y = PAGE_H - m.top

  const colophon = () => {
    const size = pt(DOC_COLOPHON.sizePx)
    const tracking = size * DOC_COLOPHON.trackingEm
    const font = fonts.sans.regular
    page.drawRectangle({ x: PAD, y: colophonRuleY, width: CONTENT_W, height: pt(DOC_COLOPHON.rulePx), color: COLOPHON_RULE })
    const baseline = m.bottom + (colophonTextH - size) / 2
    const left = FIRM_NAME.toUpperCase()
    const middle = 'CONFIDENTIAL'
    const right = SUPPORT_EMAIL.toUpperCase()
    drawTracked(page, left, { x: PAD, y: baseline, size, font, color: COLOPHON, tracking })
    if (!branded) return
    drawTracked(page, middle, { x: PAD + (CONTENT_W - trackedWidth(middle, font, size, tracking)) / 2, y: baseline, size, font, color: COLOPHON, tracking })
    drawTracked(page, right, { x: PAGE_W - PAD - trackedWidth(right, font, size, tracking), y: baseline, size, font, color: COLOPHON, tracking })
  }

  const letterhead = () => {
    const L = DOC_LETTERHEAD
    const crestW = pt(L.crestWidthPx)
    const crestH = pt(L.crestHeightPx)
    const rowTop = PAGE_H - m.top
    if (logo) {
      const scaled = logo.scaleToFit(crestW, crestH)
      page.drawImage(logo, { x: PAD, y: rowTop - crestH + (crestH - scaled.height) / 2, width: scaled.width, height: scaled.height })
    }
    const textX = PAD + (logo ? crestW + pt(L.crestGapPx) : 0)

    const nameSize = pt(L.namePx)
    const nameFont = fonts.serif.bold
    const nameLine = nameSize * L.nameLineHeight
    const metaSize = pt(L.metaPx)
    const metaFont = fonts.sans.regular
    const metaLine = metaSize * 1.2
    const blockH = nameLine + pt(L.metaTopPx) + metaLine
    // align-items:center on the letterhead grid centres the name block and the
    // contact column against the crest, which is the tallest item in the row.
    let cursor = rowTop - (crestH - blockH) / 2
    drawTracked(page, FIRM_NAME, {
      x: textX,
      y: cursor - (nameLine - nameFont.heightAtSize(nameSize)) / 2 - nameFont.heightAtSize(nameSize, { descender: false }),
      size: nameSize, font: nameFont, color: HEADING, tracking: nameSize * L.nameTrackingEm,
    })
    cursor -= nameLine + pt(L.metaTopPx)
    drawTracked(page, FIRM_TAGLINE.toUpperCase(), {
      x: textX,
      y: cursor - (metaLine - metaFont.heightAtSize(metaSize)) / 2 - metaFont.heightAtSize(metaSize, { descender: false }),
      size: metaSize, font: metaFont, color: META, tracking: metaSize * L.metaTrackingEm,
    })

    const asideSize = pt(L.asidePx)
    const asideFont = fonts.sans.regular
    const asideLine = asideSize * L.asideLineHeight
    const asideLines = [FIRM_REGION, FIRM_PHONE, FIRM_SITE_HOST]
    let asideTop = rowTop - (crestH - asideLine * asideLines.length) / 2
    for (const line of asideLines) {
      page.drawText(toWinAnsi(line), {
        x: PAGE_W - PAD - asideFont.widthOfTextAtSize(toWinAnsi(line), asideSize),
        y: asideTop - (asideLine - asideFont.heightAtSize(asideSize)) / 2 - asideFont.heightAtSize(asideSize, { descender: false }),
        size: asideSize, font: asideFont, color: ASIDE,
      })
      asideTop -= asideLine
    }

    // The screen rule is a hairline that fades out over the outer 8% at each
    // end. Six steps a side is enough to read as the same rule in print.
    const ruleY = rowTop - crestH - pt(L.bottomPadPx)
    const ruleH = pt(L.rulePx)
    const fade = CONTENT_W * 0.08
    const steps = 6
    page.drawRectangle({ x: PAD + fade, y: ruleY, width: CONTENT_W - fade * 2, height: ruleH, color: RULE })
    for (let i = 0; i < steps; i++) {
      const opacity = (i + 1) / (steps + 1)
      const w = fade / steps
      page.drawRectangle({ x: PAD + fade - (i + 1) * w, y: ruleY, width: w, height: ruleH, color: RULE, opacity })
      page.drawRectangle({ x: PAGE_W - PAD - fade + i * w, y: ruleY, width: w, height: ruleH, color: RULE, opacity: 1 - opacity })
    }
    y = ruleY - pt(L.bodyTopPx)
  }

  // The letterhead is stationery: it belongs on the first page, the way the
  // editor shows exactly one of it above the body. Continuation pages carry
  // only the colophon.
  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H])
    y = PAGE_H - m.top
  }
  const breakPage = () => {
    colophon()
    newPage()
  }
  const ensure = (height: number) => {
    if (y - height < CONTENT_BOTTOM) breakPage()
  }

  if (branded) letterhead()

  // -------------------------------------------------------------------------
  // Inline layout
  // -------------------------------------------------------------------------

  type RunContext = { size: number; genre: DocFontGenre; color: Color; bold?: boolean }

  const tokenize = (runs: ExportRun[], ctx: RunContext): Token[] => {
    const tokens: Token[] = []
    let pendingSpace = false
    for (const run of runs) {
      const size = run.sizePx ? pt(run.sizePx) : ctx.size
      const genre = run.family ?? ctx.genre
      const style: Style = {
        font: faceFor(fonts, genre, run.bold || ctx.bold, run.italic),
        size,
        color: run.color ? hex(run.color) : run.href ? LINK : ctx.color,
        underline: !!run.underline || !!run.href,
        strike: !!run.strike,
        highlight: run.highlight ? hex(run.highlight) : undefined,
      }
      run.text.split('\n').forEach((part, pi) => {
        if (pi) { tokens.push({ text: '', style, space: false, br: true }); pendingSpace = false }
        for (const piece of part.split(/(\s+)/)) {
          if (!piece) continue
          if (/^\s+$/.test(piece)) { pendingSpace = true; continue }
          tokens.push({ text: toWinAnsi(piece), style, space: pendingSpace })
          pendingSpace = false
        }
      })
    }
    return tokens
  }

  const spaceWidth = (style: Style) => style.font.widthOfTextAtSize(' ', style.size)

  const wrap = (tokens: Token[], width: number, lineHeightRatio: number): Line[] => {
    const lines: Line[] = []
    let current: Token[] = []
    let used = 0
    const measure = (items: Token[]): Line => {
      let maxSize = 0
      let ascent = 0
      let w = 0
      items.forEach((token, i) => {
        if (i && token.space) w += spaceWidth(token.style)
        w += token.style.font.widthOfTextAtSize(token.text, token.style.size)
        if (token.style.size > maxSize) maxSize = token.style.size
        const a = token.style.font.heightAtSize(token.style.size, { descender: false })
        if (a > ascent) ascent = a
      })
      const size = maxSize || tokens[0]?.style.size || BODY_SIZE
      const height = size * lineHeightRatio
      return { tokens: items, width: w, height, ascent: ascent || size * 0.75 }
    }
    const commit = () => {
      lines.push(measure(current))
      current = []
      used = 0
    }
    for (const token of tokens) {
      if (token.br) { commit(); continue }
      const gap = current.length && token.space ? spaceWidth(token.style) : 0
      const w = token.style.font.widthOfTextAtSize(token.text, token.style.size)
      if (current.length && used + gap + w > width) commit()
      current.push(token)
      used += (current.length > 1 && token.space ? spaceWidth(token.style) : 0) + w
    }
    if (current.length) commit()
    return lines.length ? lines : []
  }

  const drawLine = (line: Line, x0: number, width: number, align: ExportAlign, last: boolean) => {
    // CSS half-leading: the extra space in the line box is split above and
    // below the text, then the baseline sits one ascent down from there.
    const tallest = line.tokens.reduce((max, t) => Math.max(max, t.style.font.heightAtSize(t.style.size)), 0)
    const b = y - (line.height - tallest) / 2 - line.ascent
    const slack = width - line.width
    let x = x0
    let extra = 0
    if (align === 'center') x += Math.max(0, slack) / 2
    else if (align === 'right') x += Math.max(0, slack)
    else if (align === 'justify' && !last && line.tokens.length > 1 && slack > 0) extra = slack / (line.tokens.length - 1)
    line.tokens.forEach((token, i) => {
      if (i) x += (token.space ? spaceWidth(token.style) : 0) + extra
      const w = token.style.font.widthOfTextAtSize(token.text, token.style.size)
      if (token.style.highlight) page.drawRectangle({ x: x - 0.5, y: b - token.style.size * 0.22, width: w + 1, height: token.style.size * 1.12, color: token.style.highlight })
      page.drawText(token.text, { x, y: b, size: token.style.size, font: token.style.font, color: token.style.color })
      const stroke = Math.max(0.5, token.style.size * 0.05)
      if (token.style.underline) page.drawLine({ start: { x, y: b - token.style.size * 0.11 }, end: { x: x + w, y: b - token.style.size * 0.11 }, thickness: stroke, color: token.style.color })
      if (token.style.strike) page.drawLine({ start: { x, y: b + token.style.size * 0.26 }, end: { x: x + w, y: b + token.style.size * 0.26 }, thickness: stroke, color: token.style.color })
      x += w
    })
  }

  const flow = (runs: ExportRun[], ctx: RunContext, opts: { x: number; width: number; lineHeight: number; align?: ExportAlign; gapBefore?: number; gapAfter?: number; rule?: { color: Color; width: number; x: number } }) => {
    const lines = wrap(tokenize(runs, ctx), opts.width, opts.lineHeight)
    if (!lines.length) return
    y -= opts.gapBefore ?? 0
    lines.forEach((line, i) => {
      ensure(line.height)
      if (opts.rule) page.drawRectangle({ x: opts.rule.x, y: y - line.height, width: opts.rule.width, height: line.height, color: opts.rule.color })
      drawLine(line, opts.x, opts.width, opts.align ?? 'left', i === lines.length - 1)
      y -= line.height
    })
    y -= opts.gapAfter ?? 0
  }

  // -------------------------------------------------------------------------
  // Tables
  // -------------------------------------------------------------------------

  const cellLines = (cell: ExportCell, width: number, size: number): Line[] =>
    wrap(tokenize(cell.runs.map((r) => ({ ...r, bold: r.bold || cell.header })), { size, genre: 'serif', color: INK }), width, DOC_BODY.lineHeight)

  const drawTable = (rows: ExportCell[][]) => {
    const columns = Math.max(...rows.map((row) => row.length), 1)
    const colW = CONTENT_W / columns
    const padX = pt(DOC_TABLE.padXPx)
    const padY = pt(DOC_TABLE.padYPx)
    const size = BODY_SIZE * DOC_TABLE.sizeRatio
    const rule = pt(DOC_TABLE.rulePx)
    const header = rows[0]?.every((c) => c.header) ? rows[0] : null

    const drawRow = (row: ExportCell[], repeatHeader: boolean) => {
      const laid = row.map((cell) => cellLines(cell, colW - padX * 2, size))
      const height = Math.max(...laid.map((lines) => lines.reduce((sum, l) => sum + l.height, 0)), size) + padY * 2
      if (y - height < CONTENT_BOTTOM) {
        breakPage()
        if (repeatHeader && header && row !== header) drawRow(header, false)
      }
      const top = y
      row.forEach((cell, i) => {
        const x = PAD + i * colW
        if (cell.header) page.drawRectangle({ x, y: top - height, width: colW, height, color: TABLE_HEAD })
        page.drawRectangle({ x, y: top - height, width: colW, height, borderColor: TABLE_RULE, borderWidth: rule })
        const saved = y
        y = top - padY
        laid[i].forEach((line, li) => {
          drawLine(line, x + padX, colW - padX * 2, cell.align ?? 'left', li === laid[i].length - 1)
          y -= line.height
        })
        y = saved
      })
      y = top - height
    }
    for (const row of rows) drawRow(row, true)
    y -= pt(DOC_TABLE.gapPx)
  }

  // -------------------------------------------------------------------------
  // Blocks
  // -------------------------------------------------------------------------

  for (const block of parseHtml(input.html)) {
    if (block.kind === 'pagebreak') { breakPage(); continue }
    if (block.kind === 'hr') {
      ensure(pt(DOC_BODY.hrGapPx) * 2 + pt(DOC_BODY.hrRulePx))
      y -= pt(DOC_BODY.hrGapPx)
      page.drawRectangle({ x: PAD, y, width: CONTENT_W, height: pt(DOC_BODY.hrRulePx), color: HR })
      y -= pt(DOC_BODY.hrGapPx)
      continue
    }
    if (block.kind === 'signature') {
      const S = DOC_SIGNATURE
      const labelSize = pt(S.labelPx)
      ensure(pt(S.topPx + S.ruleHeightPx + S.labelTopPx) + labelSize + pt(S.bottomPx))
      y -= pt(S.topPx + S.ruleHeightPx)
      page.drawRectangle({ x: PAD, y, width: pt(S.widthPx), height: pt(S.rulePx), color: SIG_RULE })
      y -= pt(S.labelTopPx) + labelSize
      drawTracked(page, block.label.toUpperCase(), { x: PAD, y, size: labelSize, font: fonts.sans.regular, color: SIG_LABEL, tracking: labelSize * S.labelTrackingEm })
      y -= pt(S.bottomPx)
      continue
    }
    if (block.kind === 'image') {
      // The editor inserts images by URL. A Worker fetching an arbitrary
      // author-supplied URL at export time is a request-forgery surface, so the
      // export marks the position instead of quietly leaving a hole.
      const size = BODY_SIZE * 0.8
      const label = toWinAnsi(block.alt ? `[Image: ${block.alt}]` : '[Image]')
      ensure(size * 2.4)
      y -= size * 0.6
      page.drawText(label, { x: PAD, y: y - size, size, font: fonts.sans.italic, color: ASIDE })
      y -= size * 1.8
      continue
    }
    if (block.kind === 'table') { drawTable(block.rows); continue }
    if (block.kind === 'heading') {
      const h = docHeading(block.level)
      flow(block.runs, { size: pt(h.sizePx), genre: 'serif', color: HEADING, bold: true }, {
        x: PAD, width: CONTENT_W, lineHeight: 1.25, align: block.align,
        gapBefore: pt(h.topPx), gapAfter: pt(h.bottomPx),
      })
      continue
    }
    if (block.kind === 'quote') {
      const x = PAD + pt(DOC_BODY.quoteRulePx + DOC_BODY.quoteIndentPx)
      flow(block.runs, { size: BODY_SIZE, genre: 'serif', color: QUOTE_TEXT }, {
        x, width: PAGE_W - PAD - x, lineHeight: DOC_BODY.lineHeight, align: block.align,
        gapBefore: pt(DOC_BODY.quoteGapPx), gapAfter: pt(DOC_BODY.quoteGapPx),
        rule: { color: QUOTE_RULE, width: pt(DOC_BODY.quoteRulePx), x: PAD },
      })
      continue
    }
    if (block.kind === 'pre') {
      flow(block.runs, { size: pt(DOC_BODY.monoSizePx), genre: 'mono', color: INK }, {
        x: PAD, width: CONTENT_W, lineHeight: 1.4, align: block.align,
        gapAfter: pt(DOC_BODY.paragraphGapPx),
      })
      continue
    }
    if (block.kind === 'listitem') {
      const indent = pt(DOC_BODY.listIndentPx)
      const marker = block.ordered ? `${block.index}.` : '•'
      ensure(BODY_LEADING)
      page.drawText(toWinAnsi(marker), {
        x: PAD + indent - fonts.serif.regular.widthOfTextAtSize(toWinAnsi(marker), BODY_SIZE) - pt(5),
        y: y - (BODY_LEADING - fonts.serif.regular.heightAtSize(BODY_SIZE)) / 2 - fonts.serif.regular.heightAtSize(BODY_SIZE, { descender: false }),
        size: BODY_SIZE, font: fonts.serif.regular, color: INK,
      })
      flow(block.runs, { size: BODY_SIZE, genre: 'serif', color: INK }, {
        x: PAD + indent, width: CONTENT_W - indent, lineHeight: DOC_BODY.lineHeight, align: block.align,
        gapAfter: pt(DOC_BODY.listGapTopPx / 2),
      })
      continue
    }
    flow(block.runs, { size: BODY_SIZE, genre: 'serif', color: INK }, {
      x: PAD, width: CONTENT_W, lineHeight: DOC_BODY.lineHeight, align: block.align,
      gapAfter: pt(DOC_BODY.paragraphGapPx),
    })
  }

  colophon()
  return pdf.save({ useObjectStreams: false })
}
