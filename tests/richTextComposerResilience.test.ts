import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// A stored letter whose HTML the Lexical schema can't parse must never crash the
// whole HQ workspace. The editor guards its HTML parsing, recovers into a fresh
// rich editor seeded with the letter's text so rich formatting stays available,
// and only as a last resort drops to a plain editable field.
describe('rich text editor resilience', () => {
  const composer = read('../src/components/admin/RichTextComposer.tsx')
  const boundary = read('../src/components/admin/AdminPageBoundary.tsx')

  it('guards both HTML->nodes parses so a bad letter cannot throw synchronously', () => {
    // Both parse sites (initial editorState and the value-sync effect) go through
    // the shared, guarded appendHtmlToRoot helper.
    const guarded = composer.match(/try \{\s*appendHtmlToRoot\(/g) || []
    expect(guarded.length).toBeGreaterThanOrEqual(2)
    // Stray inline/text nodes are wrapped so appending them cannot corrupt root.
    expect(composer).toContain('$isElementNode(node) ? node : $createParagraphNode().append(node)')
  })

  it('recovers into a rich editor before falling back to a plain field', () => {
    expect(composer).toContain('class ComposerBoundary')
    expect(composer).toContain('static getDerivedStateFromError')
    // First failure recovers a text-seeded rich editor; only its failure hits the
    // plain textarea.
    expect(composer).toContain('<ComposerBoundary fallback={recovered}>')
    expect(composer).toContain('<ComposerBoundary fallback={plainFallback}>')
    expect(composer).toContain('value={stripHtmlToText(value)}')
    expect(composer).toContain('<textarea')
  })

  it('gives the workspace boundary a real full-page reload and stale-chunk recovery', () => {
    expect(boundary).toContain('isChunkLoadError')
    expect(boundary).toContain('window.location.reload()')
    expect(boundary).toContain('Reload the page')
  })
})
