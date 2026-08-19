import { describe, expect, it } from 'vitest'
import { DOC_FONTS, looksLikeHtml, toEditorHtml } from '../shared/docHtml'

describe('document html helpers', () => {
  it('keeps existing markup and escapes plain text', () => {
    expect(looksLikeHtml('<p>Hello</p>')).toBe(true)
    expect(looksLikeHtml('Hello')).toBe(false)
    expect(toEditorHtml('Line 1\nLine 2')).toBe('Line 1<br>Line 2')
    expect(toEditorHtml('<h1>Title</h1>')).toBe('<h1>Title</h1>')
    expect(toEditorHtml('A & B < C')).toBe('A &amp; B &lt; C')
  })

  it('offers a substantial, grouped set of professional fonts with real fallback stacks', () => {
    const labels = DOC_FONTS.map((font) => font.label)
    // A real library, not a handful.
    expect(DOC_FONTS.length).toBeGreaterThanOrEqual(16)
    for (const expected of ['Georgia', 'Times New Roman', 'Garamond', 'Arial', 'Calibri', 'Courier New']) {
      expect(labels).toContain(expected)
    }
    // Every font is grouped and carries a multi-family fallback stack so a
    // missing face degrades within its genre instead of to something unrelated.
    for (const font of DOC_FONTS) {
      expect(['Serif', 'Sans serif', 'Monospace']).toContain(font.group)
      expect(font.value).toContain(',')
      expect(font.value).toMatch(/serif|sans-serif|monospace/)
    }
  })
})
