// One source of truth for how a Pinnacle document looks.
//
// The on-screen page (documentCanvas.css, CSS px at 96dpi), the PDF export
// (pdf-lib, points) and the DOCX export (OOXML half-points / twips) used to
// each carry their own copy of the letterhead: three sets of sizes, three sets
// of colours, three ideas of what the firm name looks like. They drifted, and
// the exported letterhead stopped matching the one on screen.
//
// Everything below is declared once, in CSS px, and converted at the edges.
// The screen reads these as CSS custom properties; the exporters read the same
// numbers through pt() / halfPt() / twips().

export const PT_PER_PX = 0.75 // 1 CSS px at 96dpi = 0.75pt

export function pt(px: number): number {
  return Math.round(px * PT_PER_PX * 1000) / 1000
}

// OOXML sizes are half-points; twips are 1/20pt.
export function halfPt(px: number): number {
  return Math.round(pt(px) * 2)
}

export function twips(px: number): number {
  return Math.round(pt(px) * 20)
}

export const DOC_COLOR = {
  paper: '#ffffff',
  ink: '#1b2430',
  heading: '#0a1728',
  link: '#0a1728',
  meta: '#5b6573',
  aside: '#64748b',
  rule: '#c9c3b4',
  hr: '#cbd2db',
  quoteText: '#475569',
  quoteRule: '#c9c3b4',
  tableRule: '#cfd6df',
  tableHeadFill: '#f3f5f8',
  colophon: '#8b919c',
  colophonRule: '#e7e4dc',
  sigRule: '#1b2430',
  sigLabel: '#64748b',
} as const

// Body copy. lh values are unitless CSS line-heights.
export const DOC_BODY = {
  sizePx: 15,
  lineHeight: 1.75,
  paragraphGapPx: 13.6, // .85rem
  listIndentPx: 22.4, // 1.4rem
  listGapTopPx: 6.4,
  listGapBottomPx: 14.4,
  quoteIndentPx: 16, // 1rem of padding past a 2px rule
  quoteRulePx: 2,
  quoteGapPx: 16,
  hrGapPx: 17.6, // 1.1rem
  hrRulePx: 1,
  monoSizePx: 13.5,
} as const

// Headings, keyed by level. The picker offers Title (h1) through Heading 3
// (h5), so every level it can produce has to be defined here, on screen and in
// both exports.
export const DOC_HEADINGS: Record<number, { sizePx: number; topPx: number; bottomPx: number }> = {
  1: { sizePx: 27.2, topPx: 0, bottomPx: 16 },
  2: { sizePx: 19.2, topPx: 17.6, bottomPx: 8.8 },
  3: { sizePx: 16.32, topPx: 14.4, bottomPx: 6.4 },
  4: { sizePx: 15, topPx: 13.6, bottomPx: 5.6 },
  5: { sizePx: 13.6, topPx: 12.8, bottomPx: 4.8 },
  6: { sizePx: 12.8, topPx: 12.8, bottomPx: 4.8 },
}

export function docHeading(level: number) {
  return DOC_HEADINGS[Math.min(Math.max(Math.round(level) || 1, 1), 6)]
}

// The letterhead block: crest on the left, firm name + tagline beside it,
// contact column on the right, gold-sand rule underneath.
export const DOC_LETTERHEAD = {
  crestWidthPx: 73,
  crestHeightPx: 94,
  crestGapPx: 18.4, // 1.15rem
  namePx: 20,
  nameTrackingEm: 0.04,
  nameLineHeight: 1.15,
  metaPx: 10,
  metaTrackingEm: 0.16,
  metaTopPx: 5.6,
  asidePx: 11,
  asideLineHeight: 1.55,
  bottomPadPx: 22,
  rulePx: 1,
  bodyTopPx: 28,
} as const

export const DOC_COLOPHON = {
  sizePx: 9,
  trackingEm: 0.12,
  topGapPx: 8,
  topPadPx: 16,
  rulePx: 1,
} as const

export const DOC_SIGNATURE = {
  topPx: 27.2, // 1.7rem
  bottomPx: 6.4,
  widthPx: 300,
  rulePx: 1,
  ruleHeightPx: 24,
  labelPx: 10,
  labelTrackingEm: 0.12,
  labelTopPx: 4.5,
} as const

export const DOC_TABLE = {
  rulePx: 1,
  padXPx: 9,
  padYPx: 6,
  sizeRatio: 0.95, // .95em of the surrounding body size
  gapPx: 12.8,
} as const

// Font genre, resolved from a CSS font stack. Every stack in DOC_FONTS ends in
// its own generic family, so the last entry is an exact answer rather than a
// guess at what "Cambria" looks like.
export type DocFontGenre = 'serif' | 'sans' | 'mono'

export function fontGenre(stack: string | null | undefined): DocFontGenre {
  const s = String(stack || '').toLowerCase()
  if (s.includes('monospace') || s.includes('courier') || s.includes('consolas')) return 'mono'
  if (s.includes('sans-serif') || s.includes('system-ui')) return 'sans'
  return 'serif'
}

// CSS custom properties for .doc-paper. Declaring them here rather than in the
// stylesheet is what keeps the screen and the exports on the same numbers: the
// editor stylesheet reads nothing but var(--doc-*), so changing a size here
// changes the page, the PDF and the .docx together.
export function docPaperVars(): Record<string, string> {
  const L = DOC_LETTERHEAD
  const C = DOC_COLOPHON
  const B = DOC_BODY
  const S = DOC_SIGNATURE
  const T = DOC_TABLE
  const vars: Record<string, string> = {
    '--doc-ink': DOC_COLOR.ink,
    '--doc-paper': DOC_COLOR.paper,
    '--doc-heading': DOC_COLOR.heading,
    '--doc-link': DOC_COLOR.link,
    '--doc-meta': DOC_COLOR.meta,
    '--doc-aside': DOC_COLOR.aside,
    '--doc-rule': DOC_COLOR.rule,
    '--doc-hr': DOC_COLOR.hr,
    '--doc-quote-text': DOC_COLOR.quoteText,
    '--doc-quote-rule': DOC_COLOR.quoteRule,
    '--doc-table-rule': DOC_COLOR.tableRule,
    '--doc-table-head': DOC_COLOR.tableHeadFill,
    '--doc-colophon': DOC_COLOR.colophon,
    '--doc-colophon-rule': DOC_COLOR.colophonRule,
    '--doc-sig-rule': DOC_COLOR.sigRule,
    '--doc-sig-label': DOC_COLOR.sigLabel,
    '--doc-crest-w': `${L.crestWidthPx}px`,
    '--doc-crest-h': `${L.crestHeightPx}px`,
    '--doc-crest-gap': `${L.crestGapPx}px`,
    '--doc-name-size': `${L.namePx}px`,
    '--doc-name-track': `${L.nameTrackingEm}em`,
    '--doc-name-line': String(L.nameLineHeight),
    '--doc-meta-size': `${L.metaPx}px`,
    '--doc-meta-track': `${L.metaTrackingEm}em`,
    '--doc-meta-top': `${L.metaTopPx}px`,
    '--doc-aside-size': `${L.asidePx}px`,
    '--doc-aside-line': String(L.asideLineHeight),
    '--doc-head-pad': `${L.bottomPadPx}px`,
    '--doc-rule-h': `${L.rulePx}px`,
    '--doc-body-top': `${L.bodyTopPx}px`,
    '--doc-colophon-size': `${C.sizePx}px`,
    '--doc-colophon-track': `${C.trackingEm}em`,
    '--doc-colophon-gap': `${C.topGapPx}px`,
    '--doc-colophon-pad': `${C.topPadPx}px`,
    '--doc-colophon-rule-h': `${C.rulePx}px`,
    '--doc-body-size': `${B.sizePx}px`,
    '--doc-body-line': String(B.lineHeight),
    '--doc-para-gap': `${B.paragraphGapPx}px`,
    '--doc-list-indent': `${B.listIndentPx}px`,
    '--doc-list-top': `${B.listGapTopPx}px`,
    '--doc-list-bottom': `${B.listGapBottomPx}px`,
    '--doc-quote-indent': `${B.quoteIndentPx}px`,
    '--doc-quote-rule-w': `${B.quoteRulePx}px`,
    '--doc-quote-gap': `${B.quoteGapPx}px`,
    '--doc-hr-gap': `${B.hrGapPx}px`,
    '--doc-hr-h': `${B.hrRulePx}px`,
    '--doc-mono-size': `${B.monoSizePx}px`,
    '--doc-table-rule-w': `${T.rulePx}px`,
    '--doc-table-pad-x': `${T.padXPx}px`,
    '--doc-table-pad-y': `${T.padYPx}px`,
    '--doc-table-size': `${T.sizeRatio}em`,
    '--doc-table-gap': `${T.gapPx}px`,
    '--doc-sig-top': `${S.topPx}px`,
    '--doc-sig-bottom': `${S.bottomPx}px`,
    '--doc-sig-w': `${S.widthPx}px`,
    '--doc-sig-rule-h': `${S.rulePx}px`,
    '--doc-sig-rule-box': `${S.ruleHeightPx}px`,
    '--doc-sig-label-size': `${S.labelPx}px`,
    '--doc-sig-label-track': `${S.labelTrackingEm}em`,
    '--doc-sig-label-top': `${S.labelTopPx}px`,
  }
  for (const level of [1, 2, 3, 4, 5, 6]) {
    const h = DOC_HEADINGS[level]
    vars[`--doc-h${level}-size`] = `${h.sizePx}px`
    vars[`--doc-h${level}-top`] = `${h.topPx}px`
    vars[`--doc-h${level}-bottom`] = `${h.bottomPx}px`
  }
  return vars
}
