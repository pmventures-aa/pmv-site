import { describe, expect, it } from 'vitest'
import { plainTextToSafeHtml, sanitizeHtml, safeHref } from '../functions/_lib/htmlSanitize'

describe('htmlSanitize', () => {
  it('strips scripts and event handlers including unquoted ones', () => {
    const dirty = `<p>Hello</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a><div onclick='evil()'>ok</div>`
    const clean = sanitizeHtml(dirty)
    expect(clean).not.toMatch(/script/i)
    expect(clean).not.toMatch(/onerror/i)
    expect(clean).not.toMatch(/onclick/i)
    expect(clean).not.toMatch(/javascript:/i)
    expect(clean).toContain('<p>Hello</p>')
  })

  it('keeps safe anchor hrefs and drops unsafe ones', () => {
    const clean = sanitizeHtml(`<a href="https://example.com/path?q=1">link</a><a href="javascript:void(0)">bad</a>`)
    expect(clean).toContain('href="https://example.com/path?q=1"')
    expect(clean).toContain('rel="noopener noreferrer"')
    expect(clean).not.toContain('javascript:')
  })

  it('escapes plain text when converting to HTML', () => {
    const html = plainTextToSafeHtml('Line 1\nLine 2\n\n<script>x</script>')
    expect(html).toContain('<br/>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('validates href schemes', () => {
    expect(safeHref('https://pmv.example/a')).toContain('https://')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('not a url')).toBeNull()
  })
})
