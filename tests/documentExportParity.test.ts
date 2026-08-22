import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { parseHtml, buildDocx, cssSizeToPx, normalizeColor } from '../functions/_lib/officeExport'
import { buildPdf } from '../functions/_lib/documentExport'
import { DOC_BODY, DOC_COLOR, DOC_LETTERHEAD, docHeading, docPaperVars, pt } from '../shared/documentTheme'
import { docMargins, docMarginsScreen } from '../shared/docLayout'

// The bug this file exists for: the letterhead the editor showed and the
// letterhead the PDF produced were two independently maintained designs. They
// disagreed on the typeface, the crest size, the rule colour and how the firm
// name was set. Everything below pins them to one another.

const css = readFileSync(new URL('../src/components/admin/documentCanvas.css', import.meta.url), 'utf8')
const canvas = readFileSync(new URL('../src/components/admin/DocumentCanvas.tsx', import.meta.url), 'utf8')
const crest = new Uint8Array(readFileSync(new URL('../public/logo-crest-letterhead.png', import.meta.url)))

function pdfStreams(bytes: Uint8Array): string[] {
  const raw = Buffer.from(bytes)
  const text = raw.toString('latin1')
  const out: string[] = []
  const re = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length
    const end = text.indexOf('endstream', start)
    if (end < 0) continue
    try { out.push(inflateSync(raw.subarray(start, end)).toString('latin1')) } catch { /* image or uncompressed stream */ }
  }
  return out
}

function pageStreams(bytes: Uint8Array): string[] {
  return pdfStreams(bytes).filter((s) => s.includes('BT') && s.includes(' Tf'))
}

function drawnText(stream: string): string {
  return Array.from(stream.matchAll(/<([0-9A-Fa-f]+)> Tj/g)).map((m) => Buffer.from(m[1], 'hex').toString('latin1')).join('')
}

async function pdfOf(html: string, opts: { branded?: boolean; margins?: string } = {}) {
  return buildPdf({ title: 'Test', html, branded: opts.branded ?? true, logoBytes: crest, pageSize: 'letter', margins: opts.margins ?? 'normal' })
}

describe('the editor stylesheet owns no sizes of its own', () => {
  it('drives the paper from the shared theme rather than literals', () => {
    // A literal here is how the drift started: the CSS said Georgia 15px and
    // the exporter said Helvetica 11pt, and nothing connected the two.
    expect(css).toContain('font-size:var(--doc-body-size)')
    expect(css).toContain('color:var(--doc-ink)')
    expect(css).toContain('var(--doc-rule) 8%,var(--doc-rule) 92%')
    expect(css).not.toContain('#c9c3b4')
    expect(css).not.toContain('font-size:15px')
  })

  it('has the canvas apply the theme variables to the page', () => {
    expect(canvas).toContain('docPaperVars()')
    expect(canvas).toContain('<article className="doc-paper" style={paperStyle}>')
  })

  it('publishes every variable the stylesheet reads', () => {
    const vars = docPaperVars()
    const used = new Set(Array.from(css.matchAll(/var\((--doc-[a-z0-9-]+)/g)).map((m) => m[1]))
    // Page size and margin preset are per-document, so the canvas supplies
    // those alongside the theme's own variables.
    const fromLayout = new Set(['--doc-mx', '--doc-mt', '--doc-mb', '--doc-page-w', '--doc-page-h', '--doc-body-min'])
    for (const name of used) {
      if (fromLayout.has(name)) continue
      expect(Object.keys(vars), `${name} is read by the stylesheet`).toContain(name)
    }
  })
})

describe('screen margins and PDF margins are the same box', () => {
  it('derives points from the on-screen pixels', () => {
    for (const key of ['normal', 'narrow', 'wide']) {
      const screen = docMarginsScreen(key)
      expect(docMargins(key)).toEqual({ x: pt(screen.x), top: pt(screen.top), bottom: pt(screen.bottom) })
    }
  })

  it('no longer puts normal margins at 64px on screen and 72px in the PDF', () => {
    expect(docMarginsScreen('normal').top).toBe(64)
    expect(docMargins('normal').top).toBe(48)
  })
})

describe('what the ribbon can do, the export keeps', () => {
  it('keeps a colour chosen from the ink picker', () => {
    const [block] = parseHtml('<p><span style="color: rgb(138, 106, 36)">gold</span></p>')
    expect(block.kind).toBe('paragraph')
    expect('runs' in block && block.runs[0].color).toBe('#8a6a24')
  })

  it('keeps a highlight, a font size and a font genre', () => {
    const [block] = parseHtml('<p><span style="background-color:#efe0a8;font-size:24px;font-family:Consolas, monospace">x</span></p>')
    const run = 'runs' in block ? block.runs[0] : null
    expect(run).toMatchObject({ highlight: '#efe0a8', sizePx: 24, family: 'mono' })
  })

  it('keeps paragraph alignment', () => {
    expect(parseHtml('<div style="text-align:center">mid</div>')[0]).toMatchObject({ align: 'center' })
    expect(parseHtml('<p align="right">end</p>')[0]).toMatchObject({ align: 'right' })
  })

  it('keeps every heading level the paragraph picker offers', () => {
    // The picker goes down to H5 ("Heading 3"). Levels were clamped to 3, so
    // the two smallest headings came out the size of the third.
    const blocks = parseHtml('<h1>a</h1><h4>b</h4><h5>c</h5>')
    expect(blocks.map((b) => ('level' in b ? b.level : 0))).toEqual([1, 4, 5])
  })

  it('keeps a monospace block', () => {
    expect(parseHtml('<pre>  spaced  </pre>')[0]).toMatchObject({ kind: 'pre' })
  })

  it('keeps an inserted table as a table', () => {
    const [block] = parseHtml('<table class="doc-table"><thead><tr><th>Item</th><th>Rate</th></tr></thead><tbody><tr><td>Visit</td><td>$180</td></tr></tbody></table>')
    expect(block.kind).toBe('table')
    if (block.kind !== 'table') return
    expect(block.rows).toHaveLength(2)
    expect(block.rows[0][0]).toMatchObject({ header: true })
    expect(block.rows[1][1].runs[0].text).toBe('$180')
  })

  it('keeps an inserted page break, signature line and image', () => {
    const blocks = parseHtml('<div class="doc-pagebreak"></div><div class="doc-sigline"><span class="doc-sigline-rule"></span><span class="doc-sigline-label">Client</span></div><img src="https://example.com/a.png" alt="Site">')
    expect(blocks.map((b) => b.kind)).toEqual(['pagebreak', 'signature', 'image'])
    expect(blocks[1]).toMatchObject({ label: 'Client' })
    expect(blocks[2]).toMatchObject({ alt: 'Site' })
  })

  it('keeps text typed straight into an empty document', () => {
    // contentEditable puts the first characters in a bare text node. They were
    // dropped outright, so a brand new letter exported as a blank page.
    const blocks = parseHtml('Just typed this.')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].kind).toBe('paragraph')
    expect('runs' in blocks[0] && blocks[0].runs[0].text).toBe('Just typed this.')
  })

  it('does not invent a space where the markup had none', () => {
    const [block] = parseHtml('<p><b>bo</b>ld</p>')
    expect('runs' in block && block.runs.map((r) => r.text)).toEqual(['bo', 'ld'])
  })
})

describe('colour and size parsing', () => {
  it('reads the shapes the editor actually emits', () => {
    expect(normalizeColor('rgb(10, 23, 40)')).toBe('#0a1728')
    expect(normalizeColor('#FFF')).toBe('#ffffff')
    expect(normalizeColor('rgba(0,0,0,0)')).toBeUndefined()
    expect(normalizeColor('transparent')).toBeUndefined()
    expect(cssSizeToPx('12pt')).toBe(16)
    expect(cssSizeToPx('2em')).toBe(DOC_BODY.sizePx * 2)
  })
})

describe('the exported letterhead is the letterhead on screen', () => {
  it('sets the document in a serif face, not Helvetica', async () => {
    const bytes = await pdfOf('<p>Body copy.</p>')
    expect(Buffer.from(bytes).toString('latin1')).toContain('/BaseFont /Times-Roman')
    const page = pageStreams(bytes).join('\n')
    expect(page).toMatch(new RegExp(`/Times-Roman-\\d+ ${pt(DOC_BODY.sizePx)} Tf`))
  })

  it('draws the crest at the size the editor shows', async () => {
    const page = pageStreams(await pdfOf('<p>x</p>')).join('\n')
    expect(page).toContain(`${pt(DOC_LETTERHEAD.crestWidthPx)} 0 0 ${pt(DOC_LETTERHEAD.crestHeightPx)} 0 0 cm`)
  })

  it('sets the firm name on one line at the on-screen size', async () => {
    const page = pageStreams(await pdfOf('<p>x</p>')).join('\n')
    expect(page).toMatch(new RegExp(`/Times-Bold-\\d+ ${pt(DOC_LETTERHEAD.namePx)} Tf`))
    // The old export set it as "PINNACLE" over "MANAGEMENT VENTURES" in caps,
    // so the mixed-case name never appeared as one string at all.
    expect(drawnText(page)).toContain('Pinnacle Management Ventures')
    expect(drawnText(page)).toContain('PROPERTY · DOCUMENTS · OPERATIONS')
  })

  it('draws the rule in the sand the screen uses, not gold', async () => {
    const page = pageStreams(await pdfOf('<p>x</p>')).join('\n')
    const sand = DOC_COLOR.rule.slice(1).match(/../g)!.map((h) => parseInt(h, 16) / 255)
    expect(page).toContain(sand.join(' '))
    // 0.78 0.61 0.23 was the gold the rule and the second name line were in.
    expect(page).not.toContain('0.78 0.61 0.23')
  })

  it('tracks the letterhead tagline instead of drawing it a glyph at a time', async () => {
    // Per-glyph drawing registers a fresh font resource per character and
    // leaves the reader with text nobody can select or search.
    expect(pageStreams(await pdfOf('<p>x</p>')).join('\n')).toContain(' Tc\n')
  })

  it('keeps the letterhead on the first page only, like the editor', async () => {
    const pages = pageStreams(await pdfOf('<p>one</p><div class="doc-pagebreak"></div><p>two</p>'))
    expect(pages).toHaveLength(2)
    expect(drawnText(pages[0])).toContain('Pinnacle Management Ventures')
    expect(drawnText(pages[1])).not.toContain('Pinnacle Management Ventures')
    // The colophon still runs on every page.
    expect(drawnText(pages[1])).toContain('CONFIDENTIAL')
  })

  it('draws headings at the on-screen heading size', async () => {
    const page = pageStreams(await pdfOf('<h2>Scope</h2>')).join('\n')
    expect(page).toMatch(new RegExp(`/Times-Bold-\\d+ ${pt(docHeading(2).sizePx)} Tf`))
  })
})

describe('the .docx is the same letter again', () => {
  it('defaults to Georgia at the on-screen size, not Word Calibri 11', async () => {
    const bytes = await buildDocx({ title: 'Test', html: '<p>x</p>', branded: true, logoBytes: crest, pageSize: 'letter', margins: 'normal' })
    const zip = Buffer.from(bytes).toString('latin1')
    expect(zip).toContain('<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:color w:val="1b2430"/>')
    expect(zip).not.toContain('w:ascii="Calibri" w:hAnsi="Calibri"')
  })

  it('carries tables, page breaks and alignment through', async () => {
    const html = '<table><tr><th>A</th></tr><tr><td>B</td></tr></table><div class="doc-pagebreak"></div><p style="text-align:center">mid</p>'
    const zip = Buffer.from(await buildDocx({ title: 'Test', html, branded: false })).toString('latin1')
    expect(zip).toContain('<w:tbl>')
    expect(zip).toContain('<w:br w:type="page"/>')
    expect(zip).toContain('<w:jc w:val="center"/>')
  })
})
