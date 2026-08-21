import { ELEMENT_TRANSFORMERS, TEXT_FORMAT_TRANSFORMERS, TEXT_MATCH_TRANSFORMERS, type Transformer } from '@lexical/markdown'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { LinkNode } from '@lexical/link'
import { ListNode, ListItemNode } from '@lexical/list'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'
import type { Klass, LexicalNode } from 'lexical'
import { PmvImageNode } from './richTextImage'
import { VariableNode } from './richTextVariable'

// The editor schema, kept in one place so the node list and the markdown
// transformer list cannot drift apart.
//
// They drifting apart is not hypothetical: MarkdownShortcutPlugin validates
// every element/text-match/multiline transformer's declared dependencies
// against the registered nodes and throws if one is missing. The default
// TRANSFORMERS export includes a fenced-code transformer that depends on
// CodeNode, which this editor does not register, so using the default list
// crashed the composer on EVERY mount, whatever the content was. That is what
// put the "Rich formatting could not load" textarea in front of everyone.

export const COMPOSER_NODES: Array<Klass<LexicalNode>> = [
  PmvImageNode,
  VariableNode,
  HeadingNode,
  QuoteNode,
  LinkNode,
  ListNode,
  ListItemNode,
  TableNode,
  TableCellNode,
  TableRowNode,
]

// Markdown shortcuts minus fenced code blocks. A letter or an email has no use
// for a code block, so the transformer is dropped rather than dragging in
// @lexical/code purely to satisfy a dependency check.
export const LETTER_TRANSFORMERS: Transformer[] = [
  ...ELEMENT_TRANSFORMERS,
  ...TEXT_FORMAT_TRANSFORMERS,
  ...TEXT_MATCH_TRANSFORMERS,
]

/**
 * Every node the configured transformers require.
 *
 * Mirrors the check inside registerMarkdownShortcuts, so a test can assert the
 * two lists agree instead of the mismatch surfacing as a runtime crash.
 */
export function transformerDependencies(transformers: Transformer[] = LETTER_TRANSFORMERS): Array<Klass<LexicalNode>> {
  const out: Array<Klass<LexicalNode>> = []
  for (const transformer of transformers) {
    if (transformer.type === 'element' || transformer.type === 'text-match' || transformer.type === 'multiline-element') {
      for (const node of transformer.dependencies) if (!out.includes(node)) out.push(node)
    }
  }
  return out
}
