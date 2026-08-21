import { Fragment, type ReactNode } from 'react'

// A safe, structured rich-text renderer. Template bodies are stored as a small
// markdown subset (no HTML is ever stored or injected) and rendered here into
// controlled React elements, so staff-authored copy can carry formatting and
// still be safe to show on public pages. Supported:
//   # Heading           -> h2
//   ## Subheading       -> h3
//   - item              -> bullet list
//   1. item             -> numbered list
//   **bold**  *italic*  _italic_  [label](https://…)
// Blank lines separate blocks. Anything else is a paragraph.

type Inline = { text: string } | { bold: Inline[] } | { italic: Inline[] } | { link: string; children: Inline[] }

export type RichBlock =
  | { kind: 'heading'; level: 2 | 3; inline: Inline[] }
  | { kind: 'paragraph'; inline: Inline[] }
  | { kind: 'bullets'; items: Inline[][] }
  | { kind: 'numbers'; items: Inline[][] }

// Only these URL shapes are allowed on a link; anything else (javascript:, data:)
// renders as plain text so a link can never smuggle in script.
export function safeHref(url: string): string | null {
  return /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url.trim()) ? url.trim() : null
}

export function parseInline(text: string): Inline[] {
  // A fresh regex per call: parseInline recurses into itself for the contents of
  // bold/italic/link runs, and a shared /g regex's lastIndex would be clobbered
  // by the inner call mid-iteration - which previously spun the outer loop
  // forever and exhausted memory.
  const re = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*([^*]+)\*)|(_([^_]+)_)/g
  const out: Inline[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    if (m[2] !== undefined) out.push({ bold: parseInline(m[2]) })
    else if (m[3] !== undefined) out.push({ link: m[5], children: parseInline(m[4]) })
    else if (m[7] !== undefined) out.push({ italic: parseInline(m[7]) })
    else if (m[9] !== undefined) out.push({ italic: parseInline(m[9]) })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

export function parseRichText(source: string): RichBlock[] {
  const blocks: RichBlock[] = []
  const paragraphLines: string[] = []
  const flushParagraph = () => {
    if (paragraphLines.length) {
      blocks.push({ kind: 'paragraph', inline: parseInline(paragraphLines.join(' ')) })
      paragraphLines.length = 0
    }
  }
  const lines = (source || '').replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') { flushParagraph(); i++; continue }
    if (/^#\s+/.test(line)) { flushParagraph(); blocks.push({ kind: 'heading', level: 2, inline: parseInline(line.replace(/^#\s+/, '')) }); i++; continue }
    if (/^##\s+/.test(line)) { flushParagraph(); blocks.push({ kind: 'heading', level: 3, inline: parseInline(line.replace(/^##\s+/, '')) }); i++; continue }
    if (/^-\s+/.test(line)) {
      flushParagraph()
      const items: Inline[][] = []
      while (i < lines.length && /^-\s+/.test(lines[i])) { items.push(parseInline(lines[i].replace(/^-\s+/, ''))); i++ }
      blocks.push({ kind: 'bullets', items })
      continue
    }
    if (/^\d+\.\s+/.test(line)) {
      flushParagraph()
      const items: Inline[][] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(parseInline(lines[i].replace(/^\d+\.\s+/, ''))); i++ }
      blocks.push({ kind: 'numbers', items })
      continue
    }
    paragraphLines.push(line)
    i++
  }
  flushParagraph()
  return blocks
}

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, i) => {
    if ('text' in node) return <Fragment key={i}>{node.text}</Fragment>
    if ('bold' in node) return <strong key={i}>{renderInline(node.bold)}</strong>
    if ('italic' in node) return <em key={i}>{renderInline(node.italic)}</em>
    const href = safeHref(node.link)
    if (!href) return <Fragment key={i}>{renderInline(node.children)}</Fragment>
    const external = /^https?:\/\//i.test(href)
    return <a key={i} href={href} className="text-gold underline hover:text-gold-300" {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{renderInline(node.children)}</a>
  })
}

export function RichText({ source, className = '' }: { source: string; className?: string }) {
  const blocks = parseRichText(source)
  return <div className={className}>{blocks.map((block, i) => {
    if (block.kind === 'heading') {
      return block.level === 2
        ? <h3 key={i} className="mt-4 font-display text-lg font-bold first:mt-0">{renderInline(block.inline)}</h3>
        : <h4 key={i} className="mt-3 font-display text-base font-semibold first:mt-0">{renderInline(block.inline)}</h4>
    }
    if (block.kind === 'bullets') return <ul key={i} className="ml-5 mt-2 list-disc space-y-1">{block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}</ul>
    if (block.kind === 'numbers') return <ol key={i} className="ml-5 mt-2 list-decimal space-y-1">{block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}</ol>
    return <p key={i} className="mt-2 leading-7 first:mt-0">{renderInline(block.inline)}</p>
  })}</div>
}
