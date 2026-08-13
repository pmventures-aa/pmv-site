// Shared HTML sanitizer for admin-authored and inbound content that is later
// rendered with dangerouslySetInnerHTML. Intentionally small allowlist.

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'a', 'span', 'div',
  'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'code', 'hr', 'table', 'thead',
  'tbody', 'tr', 'th', 'td',
])

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function sanitizeHtml(input: string, maxLen = 60_000): string {
  const stripped = String(input || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // Quoted and unquoted event handlers
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .replace(/<(?!\/?(?:p|br|strong|b|em|i|u|ul|ol|li|a|span|div|h[1-4]|blockquote|pre|code|hr|table|thead|tbody|tr|th|td)\b)[^>]*>/gi, '')

  // Strip attributes except safe href/target/rel on anchors and colspan/rowspan on tables.
  const cleaned = stripped.replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (match, rawTag: string, attrs = '') => {
    const tag = rawTag.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) return ''
    const closing = match.startsWith('</')
    if (closing) return `</${tag}>`
    if (tag === 'br' || tag === 'hr') return `<${tag}>`
    if (tag === 'a') {
      const hrefMatch = attrs.match(/\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
      const href = (hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4] ?? '').trim()
      if (!href || !/^(https?:\/\/|mailto:|\/)/i.test(href) || /^(javascript:|data:)/i.test(href)) {
        return '<a>'
      }
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">`
    }
    return `<${tag}>`
  })

  return cleaned.slice(0, maxLen)
}

/** Escape plain text and wrap paragraphs for safe banner/message bodies. */
export function plainTextToSafeHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

/** Escape a URL for use inside an HTML attribute. */
export function safeHref(url: string): string | null {
  const trimmed = String(url || '').trim()
  if (!/^https?:\/\//i.test(trimmed)) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return escapeHtml(parsed.toString())
  } catch {
    return null
  }
}
