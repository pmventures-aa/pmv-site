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

  it('offers professional body fonts instead of a single default', () => {
    expect(DOC_FONTS.map((font) => font.label)).toEqual([
      'Georgia',
      'Palatino',
      'Times New Roman',
      'Garamond',
      'Calibri',
      'Arial',
    ])
  })
})
