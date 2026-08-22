// DOCX (OOXML package) export builder. The package is a real ZIP archive with
// stored entries: Word, Google Docs, LibreOffice and previewers all open it.
// Letterhead, confidentiality footer, heading/list/quote styles, hyperlinks
// and the inline crest are all preserved so the exported file matches the
// on-screen letter.

import { FIRM_NAME, FIRM_PHONE, FIRM_REGION, FIRM_SITE_HOST, FIRM_TAGLINE, SUPPORT_EMAIL } from '../../shared/letterhead'
import { DOC_BODY, DOC_COLOPHON, DOC_COLOR, DOC_LETTERHEAD, DOC_SIGNATURE, DOC_TABLE, PT_PER_PX, docHeading, fontGenre, halfPt, pt, twips, type DocFontGenre } from '../../shared/documentTheme'
import { docMarginsScreen, docPageSize } from '../../shared/docLayout'

// ---------------------------------------------------------------------------
// CRC32 + minimal ZIP writer (stored entries)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

type ZipEntry = { name: string; data: Uint8Array }

export function zipStore(entries: ZipEntry[]): Uint8Array {
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  const enc = new TextEncoder()
  let offset = 0
  for (const e of entries) {
    const name = enc.encode(e.name)
    const crc = crc32(e.data)
    const size = e.data.length
    const lh = new Uint8Array(30)
    const dv = new DataView(lh.buffer)
    dv.setUint32(0, 0x04034b50, true)
    dv.setUint16(4, 20, true)
    dv.setUint16(6, 0x0800, true)
    dv.setUint16(8, 0, true)
    dv.setUint16(10, 0, true)
    dv.setUint16(12, 0x0021, true)
    dv.setUint32(14, crc, true)
    dv.setUint32(18, size, true)
    dv.setUint32(22, size, true)
    dv.setUint16(26, name.length, true)
    local.push(lh, name, e.data)
    const ch = new Uint8Array(46)
    const cdv = new DataView(ch.buffer)
    cdv.setUint32(0, 0x02014b50, true)
    cdv.setUint16(4, 20, true)
    cdv.setUint16(6, 20, true)
    cdv.setUint16(8, 0x0800, true)
    cdv.setUint16(10, 0, true)
    cdv.setUint16(12, 0, true)
    cdv.setUint16(14, 0x0021, true)
    cdv.setUint32(16, crc, true)
    cdv.setUint32(20, size, true)
    cdv.setUint32(24, size, true)
    cdv.setUint16(28, name.length, true)
    cdv.setUint32(42, offset, true)
    central.push(ch, name)
    offset += 30 + name.length + size
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0)
  const eocd = new Uint8Array(22)
  const edv = new DataView(eocd.buffer)
  edv.setUint32(0, 0x06054b50, true)
  edv.setUint16(8, entries.length, true)
  edv.setUint16(10, entries.length, true)
  edv.setUint32(12, cdSize, true)
  edv.setUint32(16, offset, true)
  const out = new Uint8Array(offset + cdSize + 22)
  let p = 0
  for (const part of [...local, ...central, eocd]) { out.set(part, p); p += part.length }
  return out
}

export function sanitizeFilename(name: string): string {
  const clean = String(name || 'document')
    .replace(/["\\/:*?<>|]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
  return clean || 'document'
}

// ---------------------------------------------------------------------------
// Editor HTML → structured blocks/runs (shared by DOCX + PDF builders)
// ---------------------------------------------------------------------------

export type ExportAlign = 'left' | 'center' | 'right' | 'justify'

// A run is a span of text with one look. Colour, size and font genre are
// carried here because the ribbon offers all three and, before this, every one
// of them was dropped on the floor at export time: the picker changed the
// screen and changed nothing in the PDF or the .docx.
export type ExportRun = {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  href?: string
  color?: string // #rrggbb
  highlight?: string // #rrggbb
  sizePx?: number
  family?: DocFontGenre
}

export type ExportCell = { runs: ExportRun[]; header: boolean; align?: ExportAlign }

export type ExportBlock =
  | { kind: 'heading'; level: number; align?: ExportAlign; runs: ExportRun[] }
  | { kind: 'paragraph'; align?: ExportAlign; runs: ExportRun[] }
  | { kind: 'pre'; align?: ExportAlign; runs: ExportRun[] }
  | { kind: 'listitem'; ordered: boolean; index: number; align?: ExportAlign; runs: ExportRun[] }
  | { kind: 'quote'; align?: ExportAlign; runs: ExportRun[] }
  | { kind: 'hr' }
  | { kind: 'pagebreak' }
  | { kind: 'signature'; label: string }
  | { kind: 'image'; alt: string }
  | { kind: 'table'; rows: ExportCell[][] }

type BlockKind = 'heading' | 'paragraph' | 'listitem' | 'quote' | 'pre'
type PendingBlock = { kind: BlockKind; level: number; ordered: boolean; index: number; align?: ExportAlign; runs: ExportRun[] }

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre'])
const INLINE_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'ins', 'strike', 's', 'del', 'a', 'span', 'font', 'sub', 'sup', 'small', 'label', 'mark', 'code'])
const DROP_TAGS = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'colgroup', 'col'])

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function stripTags(html: string): string {
  return decodeHtmlEntities(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ')
}

const NAMED_COLORS: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff',
  yellow: '#ffff00', grey: '#808080', gray: '#808080', silver: '#c0c0c0', navy: '#000080',
  maroon: '#800000', olive: '#808000', purple: '#800080', teal: '#008080', orange: '#ffa500',
}

// Editor colours arrive as rgb() (execCommand with styleWithCSS), as #hex from
// our own pickers, or as a colour keyword from pasted content. All three have
// to reach the exporters as #rrggbb or the run silently renders in body ink.
export function normalizeColor(raw: string | null | undefined): string | undefined {
  const v = String(raw || '').trim().toLowerCase()
  if (!v || v === 'transparent' || v === 'inherit' || v === 'initial' || v === 'unset' || v === 'currentcolor') return undefined
  const rgb = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?)\s*)?\)$/)
  if (rgb) {
    if (rgb[4] !== undefined && Number(String(rgb[4]).replace('%', '')) === 0) return undefined
    return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, '0')).join('')}`
  }
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
  if (hex) return hex[1].length === 3 ? `#${hex[1].split('').map((c) => c + c).join('')}` : `#${hex[1]}`
  return NAMED_COLORS[v]
}

export function cssSizeToPx(raw: string | null | undefined): number | undefined {
  const v = String(raw || '').trim().toLowerCase()
  let m = v.match(/^([\d.]+)px$/)
  if (m) return Number(m[1])
  m = v.match(/^([\d.]+)pt$/)
  if (m) return Number(m[1]) / PT_PER_PX
  m = v.match(/^([\d.]+)r?em$/)
  if (m) return Number(m[1]) * DOC_BODY.sizePx
  m = v.match(/^([\d.]+)%$/)
  if (m) return (Number(m[1]) / 100) * DOC_BODY.sizePx
  return undefined
}

function styleMap(attrsRaw: string): Record<string, string> {
  const m = attrsRaw.match(/style\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const part of (m[1] ?? m[2] ?? '').split(';')) {
    const i = part.indexOf(':')
    if (i < 0) continue
    out[part.slice(0, i).trim().toLowerCase()] = decodeHtmlEntities(part.slice(i + 1).trim())
  }
  return out
}

function attrValue(attrsRaw: string, name: string): string | undefined {
  const m = attrsRaw.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? decodeHtmlEntities(m[1] ?? m[2] ?? m[3] ?? '') : undefined
}

function alignFrom(attrsRaw: string): ExportAlign | undefined {
  const raw = (styleMap(attrsRaw)['text-align'] || attrValue(attrsRaw, 'align') || '').toLowerCase()
  if (raw === 'center' || raw === 'right' || raw === 'justify' || raw === 'left') return raw
  if (raw === 'start') return 'left'
  if (raw === 'end') return 'right'
  return undefined
}

type InlineStyle = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  highlight?: string
  sizePx?: number
  family?: DocFontGenre
  href?: string
}

// <font size="1..7"> is legacy but execCommand still emits it, and our own
// applyFontSize leans on size="7" as a marker before rewriting it.
const FONT_SIZE_PX = [10, 13, 16, 18, 24, 32, 48]

function inlineStyleFor(tag: string, attrsRaw: string): InlineStyle {
  const st: InlineStyle = {}
  if (tag === 'b' || tag === 'strong') st.bold = true
  if (tag === 'i' || tag === 'em') st.italic = true
  if (tag === 'u' || tag === 'ins') st.underline = true
  if (tag === 'strike' || tag === 's' || tag === 'del') st.strike = true
  if (tag === 'code') st.family = 'mono'
  if (tag === 'a') st.href = attrValue(attrsRaw, 'href')
  if (tag === 'font') {
    st.color = normalizeColor(attrValue(attrsRaw, 'color'))
    st.family = attrValue(attrsRaw, 'face') ? fontGenre(attrValue(attrsRaw, 'face')) : undefined
    const legacy = Number(attrValue(attrsRaw, 'size'))
    if (legacy >= 1 && legacy <= 7) st.sizePx = FONT_SIZE_PX[legacy - 1]
  }
  const css = styleMap(attrsRaw)
  const weight = (css['font-weight'] || '').toLowerCase()
  if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) st.bold = true
  if (weight === 'normal' || Number(weight) === 400) st.bold = false
  const slant = (css['font-style'] || '').toLowerCase()
  if (slant === 'italic' || slant === 'oblique') st.italic = true
  const deco = (css['text-decoration'] || css['text-decoration-line'] || '').toLowerCase()
  if (deco.includes('underline')) st.underline = true
  if (deco.includes('line-through')) st.strike = true
  const color = normalizeColor(css['color'])
  if (color) st.color = color
  const bg = normalizeColor(css['background-color'] || css['background'])
  if (bg) st.highlight = bg
  const size = cssSizeToPx(css['font-size'])
  if (size) st.sizePx = size
  if (css['font-family']) st.family = fontGenre(css['font-family'])
  return st
}

function parseTable(inner: string): ExportCell[][] {
  const rows: ExportCell[][] = []
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let r: RegExpExecArray | null
  while ((r = rowRe.exec(inner))) {
    const cells: ExportCell[] = []
    const cellRe = /<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi
    let c: RegExpExecArray | null
    while ((c = cellRe.exec(r[1]))) {
      const runs: ExportRun[] = []
      for (const b of parseHtml(c[3])) {
        if (b.kind !== 'heading' && b.kind !== 'paragraph' && b.kind !== 'pre' && b.kind !== 'listitem' && b.kind !== 'quote') continue
        if (runs.length) runs.push({ text: '\n' })
        runs.push(...b.runs)
      }
      cells.push({ runs, header: c[1].toLowerCase() === 'th', align: alignFrom(c[2]) })
    }
    if (cells.length) rows.push(cells)
  }
  return rows
}

// Tables, signature lines and page breaks are all things the Insert menu can
// put on the page, and all three used to vanish (or flatten into a run-on
// paragraph) on export. Lifting them out before the linear scan keeps the
// scanner simple and gives each one a real block of its own.
function extractSpecials(html: string): { html: string; tables: ExportCell[][][]; signatures: string[] } {
  const tables: ExportCell[][][] = []
  const signatures: string[] = []
  let out = String(html || '')
  out = out.replace(/<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bdoc-pagebreak\b[^"]*"|'[^']*\bdoc-pagebreak\b[^']*')[^>]*>[\s\S]*?<\/div>/gi, '<pmvbreak>')
  out = out.replace(/<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bdoc-sigline\b[^"]*"|'[^']*\bdoc-sigline\b[^']*')[^>]*>([\s\S]*?)<\/div>/gi, (_m, innerHtml: string) => {
    signatures.push(stripTags(innerHtml).trim() || 'Signature')
    return `<pmvsig i="${signatures.length - 1}">`
  })
  out = out.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_m, innerHtml: string) => {
    tables.push(parseTable(innerHtml))
    return `<pmvtable i="${tables.length - 1}">`
  })
  return { html: out, tables, signatures }
}

export function parseHtml(html: string): ExportBlock[] {
  const source = extractSpecials(html)
  const blocks: ExportBlock[] = []
  let cur: PendingBlock | null = null
  let listMode: 'ol' | 'ul' | null = null
  let liIndex = 0
  let dropDepth = 0
  const inline: { tag: string; style: InlineStyle }[] = []

  const folded = (): InlineStyle => {
    const out: InlineStyle = {}
    for (const s of inline) {
      if (s.style.bold !== undefined) out.bold = s.style.bold
      if (s.style.italic !== undefined) out.italic = s.style.italic
      if (s.style.underline !== undefined) out.underline = s.style.underline
      if (s.style.strike !== undefined) out.strike = s.style.strike
      if (s.style.color) out.color = s.style.color
      if (s.style.highlight) out.highlight = s.style.highlight
      if (s.style.sizePx) out.sizePx = s.style.sizePx
      if (s.style.family) out.family = s.style.family
      if (s.style.href) out.href = s.style.href
    }
    return out
  }
  const open = (kind: BlockKind, level: number, align?: ExportAlign) => {
    cur = { kind, level, ordered: kind === 'listitem' && listMode === 'ol', index: kind === 'listitem' ? ++liIndex : 0, align, runs: [] }
  }
  const pushText = (raw: string) => {
    // Bare text with no wrapping block is what a fresh document looks like the
    // moment someone starts typing. It used to be discarded outright, so a
    // brand-new letter exported as an empty page.
    if (!cur) open('paragraph', 0)
    const block = cur as PendingBlock
    const text = raw === '\n' ? '\n' : block.kind === 'pre' ? decodeHtmlEntities(raw) : decodeHtmlEntities(raw).replace(/\s+/g, ' ')
    if (!text) return
    const a = folded()
    const run: ExportRun = { text, bold: a.bold, italic: a.italic, underline: a.underline, strike: a.strike, href: a.href, color: a.color, highlight: a.highlight, sizePx: a.sizePx, family: a.family }
    const last = block.runs[block.runs.length - 1]
    if (last && last.bold === run.bold && last.italic === run.italic && last.underline === run.underline && last.strike === run.strike && last.href === run.href && last.color === run.color && last.highlight === run.highlight && last.sizePx === run.sizePx && last.family === run.family) last.text += text
    else block.runs.push(run)
  }
  const flush = () => {
    if (!cur) return
    const block = cur
    cur = null
    if (!block.runs.length) return
    if (block.kind !== 'pre') {
      block.runs[0].text = block.runs[0].text.replace(/^\s+/, '')
      block.runs[block.runs.length - 1].text = block.runs[block.runs.length - 1].text.replace(/\s+$/, '')
    }
    if (!block.runs.some((r) => r.text.trim())) return
    if (block.kind === 'heading') blocks.push({ kind: 'heading', level: block.level, align: block.align, runs: block.runs })
    else if (block.kind === 'listitem') blocks.push({ kind: 'listitem', ordered: block.ordered, index: block.index, align: block.align, runs: block.runs })
    else if (block.kind === 'quote') blocks.push({ kind: 'quote', align: block.align, runs: block.runs })
    else if (block.kind === 'pre') blocks.push({ kind: 'pre', align: block.align, runs: block.runs })
    else blocks.push({ kind: 'paragraph', align: block.align, runs: block.runs })
  }

  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^<>]*)?)\/?>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source.html))) {
    const text = m[4]
    if (text !== undefined) {
      if (!dropDepth) pushText(text)
      continue
    }
    const closing = !!m[1]
    const tag = m[2].toLowerCase()
    const attrsRaw = m[3] || ''
    if (DROP_TAGS.has(tag)) {
      dropDepth = closing ? Math.max(0, dropDepth - 1) : dropDepth + 1
      continue
    }
    if (dropDepth) continue
    if (closing) {
      if (tag === 'ol' || tag === 'ul') { listMode = null; liIndex = 0 }
      else if (INLINE_TAGS.has(tag)) {
        const idx = inline.map((s) => s.tag).lastIndexOf(tag)
        if (idx >= 0) inline.splice(idx, 1)
      } else if (BLOCK_TAGS.has(tag)) flush()
      continue
    }
    if (tag === 'br') { pushText('\n'); continue }
    if (tag === 'hr') { flush(); blocks.push({ kind: 'hr' }); continue }
    if (tag === 'pmvbreak') { flush(); blocks.push({ kind: 'pagebreak' }); continue }
    if (tag === 'pmvsig') { flush(); blocks.push({ kind: 'signature', label: source.signatures[Number(attrValue(attrsRaw, 'i'))] ?? 'Signature' }); continue }
    if (tag === 'pmvtable') {
      flush()
      const rows = source.tables[Number(attrValue(attrsRaw, 'i'))]
      if (rows && rows.length) blocks.push({ kind: 'table', rows })
      continue
    }
    if (tag === 'img') { flush(); blocks.push({ kind: 'image', alt: attrValue(attrsRaw, 'alt') || '' }); continue }
    if (INLINE_TAGS.has(tag)) { inline.push({ tag, style: inlineStyleFor(tag, attrsRaw) }); continue }
    if (tag === 'ol' || tag === 'ul') { listMode = tag; liIndex = 0; continue }
    if (BLOCK_TAGS.has(tag)) {
      flush()
      const kind: BlockKind = tag === 'blockquote' ? 'quote' : tag === 'li' ? 'listitem' : tag === 'pre' ? 'pre' : /^h[1-6]$/.test(tag) ? 'heading' : 'paragraph'
      open(kind, kind === 'heading' ? Number(tag.slice(1)) || 1 : 0, alignFrom(attrsRaw))
    }
  }
  flush()
  return blocks
}

// ---------------------------------------------------------------------------
// DOCX builder
// ---------------------------------------------------------------------------

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const REL_STYLES = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles'
const REL_NUMBERING = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering'
const REL_FOOTER = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer'
const REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
const REL_HYPERLINK = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink'

// Word wants bare RRGGBB, no leading hash.
function wColor(hex: string | undefined, fallback: string): string {
  return String(hex || fallback).replace('#', '').toLowerCase()
}

const DOCX_FONTS: Record<DocFontGenre, string> = {
  serif: 'Georgia',
  sans: 'Calibri',
  mono: 'Courier New',
}

function escXml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function jcXml(align: ExportAlign | undefined): string {
  if (!align || align === 'left') return ''
  return `<w:jc w:val="${align === 'justify' ? 'both' : align}"/>`
}

function runXml(r: ExportRun, hrefId?: string, opts?: { defaultFamily?: DocFontGenre }): string {
  let pr = ''
  const family = r.family ?? opts?.defaultFamily
  if (family) pr += `<w:rFonts w:ascii="${DOCX_FONTS[family]}" w:hAnsi="${DOCX_FONTS[family]}"/>`
  if (r.bold) pr += '<w:b/>'
  if (r.italic) pr += '<w:i/>'
  if (r.underline || hrefId) pr += '<w:u w:val="single"/>'
  if (r.strike) pr += '<w:strike/>'
  if (r.sizePx) pr += `<w:sz w:val="${halfPt(r.sizePx)}"/><w:szCs w:val="${halfPt(r.sizePx)}"/>`
  if (r.color || hrefId) pr += `<w:color w:val="${wColor(r.color, hrefId ? DOC_COLOR.link : DOC_COLOR.ink)}"/>`
  if (r.highlight) pr += `<w:shd w:val="clear" w:color="auto" w:fill="${wColor(r.highlight, '#ffffff')}"/>`
  const rpr = pr ? `<w:rPr>${pr}</w:rPr>` : ''
  const pieces = r.text.split('\n')
  const inner = pieces.map((piece, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${escXml(piece)}</w:t>`).join('')
  const run = `<w:r>${rpr}${inner}</w:r>`
  return hrefId ? `<w:hyperlink r:id="${hrefId}">${run}</w:hyperlink>` : run
}

function runsXml(runs: ExportRun[], hrefIds: Map<string, string>, opts?: { defaultFamily?: DocFontGenre }): string {
  return runs.map((r) => runXml(r, r.href ? hrefIds.get(r.href) : undefined, opts)).join('')
}

function cellXml(cell: ExportCell, width: number, hrefIds: Map<string, string>): string {
  const shd = cell.header ? `<w:shd w:val="clear" w:color="auto" w:fill="${wColor(DOC_COLOR.tableHeadFill, '#f3f5f8')}"/>` : ''
  const runs = cell.runs.map((r) => ({ ...r, bold: r.bold || cell.header }))
  const margin = `<w:tcMar><w:top w:w="${twips(DOC_TABLE.padYPx)}" w:type="dxa"/><w:bottom w:w="${twips(DOC_TABLE.padYPx)}" w:type="dxa"/><w:left w:w="${twips(DOC_TABLE.padXPx)}" w:type="dxa"/><w:right w:w="${twips(DOC_TABLE.padXPx)}" w:type="dxa"/></w:tcMar>`
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shd}${margin}</w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${jcXml(cell.align)}</w:pPr>${runsXml(runs, hrefIds)}</w:p></w:tc>`
}

function tableXml(rows: ExportCell[][], hrefIds: Map<string, string>): string {
  const columns = Math.max(...rows.map((row) => row.length), 1)
  const total = 9360
  const width = Math.floor(total / columns)
  const rule = wColor(DOC_COLOR.tableRule, '#cfd6df')
  const edge = (side: string) => `<w:${side} w:val="single" w:sz="${Math.max(2, Math.round(halfPt(DOC_TABLE.rulePx)))}" w:space="0" w:color="${rule}"/>`
  const borders = `<w:tblBorders>${edge('top')}${edge('left')}${edge('bottom')}${edge('right')}${edge('insideH')}${edge('insideV')}</w:tblBorders>`
  const grid = `<w:tblGrid>${Array.from({ length: columns }, () => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`
  const body = rows.map((row) => `<w:tr>${row.map((cell) => cellXml(cell, width, hrefIds)).join('')}</w:tr>`).join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${borders}</w:tblPr>${grid}${body}</w:tbl><w:p><w:pPr><w:spacing w:after="${twips(DOC_TABLE.gapPx)}"/></w:pPr></w:p>`
}

// The rule is a bottom border on a paragraph indented from the right so it
// stops at the signature line's own width rather than running the full measure.
function signatureXml(label: string, contentPx: number): string {
  const rule = `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${wColor(DOC_COLOR.sigRule, '#1b2430')}"/></w:pBdr>`
  const inset = Math.max(0, contentPx - DOC_SIGNATURE.widthPx)
  const line = `<w:p><w:pPr><w:spacing w:before="${twips(DOC_SIGNATURE.topPx)}" w:after="0"/><w:ind w:right="${twips(inset)}"/>${rule}</w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>`
  const caption = `<w:p><w:pPr><w:spacing w:before="${twips(DOC_SIGNATURE.labelTopPx)}" w:after="${twips(DOC_SIGNATURE.bottomPx)}"/></w:pPr><w:r><w:rPr><w:sz w:val="${halfPt(DOC_SIGNATURE.labelPx)}"/><w:color w:val="${wColor(DOC_COLOR.sigLabel, '#64748b')}"/><w:spacing w:val="${Math.round(twips(DOC_SIGNATURE.labelPx * DOC_SIGNATURE.labelTrackingEm))}"/></w:rPr><w:t>${escXml(label.toUpperCase())}</w:t></w:r></w:p>`
  return line + caption
}

function paragraphXml(b: ExportBlock, hrefIds: Map<string, string>, contentPx: number): string {
  if (b.kind === 'hr') return `<w:p><w:pPr><w:spacing w:before="${twips(DOC_BODY.hrGapPx)}" w:after="${twips(DOC_BODY.hrGapPx)}"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${wColor(DOC_COLOR.hr, '#cbd2db')}"/></w:pBdr></w:pPr></w:p>`
  if (b.kind === 'pagebreak') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
  if (b.kind === 'signature') return signatureXml(b.label, contentPx)
  if (b.kind === 'table') return tableXml(b.rows, hrefIds)
  if (b.kind === 'image') {
    // Inline images live at whatever URL the author pasted. Word cannot follow
    // that from inside the package, so the export names the gap instead of
    // dropping the image without a word.
    return `<w:p><w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="${halfPt(DOC_BODY.sizePx * 0.8)}"/><w:color w:val="${wColor(DOC_COLOR.aside, '#64748b')}"/></w:rPr><w:t>${escXml(b.alt ? `[Image: ${b.alt}]` : '[Image]')}</w:t></w:r></w:p>`
  }
  const runs = runsXml(b.runs, hrefIds, b.kind === 'pre' ? { defaultFamily: 'mono' } : undefined)
  const jc = jcXml(b.align)
  if (b.kind === 'heading') return `<w:p><w:pPr><w:pStyle w:val="Heading${Math.min(Math.max(b.level, 1), 6)}"/>${jc}</w:pPr>${runs}</w:p>`
  if (b.kind === 'quote') return `<w:p><w:pPr><w:pStyle w:val="Quote"/>${jc}</w:pPr>${runs}</w:p>`
  if (b.kind === 'pre') return `<w:p><w:pPr><w:pStyle w:val="HTMLPreformatted"/>${jc}</w:pPr>${runs}</w:p>`
  if (b.kind === 'listitem') return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${b.ordered ? 1 : 2}"/></w:numPr>${jc}</w:pPr>${runs}</w:p>`
  return `<w:p>${jc ? `<w:pPr>${jc}</w:pPr>` : ''}${runs}</w:p>`
}

// EMU per CSS px at 96dpi: 914400 / 96.
function emu(px: number): number {
  return Math.round(px * 9525)
}

const CREST_EMU_W = emu(DOC_LETTERHEAD.crestWidthPx)
const CREST_EMU_H = emu(DOC_LETTERHEAD.crestHeightPx)

const INLINE_CREST = (rid: string) =>
  `<w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${CREST_EMU_W}" cy="${CREST_EMU_H}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Pinnacle Crest"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="Crest"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${CREST_EMU_W}" cy="${CREST_EMU_H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`

// The letterhead, laid out the way the screen lays it out: crest, then the
// firm name over its tagline, then the contact column hard right, then a
// single sand rule. It used to be a two-column table with gold rules above and
// below and the firm name broken across two lines, which is not what anyone
// saw in the editor.
function headerTableXml(logoId: string | null): string {
  const L = DOC_LETTERHEAD
  const total = 9360
  const crestCol = twips(L.crestWidthPx + L.crestGapPx)
  const asideCol = 2400
  const nameCol = total - (logoId ? crestCol : 0) - asideCol
  const crestCell = logoId
    ? `<w:tc><w:tcPr><w:tcW w:w="${crestCol}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r>${INLINE_CREST(logoId)}</w:r></w:p></w:tc>`
    : ''
  const name = `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:color w:val="${wColor(DOC_COLOR.heading, '#0a1728')}"/><w:sz w:val="${halfPt(L.namePx)}"/><w:spacing w:val="${Math.round(twips(L.namePx * L.nameTrackingEm))}"/></w:rPr><w:t>${escXml(FIRM_NAME)}</w:t></w:r></w:p>`
  const tagline = `<w:p><w:pPr><w:spacing w:before="${twips(L.metaTopPx)}" w:after="0"/></w:pPr><w:r><w:rPr><w:color w:val="${wColor(DOC_COLOR.meta, '#5b6573')}"/><w:sz w:val="${halfPt(L.metaPx)}"/><w:spacing w:val="${Math.round(twips(L.metaPx * L.metaTrackingEm))}"/></w:rPr><w:t>${escXml(FIRM_TAGLINE.toUpperCase())}</w:t></w:r></w:p>`
  const asideLine = (value: string, first: boolean) =>
    `<w:p><w:pPr><w:spacing w:before="${first ? 0 : twips(L.asidePx * (L.asideLineHeight - 1))}" w:after="0"/><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:color w:val="${wColor(DOC_COLOR.aside, '#64748b')}"/><w:sz w:val="${halfPt(L.asidePx)}"/></w:rPr><w:t>${escXml(value)}</w:t></w:r></w:p>`
  const aside = [FIRM_REGION, FIRM_PHONE, FIRM_SITE_HOST].map((line, i) => asideLine(line, i === 0)).join('')
  const rule = `<w:p><w:pPr><w:spacing w:before="${twips(L.bottomPadPx)}" w:after="${twips(L.bodyTopPx)}"/><w:pBdr><w:bottom w:val="single" w:sz="${Math.max(2, Math.round(halfPt(L.rulePx)))}" w:space="0" w:color="${wColor(DOC_COLOR.rule, '#c9c3b4')}"/></w:pBdr></w:pPr></w:p>`
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders/></w:tblPr><w:tblGrid>${logoId ? `<w:gridCol w:w="${crestCol}"/>` : ''}<w:gridCol w:w="${nameCol}"/><w:gridCol w:w="${asideCol}"/></w:tblGrid><w:tr>${crestCell}<w:tc><w:tcPr><w:tcW w:w="${nameCol}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${name}${tagline}</w:tc><w:tc><w:tcPr><w:tcW w:w="${asideCol}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${aside}</w:tc></w:tr></w:tbl>${rule}`
}

function headingStyleXml(level: number): string {
  const h = docHeading(level)
  return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="${twips(h.topPx)}" w:after="${twips(h.bottomPx)}"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:color w:val="${wColor(DOC_COLOR.heading, '#0a1728')}"/><w:sz w:val="${halfPt(h.sizePx)}"/></w:rPr></w:style>`
}

// Body defaults are Georgia at the on-screen size and leading, so a .docx
// opened in Word reads as the same letter the author was looking at. The
// previous default was Calibri 11, which is Word's default, not ours.
const DOCX_STYLES = `${XML_HEADER}\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:color w:val="${wColor(DOC_COLOR.ink, '#1b2430')}"/><w:sz w:val="${halfPt(DOC_BODY.sizePx)}"/><w:szCs w:val="${halfPt(DOC_BODY.sizePx)}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="${twips(DOC_BODY.paragraphGapPx)}" w:line="${Math.round(DOC_BODY.lineHeight * 240)}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${[1, 2, 3, 4, 5, 6].map(headingStyleXml).join('')}<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="${twips(DOC_BODY.quoteIndentPx + DOC_BODY.quoteRulePx)}"/><w:spacing w:before="${twips(DOC_BODY.quoteGapPx)}" w:after="${twips(DOC_BODY.quoteGapPx)}"/><w:pBdr><w:left w:val="single" w:sz="${Math.max(2, Math.round(halfPt(DOC_BODY.quoteRulePx)))}" w:space="8" w:color="${wColor(DOC_COLOR.quoteRule, '#c9c3b4')}"/></w:pBdr></w:pPr><w:rPr><w:color w:val="${wColor(DOC_COLOR.quoteText, '#475569')}"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="HTMLPreformatted"><w:name w:val="HTML Preformatted"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="${twips(DOC_BODY.paragraphGapPx)}" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="${halfPt(DOC_BODY.monoSizePx)}"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="${twips(DOC_BODY.listIndentPx * 2)}" w:hanging="${twips(DOC_BODY.listIndentPx)}"/></w:pPr></w:style></w:styles>`

const DOCX_NUMBERING = `${XML_HEADER}\n<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`

export async function buildDocx(input: { title: string; html: string; branded?: boolean; logoBytes?: Uint8Array | ArrayBuffer | null; pageSize?: string | null; margins?: string | null }): Promise<Uint8Array> {
  const branded = !!input.branded
  const blocks = parseHtml(input.html)
  const page = docPageSize(input.pageSize)
  const m = docMarginsScreen(input.margins)
  const rels: { id: string; type: string; target: string; external?: boolean }[] = []
  let relN = 0
  const nextId = () => `rId${++relN}`
  rels.push({ id: nextId(), type: REL_STYLES, target: 'styles.xml' })
  rels.push({ id: nextId(), type: REL_NUMBERING, target: 'numbering.xml' })
  const footerId = nextId()
  rels.push({ id: footerId, type: REL_FOOTER, target: 'footer1.xml' })
  const hrefIds = new Map<string, string>()
  const collect = (runs: ExportRun[]) => {
    for (const r of runs) if (r.href && !hrefIds.has(r.href)) hrefIds.set(r.href, nextId())
  }
  for (const b of blocks) {
    if (b.kind === 'table') for (const row of b.rows) for (const cell of row) collect(cell.runs)
    else if (b.kind === 'heading' || b.kind === 'paragraph' || b.kind === 'pre' || b.kind === 'listitem' || b.kind === 'quote') collect(b.runs)
  }
  for (const [href, id] of hrefIds) rels.push({ id, type: REL_HYPERLINK, target: href, external: true })
  let logoId: string | null = null
  let logoBytes: Uint8Array | null = null
  if (branded && input.logoBytes) {
    logoBytes = input.logoBytes instanceof Uint8Array ? input.logoBytes : new Uint8Array(input.logoBytes)
    logoId = nextId()
    rels.push({ id: logoId, type: REL_IMAGE, target: 'media/image1.png' })
  }

  const contentPx = page.screen.w - m.x * 2
  const body = blocks.map((b) => paragraphXml(b, hrefIds, contentPx)).join('')
  // Page size and margins follow the editor's own choice rather than a fixed
  // Letter page with one-inch margins.
  const sectPr = `<w:sectPr><w:footerReference w:type="default" r:id="${footerId}"/><w:pgSz w:w="${Math.round(page.screen.w * 15)}" w:h="${Math.round(page.screen.h * 15)}"/><w:pgMar w:top="${twips(m.top)}" w:right="${twips(m.x)}" w:bottom="${twips(m.bottom)}" w:left="${twips(m.x)}" w:header="720" w:footer="${twips(m.bottom / 2)}" w:gutter="0"/></w:sectPr>`
  const documentXml = `${XML_HEADER}\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${branded ? headerTableXml(logoId) : ''}${body}${sectPr}</w:body></w:document>`

  const colophonRun = (value: string, align: 'left' | 'center' | 'right') =>
    `<w:r><w:rPr><w:sz w:val="${halfPt(DOC_COLOPHON.sizePx)}"/><w:color w:val="${wColor(DOC_COLOR.colophon, '#8b919c')}"/><w:spacing w:val="${Math.round(twips(DOC_COLOPHON.sizePx * DOC_COLOPHON.trackingEm))}"/></w:rPr><w:t xml:space="preserve">${escXml(align === 'left' ? value : `  ${value}`)}</w:t></w:r>`
  const colophonText = branded ? `${FIRM_NAME}  ·  Confidential  ·  ${SUPPORT_EMAIL}` : FIRM_NAME
  const footerXml = `${XML_HEADER}\n<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/><w:pBdr><w:top w:val="single" w:sz="${Math.max(2, Math.round(halfPt(DOC_COLOPHON.rulePx)))}" w:space="${Math.round(pt(DOC_COLOPHON.topPadPx))}" w:color="${wColor(DOC_COLOR.colophonRule, '#e7e4dc')}"/></w:pBdr></w:pPr>${colophonRun(colophonText.toUpperCase(), 'left')}</w:p></w:ftr>`

  const relsXml = `${XML_HEADER}\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${escXml(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`

  const contentTypes = `${XML_HEADER}\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`

  const rootRels = `${XML_HEADER}\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`

  const nowIso = new Date().toISOString()
  const coreProps = `${XML_HEADER}\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escXml(input.title)}</dc:title><dc:creator>${FIRM_NAME}</dc:creator><cp:lastModifiedBy>${FIRM_NAME}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified></cp:coreProperties>`

  const appProps = `${XML_HEADER}\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>${FIRM_NAME}</Application><DocSecurity>0</DocSecurity></Properties>`

  const enc = new TextEncoder()
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'docProps/core.xml', data: enc.encode(coreProps) },
    { name: 'docProps/app.xml', data: enc.encode(appProps) },
    { name: 'word/document.xml', data: enc.encode(documentXml) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(relsXml) },
    { name: 'word/styles.xml', data: enc.encode(DOCX_STYLES) },
    { name: 'word/numbering.xml', data: enc.encode(DOCX_NUMBERING) },
    { name: 'word/footer1.xml', data: enc.encode(footerXml) },
  ]
  if (logoBytes && logoId) entries.push({ name: 'word/media/image1.png', data: logoBytes })
  return zipStore(entries)
}