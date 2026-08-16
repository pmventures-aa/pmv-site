// DOCX (OOXML package) export builder. The package is a real ZIP archive with
// stored entries: Word, Google Docs, LibreOffice and previewers all open it.
// Letterhead, confidentiality footer, heading/list/quote styles, hyperlinks
// and the inline crest are all preserved so the exported file matches the
// on-screen letter.

import { FIRM_NAME, FIRM_PHONE, FIRM_REGION, FIRM_SITE_HOST, FIRM_TAGLINE, SUPPORT_EMAIL } from '../../shared/letterhead'

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

export type ExportRun = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; href?: string }
export type ExportBlock =
  | { kind: 'heading'; level: number; runs: ExportRun[] }
  | { kind: 'paragraph'; runs: ExportRun[] }
  | { kind: 'listitem'; ordered: boolean; index: number; runs: ExportRun[] }
  | { kind: 'quote'; runs: ExportRun[] }
  | { kind: 'hr' }

type PendingBlock = { kind: 'heading' | 'paragraph' | 'listitem' | 'quote'; level: number; ordered: boolean; index: number; runs: ExportRun[] }

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'])
const INLINE_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'strike', 's', 'del', 'a'])
const SKIP_TAGS = new Set(['span', 'font', 'sub', 'sup', 'small', 'label', 'mark'])

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

export function parseHtml(html: string): ExportBlock[] {
  const blocks: ExportBlock[] = []
  let cur: PendingBlock | null = null
  let listMode: 'ol' | 'ul' | null = null
  let liIndex = 0
  const inline: { tag: string; href?: string }[] = []

  const attrs = () => {
    let bold = false
    let italic = false
    let underline = false
    let strike = false
    let href: string | undefined
    for (const s of inline) {
      if (s.tag === 'b' || s.tag === 'strong') bold = true
      else if (s.tag === 'i' || s.tag === 'em') italic = true
      else if (s.tag === 'u') underline = true
      else if (s.tag === 'strike' || s.tag === 's' || s.tag === 'del') strike = true
      else if (s.tag === 'a' && s.href) href = s.href
    }
    return { bold, italic, underline, strike, href }
  }
  const pushText = (raw: string) => {
    if (!cur) return
    const text = decodeHtmlEntities(raw).replace(/\s+/g, ' ')
    if (!text) return
    const a = attrs()
    const last = cur.runs[cur.runs.length - 1]
    if (last && last.bold === a.bold && last.italic === a.italic && last.underline === a.underline && last.strike === a.strike && last.href === a.href) last.text += text
    else cur.runs.push({ text, bold: a.bold, italic: a.italic, underline: a.underline, strike: a.strike, href: a.href })
  }
  const flush = () => {
    if (!cur) return
    if (cur.runs.length) {
      const first = cur.runs[0]
      first.text = first.text.replace(/^\s+/, '')
      const last = cur.runs[cur.runs.length - 1]
      last.text = last.text.replace(/\s+$/, '')
      if (cur.runs.some((r) => r.text.length)) blocks.push(cur)
    }
    cur = null
  }
  const open = (tag: string) => {
    if (!BLOCK_TAGS.has(tag)) return
    flush()
    const kind = tag === 'blockquote' ? 'quote' : tag === 'li' ? 'listitem' : tag.startsWith('h') ? 'heading' : 'paragraph'
    cur = {
      kind,
      level: kind === 'heading' ? Math.min(Number(tag.slice(1)) || 1, 3) : 0,
      ordered: kind === 'listitem' && listMode === 'ol',
      index: kind === 'listitem' ? ++liIndex : 0,
      runs: [],
    }
  }

  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^<>]*)?)>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(String(html || '')))) {
    const closing = !!m[1]
    const tag = m[2].toLowerCase()
    const attrsRaw = m[3] || ''
    const text = m[4]
    if (text !== undefined) { pushText(text); continue }
    if (closing) {
      if (tag === 'ol' || tag === 'ul') { listMode = null; liIndex = 0 }
      else if (tag === 'li') flush()
      else {
        const idx = inline.map((s) => s.tag).lastIndexOf(tag)
        if (idx >= 0) inline.splice(idx, 1)
        if (BLOCK_TAGS.has(tag)) flush()
      }
      continue
    }
    if (tag === 'br') { pushText('\n'); continue }
    if (tag === 'hr') { flush(); blocks.push({ kind: 'hr' }); continue }
    if (tag === 'ol' || tag === 'ul') { listMode = tag; liIndex = 0; continue }
    if (tag === 'a') {
      const hrefMatch = attrsRaw.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/)
      const href = hrefMatch ? decodeHtmlEntities(hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? '') : undefined
      inline.push({ tag: 'a', href })
      continue
    }
    if (INLINE_TAGS.has(tag)) { inline.push({ tag }); continue }
    if (SKIP_TAGS.has(tag)) continue
    open(tag)
  }
  flush()
  return blocks.filter((b) => b.kind === 'hr' || b.runs.some((r) => r.text.trim()))
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

function escXml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function runXml(r: ExportRun, hrefId?: string): string {
  let pr = ''
  if (r.bold) pr += '<w:b/>'
  if (r.italic) pr += '<w:i/>'
  if (r.underline) pr += '<w:u w:val="single"/>'
  if (r.strike) pr += '<w:strike/>'
  const rpr = pr ? `<w:rPr>${pr}</w:rPr>` : ''
  const pieces = r.text.split('\n')
  const inner = pieces.map((p, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${escXml(p)}</w:t>`).join('')
  const run = `<w:r>${rpr}${inner}</w:r>`
  return hrefId ? `<w:hyperlink r:id="${hrefId}">${run}</w:hyperlink>` : run
}

function runsXml(runs: ExportRun[], hrefIds: Map<string, string>): string {
  return runs.map((r) => runXml(r, r.href ? hrefIds.get(r.href) : undefined)).join('')
}

function paragraphXml(b: ExportBlock, hrefIds: Map<string, string>): string {
  const runs = runsXml(b.kind === 'hr' ? [] : b.runs, hrefIds)
  if (b.kind === 'heading') return `<w:p><w:pPr><w:pStyle w:val="Heading${b.level}"/></w:pPr>${runs}</w:p>`
  if (b.kind === 'quote') return `<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>${runs}</w:p>`
  if (b.kind === 'listitem') return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${b.ordered ? 1 : 2}"/></w:numPr></w:pPr>${runs}</w:p>`
  if (b.kind === 'hr') return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="8b919c"/></w:pBdr></w:pPr></w:p>`
  return `<w:p>${runs}</w:p>`
}

const INLINE_IMAGE = (rid: string) =>
  `<w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="657720" cy="657720"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Pinnacle Crest"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="Crest"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="657720" cy="657720"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`

function headerTableXml(logoId: string | null): string {
  const logoCell = logoId
    ? `<w:tc><w:tcPr><w:tcW w:w="1440" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr><w:r>${INLINE_IMAGE(logoId)}</w:r></w:p></w:tc>`
    : ''
  return `<w:tbl><w:tblPr><w:tblW w:w="9600" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="BF9B30"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="BF9B30"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="1440"/><w:gridCol w:w="8160"/></w:tblGrid><w:tr>${logoCell}<w:tc><w:tcPr><w:tcW w:w="8160" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="120" w:after="0"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="0B1324"/><w:sz w:val="34"/></w:rPr><w:t>${escXml(FIRM_NAME)}</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:before="40" w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="6B7280"/></w:rPr><w:t>${escXml(FIRM_TAGLINE)}</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:before="40" w:after="120"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="9CA3AF"/></w:rPr><w:t>${escXml(`${FIRM_REGION}  ·  ${FIRM_PHONE}  ·  ${FIRM_SITE_HOST}`)}</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:pPr><w:spacing w:after="240"/></w:pPr></w:p>`
}

const DOCX_STYLES = `${XML_HEADER}\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:color w:val="0B1324"/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:color w:val="1F2937"/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:color w:val="374151"/><w:sz w:val="23"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="480" w:right="480"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:rPr><w:i/><w:color w:val="4B5563"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:style></w:styles>`

const DOCX_NUMBERING = `${XML_HEADER}\n<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`

export async function buildDocx(input: { title: string; html: string; branded?: boolean; logoBytes?: Uint8Array | ArrayBuffer | null }): Promise<Uint8Array> {
  const branded = !!input.branded
  const blocks = parseHtml(input.html)
  const rels: { id: string; type: string; target: string; external?: boolean }[] = []
  let relN = 0
  const nextId = () => `rId${++relN}`
  rels.push({ id: nextId(), type: REL_STYLES, target: 'styles.xml' })
  rels.push({ id: nextId(), type: REL_NUMBERING, target: 'numbering.xml' })
  const footerId = nextId()
  rels.push({ id: footerId, type: REL_FOOTER, target: 'footer1.xml' })
  const hrefIds = new Map<string, string>()
  for (const b of blocks) {
    if (b.kind === 'hr') continue
    for (const r of b.runs) if (r.href && !hrefIds.has(r.href)) hrefIds.set(r.href, nextId())
  }
  for (const [href, id] of hrefIds) rels.push({ id, type: REL_HYPERLINK, target: href, external: true })
  let logoId: string | null = null
  let logoBytes: Uint8Array | null = null
  if (branded && input.logoBytes) {
    logoBytes = input.logoBytes instanceof Uint8Array ? input.logoBytes : new Uint8Array(input.logoBytes)
    logoId = nextId()
    rels.push({ id: logoId, type: REL_IMAGE, target: 'media/image1.png' })
  }

  const body = blocks.map((b) => paragraphXml(b, hrefIds)).join('')
  const documentXml = `${XML_HEADER}\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${branded ? headerTableXml(logoId) : ''}${body}<w:sectPr><w:footerReference w:type="default" r:id="${footerId}"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`

  const footerXml = `${XML_HEADER}\n<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="D7DEE6"/></w:pBdr></w:pPr><w:r><w:rPr><w:sz w:val="14"/><w:color w:val="9CA3AF"/></w:rPr><w:t>${escXml(branded ? `${FIRM_NAME}  ·  Confidential  ·  ${SUPPORT_EMAIL}` : FIRM_NAME)}</w:t></w:r></w:p></w:ftr>`

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