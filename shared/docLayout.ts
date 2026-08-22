// One source of truth for document page geometry, shared by the on-screen
// editor (CSS px at 96dpi), browser print (@page keyword), and the PDF export
// (points, 1/72in). Keeping preview, print, and export on the same table is what
// makes "what you see is what exports" hold for Letter, Legal, and A4.

import { pt } from './documentTheme'

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

// Margin presets. Declared once in CSS px at 96dpi (what the editor shows)
// and converted to points for the PDF, so the printable box in the export is
// the same box the author saw. These used to be two hand-kept tables and they
// had drifted: "normal" was 64px on screen but 54pt (72px) in the PDF.
export const DOC_MARGINS: Record<DocMarginKey, { label: string; screen: { x: number; top: number; bottom: number } }> = {
  normal: { label: 'Normal margins', screen: { x: 72, top: 64, bottom: 48 } },
  narrow: { label: 'Narrow margins', screen: { x: 48, top: 52, bottom: 40 } },
  wide: { label: 'Wide margins', screen: { x: 108, top: 78, bottom: 60 } },
}

export const DOC_MARGIN_KEYS: DocMarginKey[] = ['normal', 'narrow', 'wide']

export function docMarginsScreen(key: string | null | undefined): { x: number; top: number; bottom: number } {
  return (DOC_MARGINS[key as DocMarginKey] ?? DOC_MARGINS.normal).screen
}

// Points, for the PDF export.
export function docMargins(key: string | null | undefined): { x: number; top: number; bottom: number } {
  const s = docMarginsScreen(key)
  return { x: pt(s.x), top: pt(s.top), bottom: pt(s.bottom) }
}
