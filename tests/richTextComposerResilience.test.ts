import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// A stored letter whose HTML the Lexical schema can't parse must never crash the
// whole HQ workspace. The editor guards its HTML parsing and degrades to a plain
// editable field, and the workspace boundary offers a real page reload.
describe('rich text editor resilience', () => {
  const composer = read('../src/components/admin/RichTextComposer.tsx')
  const boundary = read('../src/components/admin/AdminPageBoundary.tsx')

  it('guards both HTML->nodes parses so a bad letter cannot throw synchronously', () => {
    // Two parse sites: initial editorState and the value-sync effect.
    const guarded = composer.match(/try \{[\s\S]*?\$generateNodesFromDOM/g) || []
    expect(guarded.length).toBeGreaterThanOrEqual(2)
  })

  it('wraps the editor in a local boundary with an editable fallback', () => {
    expect(composer).toContain('class ComposerBoundary')
    expect(composer).toContain('static getDerivedStateFromError')
    expect(composer).toContain('<ComposerBoundary fallback={fallback}>')
    // The fallback keeps the letter editable, not a dead end.
    expect(composer).toContain('<textarea')
  })

  it('gives the workspace boundary a real full-page reload and stale-chunk recovery', () => {
    expect(boundary).toContain('isChunkLoadError')
    expect(boundary).toContain('window.location.reload()')
    expect(boundary).toContain('Reload the page')
  })
})
