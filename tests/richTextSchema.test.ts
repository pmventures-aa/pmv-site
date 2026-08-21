import { describe, expect, it } from 'vitest'
import { TRANSFORMERS } from '@lexical/markdown'
import {
  COMPOSER_NODES,
  LETTER_TRANSFORMERS,
  transformerDependencies,
} from '../src/components/admin/richTextSchema'

// Regression guard for the bug that put "Rich formatting could not load for
// this letter" in front of every editor, always.
//
// MarkdownShortcutPlugin validates each element/text-match/multiline
// transformer's declared dependencies against the registered nodes and throws
// when one is missing. The plugin was mounted with Lexical's default
// TRANSFORMERS, which include a fenced-code transformer depending on CodeNode,
// and CodeNode was never registered. So the composer threw on EVERY mount
// regardless of content, both error boundaries fired, and everyone landed in
// the raw-HTML textarea.
//
// These assert the real invariant, not the shape of the source.
describe('editor schema and markdown transformers agree', () => {
  it('registers every node the configured transformers depend on', () => {
    const missing = transformerDependencies(LETTER_TRANSFORMERS)
      .filter((node) => !COMPOSER_NODES.includes(node))
      .map((node) => node.getType())
    expect(missing, `transformers depend on unregistered nodes: ${missing.join(', ')}`).toEqual([])
  })

  it('would have caught the original bug', () => {
    // Lexical's default list is exactly what was mounted before the fix.
    const missing = transformerDependencies(TRANSFORMERS)
      .filter((node) => !COMPOSER_NODES.includes(node))
      .map((node) => node.getType())
    expect(missing).toContain('code')
  })

  it('keeps the formatting shortcuts a letter actually needs', () => {
    const types = LETTER_TRANSFORMERS.map((t) => t.type)
    expect(types).toContain('element')
    expect(types).toContain('text-format')
    expect(types).toContain('text-match')
    // Dropping the code transformer must not drop everything else with it.
    expect(LETTER_TRANSFORMERS.length).toBeGreaterThan(10)
  })

  it('drops only the fenced-code transformer from the defaults', () => {
    expect(LETTER_TRANSFORMERS.length).toBe(TRANSFORMERS.length - 1)
  })

  it('registers the nodes the toolbar can actually insert', () => {
    const types = COMPOSER_NODES.map((n) => n.getType())
    for (const type of ['heading', 'quote', 'link', 'list', 'listitem', 'table', 'pmvVariable', 'pmvImage']) {
      expect(types, `missing node: ${type}`).toContain(type)
    }
  })
})
