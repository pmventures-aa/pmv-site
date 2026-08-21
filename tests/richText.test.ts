import { describe, it, expect } from 'vitest'
import { parseRichText, parseInline, safeHref } from '../src/components/RichText'

describe('rich text parser (safe structured formatting)', () => {
  it('keeps legacy plain text backward compatible', () => {
    const blocks = parseRichText('First paragraph.\n\nSecond paragraph.')
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'paragraph'])
  })

  it('parses bullet and numbered lists', () => {
    const bullets = parseRichText('- one\n- two')
    expect(bullets).toHaveLength(1)
    expect(bullets[0].kind).toBe('bullets')
    const numbers = parseRichText('1. one\n2. two\n3. three')
    expect(numbers[0].kind).toBe('numbers')
    if (numbers[0].kind === 'numbers') expect(numbers[0].items).toHaveLength(3)
  })

  it('parses headings at two levels', () => {
    const blocks = parseRichText('# Title\n\n## Subtitle')
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 2 })
    expect(blocks[1]).toMatchObject({ kind: 'heading', level: 3 })
  })

  it('parses inline bold, italic, and links', () => {
    const nodes = parseInline('Plain **bold** and *italic* and [site](https://x.co).')
    expect(nodes.some((n) => 'bold' in n)).toBe(true)
    expect(nodes.some((n) => 'italic' in n)).toBe(true)
    expect(nodes.some((n) => 'link' in n)).toBe(true)
  })

  it('leaves {{tokens}} untouched so resolution happens before rendering', () => {
    const nodes = parseInline('Hello {{first_name}}')
    expect(nodes).toEqual([{ text: 'Hello {{first_name}}' }])
  })

  it('only allows safe link protocols', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com')
    expect(safeHref('mailto:a@b.co')).toBe('mailto:a@b.co')
    expect(safeHref('/coverage')).toBe('/coverage')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<script>')).toBeNull()
  })
})
