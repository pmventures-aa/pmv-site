export function looksLikeHtml(value: string) {
  return /<[a-z][\s\S]*>/i.test(value)
}

export function toEditorHtml(value: string) {
  if (!value) return ''
  if (looksLikeHtml(value)) return value
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

// Curated document fonts, grouped for the picker. Every value is a full
// fallback stack that degrades within its own genre, so a name never silently
// resolves to a completely different-looking font on a machine that lacks it.
export const DOC_FONTS = [
  // Serif
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif', group: 'Serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif', group: 'Serif' },
  { label: 'Garamond', value: 'Garamond, "EB Garamond", Georgia, serif', group: 'Serif' },
  { label: 'Baskerville', value: 'Baskerville, "Baskerville Old Face", Georgia, serif', group: 'Serif' },
  { label: 'Palatino', value: 'Palatino, "Palatino Linotype", "Book Antiqua", serif', group: 'Serif' },
  { label: 'Book Antiqua', value: '"Book Antiqua", Palatino, Georgia, serif', group: 'Serif' },
  { label: 'Cambria', value: 'Cambria, Georgia, serif', group: 'Serif' },
  { label: 'Charter', value: 'Charter, "Bitstream Charter", Georgia, serif', group: 'Serif' },
  // Sans serif
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif', group: 'Sans serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif', group: 'Sans serif' },
  { label: 'Calibri', value: 'Calibri, "Segoe UI", sans-serif', group: 'Sans serif' },
  { label: 'Aptos', value: 'Aptos, "Segoe UI", system-ui, sans-serif', group: 'Sans serif' },
  { label: 'Segoe UI', value: '"Segoe UI", system-ui, sans-serif', group: 'Sans serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif', group: 'Sans serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif', group: 'Sans serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", Tahoma, sans-serif', group: 'Sans serif' },
  { label: 'System UI', value: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', group: 'Sans serif' },
  // Monospace
  { label: 'Courier New', value: '"Courier New", Courier, monospace', group: 'Monospace' },
  { label: 'Consolas', value: 'Consolas, "Courier New", monospace', group: 'Monospace' },
] as const

// Font groups in display order, for the picker's <optgroup>s.
export const DOC_FONT_GROUPS = ['Serif', 'Sans serif', 'Monospace'] as const

export const DOC_SIZES = ['8px', '9px', '10px', '11px', '12px', '14px', '16px', '18px', '20px', '22px', '24px', '26px', '28px', '32px', '36px', '40px', '48px', '54px', '60px', '72px'] as const

export const DOC_INK = [
  { label: 'Ink', value: '#1b2430' },
  { label: 'Navy', value: '#0a1728' },
  { label: 'Slate', value: '#475569' },
  { label: 'Gold', value: '#8a6a24' },
  { label: 'White', value: '#ffffff' },
] as const

export const DOC_HIGHLIGHT = [
  { label: 'None', value: 'transparent' },
  { label: 'Cream', value: '#f6f0d8' },
  { label: 'Gold', value: '#efe0a8' },
  { label: 'Grey', value: '#e8edf3' },
] as const
