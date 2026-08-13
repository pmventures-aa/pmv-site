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

export const DOC_FONTS = [
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Palatino', value: 'Palatino, "Palatino Linotype", "Book Antiqua", serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Garamond', value: 'Garamond, "EB Garamond", serif' },
  { label: 'Calibri', value: 'Calibri, "Segoe UI", sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
] as const

export const DOC_SIZES = ['10px', '11px', '12px', '14px', '16px', '18px', '21px', '24px', '36px'] as const

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
