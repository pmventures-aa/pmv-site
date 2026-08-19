// One source of truth for document page geometry, shared by the on-screen
// editor (CSS px at 96dpi), browser print (@page keyword), and the PDF export
// (points, 1/72in). Keeping preview, print, and export on the same table is what
// makes "what you see is what exports" hold for Letter, Legal, and A4.

export type DocPageSizeKey = 'letter' | 'legal' | 'a4'
export type DocMarginKey = 'normal' | 'narrow' | 'wide'

export interface DocPageSize {
  key: DocPageSizeKey
  label: string
  screen: { w: number; h: number } // CSS px at 96dpi
  pt: { w: number; h: number } // PDF points
  css: string // CSS @page size keyword
}

export const DOC_PAGE_SIZES: DocPageSize[] = [
  { key: 'letter', label: 'Letter · 8.5 × 11 in', screen: { w: 816, h: 1056 }, pt: { w: 612, h: 792 }, css: 'letter' },
  { key: 'legal', label: 'Legal · 8.5 × 14 in', screen: { w: 816, h: 1344 }, pt: { w: 612, h: 1008 }, css: 'legal' },
  { key: 'a4', label: 'A4 · 210 × 297 mm', screen: { w: 794, h: 1123 }, pt: { w: 595.28, h: 841.89 }, css: 'A4' },
]

export function isDocPageSize(v: unknown): v is DocPageSizeKey {
  return v === 'letter' || v === 'legal' || v === 'a4'
}

export function isDocMargin(v: unknown): v is DocMarginKey {
  return v === 'normal' || v === 'narrow' || v === 'wide'
}

export function docPageSize(key: string | null | undefined): DocPageSize {
  return DOC_PAGE_SIZES.find((s) => s.key === key) ?? DOC_PAGE_SIZES[0]
}

// Side / top / bottom margins in points for the PDF export, matched to the
// on-screen margin presets so the printable box lines up with the editor.
export const DOC_MARGIN_PT: Record<DocMarginKey, { x: number; top: number; bottom: number }> = {
  normal: { x: 54, top: 54, bottom: 48 },
  narrow: { x: 40, top: 44, bottom: 40 },
  wide: { x: 76, top: 66, bottom: 60 },
}

export function docMargins(key: string | null | undefined): { x: number; top: number; bottom: number } {
  return DOC_MARGIN_PT[key as DocMarginKey] ?? DOC_MARGIN_PT.normal
}
