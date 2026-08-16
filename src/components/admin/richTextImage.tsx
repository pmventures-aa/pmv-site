import { useEffect, useState, type JSX } from 'react'
import { DecoratorNode, $createNodeSelection, $getNodeByKey, $getSelection, $isNodeSelection, $setSelection, type EditorConfig, type LexicalEditor, type NodeKey, type SerializedLexicalNode, type Spread } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

export type SerializedPmvImageNode = Spread<
  {
    altText: string
    height?: number
    src: string
    width?: number
  },
  SerializedLexicalNode
>

export function $isPmvImageNode(node: unknown): node is PmvImageNode {
  return node instanceof PmvImageNode
}

export function $createPmvImageNode({ src, altText, width, height }: { src: string; altText: string; width?: number; height?: number }): PmvImageNode {
  return new PmvImageNode(src, altText, width, height)
}

export class PmvImageNode extends DecoratorNode<JSX.Element> {
  __src: string
  __altText: string
  __width?: number
  __height?: number

  static getType(): string {
    return 'pmvImage'
  }

  static clone(node: PmvImageNode): PmvImageNode {
    return new PmvImageNode(node.__src, node.__altText, node.__width, node.__height, node.__key)
  }

  constructor(src: string, altText: string, width?: number, height?: number, key?: NodeKey) {
    super(key)
    this.__src = src
    this.__altText = altText
    this.__width = width
    this.__height = height
  }

  static importJSON(serializedNode: SerializedPmvImageNode): PmvImageNode {
    const node = $createPmvImageNode({ src: serializedNode.src, altText: serializedNode.altText })
    node.setWidthAndHeight(serializedNode.width, serializedNode.height)
    return node
  }

  exportJSON(): SerializedPmvImageNode {
    return {
      type: this.getType(),
      version: 1,
      src: this.__src,
      altText: this.__altText,
      width: this.__width,
      height: this.__height,
    }
  }

  static importDOM(): import('lexical').DOMConversionMap | null {
    return {
      img: () => ({
        conversion: (element: HTMLElement) => {
          const img = element as HTMLImageElement
          if (!img.src) return null
          return {
            node: $createPmvImageNode({ src: img.src, altText: img.alt || '', width: img.width || undefined, height: img.height || undefined }),
          }
        },
        priority: 1,
      }),
    }
  }

  exportDOM() {
    const img = document.createElement('img')
    img.setAttribute('src', this.__src)
    img.setAttribute('alt', this.__altText)
    if (this.__width) img.setAttribute('width', String(this.__width))
    if (this.__height) img.setAttribute('height', String(this.__height))
    img.style.maxWidth = '100%'
    return { element: img }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement('span')
    span.className = 'inline-block max-w-full'
    return span
  }

  updateDOM(): boolean {
    return false
  }

  isInline(): boolean {
    return false
  }

  getSrc(): string {
    return this.__src
  }

  getAltText(): string {
    return this.__altText
  }

  setWidthAndHeight(width?: number, height?: number): void {
    const writable = this.getWritable()
    writable.__width = width
    writable.__height = height
  }

  decorate(_editor: LexicalEditor): JSX.Element {
    return <PmvImageComponent node={this} />
  }
}

function PmvImageComponent({ node }: { node: PmvImageNode }): JSX.Element {
  const [editor] = useLexicalComposerContext()
  const [selected, setSelected] = useState(false)

  useEffect(() => {
    const unregister = editor.registerUpdateListener(() => {
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        if (!$isNodeSelection(selection)) {
          setSelected(false)
          return
        }
        const target = $getNodeByKey(node.getKey())
        setSelected(Boolean(target) && selection.getNodes().some((n) => n.getKey() === node.getKey()))
      })
    })
    return unregister
  }, [editor, node])

  function onSelect() {
    editor.update(() => {
      const target = $getNodeByKey(node.getKey())
      if (target) {
        const nodeSelection = $createNodeSelection()
        nodeSelection.add(target.getKey())
        $setSelection(nodeSelection)
      }
    })
  }

  function onRemove() {
    editor.update(() => {
      const target = $getNodeByKey(node.getKey())
      if (target) target.remove()
    })
  }

  return (
    <span className="relative inline-block max-w-full">
      <img
        src={node.getSrc()}
        alt={node.getAltText()}
        draggable={false}
        onClick={onSelect}
        className={`my-2 max-w-full rounded ${selected ? 'ring-2 ring-gold/70' : ''}`}
      />
      {selected && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-1 top-3 rounded border border-white/15 bg-navy-950/90 px-2 py-1 text-xs font-semibold text-slate-200 hover:text-rose-300"
        >
          Remove
        </button>
      )}
    </span>
  )
}
