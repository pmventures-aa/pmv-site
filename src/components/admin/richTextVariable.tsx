import type { JSX } from 'react'
import {
  DecoratorNode,
  TextNode,
  $applyNodeReplacement,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical'
import { emailVariable, isKnownEmailVariable } from '../../../shared/emailVariables'

// Template variables as atomic chips.
//
// Before this, a variable was plain text: the insert menu emitted the
// characters "{{first_name}}" and nothing stopped someone backspacing into
// "{{first_nam}}", or a bold run splitting one token across two text nodes.
// A DecoratorNode is the fix: it selects and deletes as a single unit and has
// no editable interior, so a variable is either wholly present or wholly gone.
//
// The stored format is deliberately UNCHANGED. exportDOM emits the same
// "{{key}}" text the merge pipeline has always consumed, so nothing about
// shared/emailVariables, mergeHqTemplateHtml, or any saved template has to
// migrate. Chips are a purely in-editor representation, rebuilt on load by
// the text transform below.

export const VARIABLE_TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/

export type SerializedVariableNode = Spread<{ variableKey: string }, SerializedLexicalNode>

export function $isVariableNode(node: unknown): node is VariableNode {
  return node instanceof VariableNode
}

export function $createVariableNode(variableKey: string): VariableNode {
  return $applyNodeReplacement(new VariableNode(variableKey))
}

export class VariableNode extends DecoratorNode<JSX.Element> {
  __variableKey: string

  static getType(): string {
    return 'pmvVariable'
  }

  static clone(node: VariableNode): VariableNode {
    return new VariableNode(node.__variableKey, node.__key)
  }

  constructor(variableKey: string, key?: NodeKey) {
    super(key)
    this.__variableKey = variableKey
  }

  getVariableKey(): string {
    return this.__variableKey
  }

  static importJSON(serialized: SerializedVariableNode): VariableNode {
    return $createVariableNode(serialized.variableKey)
  }

  exportJSON(): SerializedVariableNode {
    return { type: this.getType(), version: 1, variableKey: this.__variableKey }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement('span')
    const theme = config.theme as { variableChip?: string }
    if (theme.variableChip) span.className = theme.variableChip
    return span
  }

  updateDOM(): false {
    return false
  }

  /**
   * Round-trips to the plain "{{key}}" the merge pipeline expects.
   *
   * Emitting a wrapper element here would put editor-only markup into every
   * outbound email and force a migration of saved templates. A bare text node
   * keeps stored HTML byte-identical to what the system produced before chips
   * existed.
   */
  exportDOM(): DOMExportOutput {
    // DOMExportOutput.element accepts a Text node, so no wrapper is needed.
    return { element: document.createTextNode(`{{${this.__variableKey}}}`) }
  }

  /** Plain-text extraction and copy/paste both see the token, not a blank. */
  getTextContent(): string {
    return `{{${this.__variableKey}}}`
  }

  isInline(): true {
    return true
  }

  /** No cursor position inside the chip: it is one indivisible thing. */
  isIsolated(): true {
    return true
  }

  isKeyboardSelectable(): true {
    return true
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    return <VariableChip variableKey={this.__variableKey} theme={config.theme as ChipTheme} />
  }
}

interface ChipTheme {
  variableChipKnown?: string
  variableChipUnknown?: string
}

const KNOWN_CLASS =
  'inline-flex items-center rounded border border-gold/40 bg-gold/[.12] px-1.5 py-px text-[.85em] font-semibold text-gold'
const UNKNOWN_CLASS =
  'inline-flex items-center rounded border border-red-400/50 bg-red-400/[.12] px-1.5 py-px text-[.85em] font-semibold text-red-200'

function VariableChip({ variableKey, theme }: { variableKey: string; theme: ChipTheme }) {
  const known = isKnownEmailVariable(variableKey)
  const meta = emailVariable(variableKey)
  // An unregistered variable renders empty when sent, so it is shown as a
  // problem in the editor rather than discovered in a delivered email.
  const className = known
    ? theme.variableChipKnown || KNOWN_CLASS
    : theme.variableChipUnknown || UNKNOWN_CLASS
  const title = known
    ? `${meta?.label ?? variableKey}${meta?.description ? `. ${meta.description}` : ''}`
    : `${variableKey} is not a known variable and will send as empty text.`
  return (
    <span className={className} title={title} data-variable={variableKey} contentEditable={false}>
      {meta?.label ?? variableKey}
    </span>
  )
}

/**
 * Turn "{{key}}" text into chips, wherever it comes from.
 *
 * Registered as a node transform rather than run once on load, so it covers
 * every route text can arrive by: opening a saved template, pasting from
 * another document, and typing a token by hand. Lexical re-runs transforms
 * until the tree settles, so a paragraph with several tokens converts fully
 * even though each pass handles one.
 */
export function $convertTextToVariableChips(node: TextNode): void {
  // Leave segmented or token-mode text alone; splitting those is unsafe.
  if (!node.isSimpleText()) return

  const match = VARIABLE_TOKEN_RE.exec(node.getTextContent())
  if (!match) return

  const start = match.index
  const end = start + match[0].length

  let target: TextNode
  if (start === 0) [target] = node.splitText(end)
  else [, target] = node.splitText(start, end)
  if (!target) return

  target.replace($createVariableNode(match[1]))
}

export function registerVariableChips(editor: LexicalEditor): () => void {
  return editor.registerNodeTransform(TextNode, $convertTextToVariableChips)
}

/** Every variable currently used in a document, in document order. */
export function collectVariableKeys(nodes: Iterable<unknown>): string[] {
  const keys: string[] = []
  for (const node of nodes) if ($isVariableNode(node)) keys.push(node.getVariableKey())
  return keys
}
