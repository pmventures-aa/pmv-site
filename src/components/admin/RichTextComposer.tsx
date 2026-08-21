import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isElementNode,
  $isRangeSelection,
  type EditorThemeClasses,
  type LexicalEditor,
  type LexicalNode,
  type RangeSelection,
  type TextNode,
} from 'lexical'
import { LexicalComposer, type InitialConfigType } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'
import { EditorRefPlugin } from '@lexical/react/LexicalEditorRefPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext'
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { $patchStyleText, $setBlocksType } from '@lexical/selection'
import { $createHeadingNode, $createQuoteNode, HeadingNode, QuoteNode } from '@lexical/rich-text'
import { LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
  $isListItemNode,
  ListNode,
  ListItemNode,
} from '@lexical/list'
import {
  INSERT_TABLE_COMMAND,
  $findTableNode,
  $getTableCellNodeFromLexicalNode,
  $mergeCells,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '@lexical/table'
import type { Provider } from '@lexical/yjs'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { IndexeddbPersistence } from 'y-indexeddb'
import { AlignCenter, AlignLeft, AlignRight, Highlighter, Merge, Search, Sparkles, Table, X } from 'lucide-react'
import { DOC_FONTS, DOC_SIZES } from '../../../shared/docHtml'
import { $createPmvImageNode, PmvImageNode } from './richTextImage'
import { registerVariableChips } from './richTextVariable'
import { COMPOSER_NODES, LETTER_TRANSFORMERS } from './richTextSchema'

const LETTER_COLORS = [
  { label: 'Navy', value: '#0a1728' },
  { label: 'Gold', value: '#c9a227' },
  { label: 'Blue', value: '#1d4e89' },
  { label: 'Slate', value: '#5b6573' },
  { label: 'Green', value: '#1f6b4a' },
  { label: 'Red', value: '#9a3b32' },
  { label: 'Black', value: '#111111' },
  { label: 'White', value: '#ffffff' },
]

type AIAction = 'rewrite' | 'shorten' | 'expand'
export type RichTextComposerProps = {
  value: string
  onChange: (html: string) => void
  onUploadImage?: (file: File) => Promise<string>
  fill?: boolean
  placeholder?: string
  surface?: 'hq' | 'letter'
  footer?: ReactNode
  initialHTML?: string
  collaborationRoom?: string
  onAIRequest?: (selection: string, action: AIAction) => Promise<string>
}

type SyncHandle = { lastEmitted: string; flush: (() => void) | null }

function buildTheme(surface: 'hq' | 'letter'): EditorThemeClasses {
  const border = surface === 'letter' ? 'border-[#d8d2c4]' : 'border-slate-300'
  return {
    paragraph: 'm-0',
    heading: {
      h1: 'mb-2 text-2xl font-bold tracking-tight',
      h2: 'mb-2 text-xl font-semibold',
      h3: 'mb-2 text-lg font-semibold',
    },
    quote: 'my-2 border-l-2 border-slate-300 pl-3 italic',
    list: {
      ul: 'my-1 list-disc pl-6',
      ol: 'my-1 list-decimal pl-6',
      listitem: 'm-0',
      nested: { listitem: 'list-none' },
    },
    link: surface === 'letter' ? 'text-[#0a1728] underline' : 'text-sky-700 underline',
    text: { bold: 'font-bold', italic: 'italic', underline: 'underline', strikethrough: 'line-through' },
    table: 'my-3 border-collapse',
    tableCell: `border px-2 py-1 align-top ${border}`,
    tableCellHeader: `border px-2 py-1 text-left font-semibold ${border}`,
  }
}

function createCollabProvider(id: string, yjsDocMap: Map<string, Y.Doc>): Provider {
  let doc = yjsDocMap.get(id)
  if (!doc) {
    doc = new Y.Doc()
    yjsDocMap.set(id, doc)
  }
  const provider = new WebrtcProvider(`pmv-editor-${id}`, doc)
  new IndexeddbPersistence(`pmv-editor-${id}`, doc)
  provider.awareness.setLocalStateField('user', { name: 'Pinnacle staff', color: '#c9a227' })
  return provider as unknown as Provider
}

// Keeps "{{key}}" text and variable chips in sync. Registered as a transform
// rather than a one-time pass so it covers loading a saved template, pasting
// from another document, and typing a token by hand.
function VariableChipPlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => registerVariableChips(editor), [editor])
  return null
}

function ChangeEmitter({ onChange, handle }: { onChange: (html: string) => void; handle: { current: SyncHandle } }) {
  const [editor] = useLexicalComposerContext()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const latestRef = useRef('')
  const timerRef = useRef<number | null>(null)

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const html = latestRef.current
    if (html === handle.current.lastEmitted) return
    handle.current.lastEmitted = html
    onChangeRef.current(html)
  }, [handle])

  useEffect(() => {
    handle.current.flush = flush
    return () => {
      handle.current.flush = null
    }
  }, [handle, flush])

  useEffect(() => {
    const unregister = editor.registerUpdateListener(() => {
      const html = editor.getEditorState().read(() => $generateHtmlFromNodes(editor))
      latestRef.current = html
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(flush, 120)
    })
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      unregister()
    }
  }, [editor, flush])

  return null
}

function WordCount({ letter }: { letter: boolean }) {
  const [editor] = useLexicalComposerContext()
  const [count, setCount] = useState({ words: 0, chars: 0 })

  useEffect(() => {
    const update = () => {
      editor.getEditorState().read(() => {
        const text = $getRoot().getTextContent()
        const words = text.trim() ? text.trim().split(/\s+/).length : 0
        setCount({ words, chars: text.length })
      })
    }
    update()
    const unregister = editor.registerUpdateListener(update)
    return unregister
  }, [editor])

  return (
    <div className={`flex shrink-0 items-center justify-between gap-3 px-4 py-1.5 text-[11px] ${letter ? 'text-[#9aa3ae]' : 'border-t border-white/10 text-slate-500'}`}>
      <span>
        {count.words} word{count.words === 1 ? '' : 's'} · {count.chars} characters
      </span>
      <span className={letter ? 'hidden' : 'text-slate-600'}>Double-click a word to select, or use Find for precise edits.</span>
    </div>
  )
}

function Toolbar({
  letter,
  onUploadImage,
  onAIRequest,
}: {
  letter: boolean
  onUploadImage?: (file: File) => Promise<string>
  onAIRequest?: (selection: string, action: AIAction) => Promise<string>
}) {
  const [editor] = useLexicalComposerContext()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [ink, setInk] = useState(LETTER_COLORS[0].value)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiBusy, setAiBusy] = useState<AIAction | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [replaceWith, setReplaceWith] = useState('')
  const cursorRef = useRef(0)

  const tool = letter
    ? 'grid h-8 min-w-8 shrink-0 place-items-center rounded px-1.5 text-[13px] text-[#3d4a5c] hover:bg-black/[.06]'
    : 'inline-flex shrink-0 items-center justify-center rounded-md border border-white/12 bg-white/[.025] px-2.5 py-1 text-xs font-semibold text-slate-200 hover:border-gold/45 hover:text-gold'

  function run(fn: (selection: RangeSelection) => void) {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) fn(selection)
    })
  }

  function setBlockAlign(align: 'left' | 'center' | 'right' | 'justify') {
    editor.update(() => {
      const selection = $getSelection()
      if (selection) $setBlocksType(selection, () => {
        const paragraph = $createParagraphNode()
        paragraph.setFormat(align)
        return paragraph
      })
    })
  }

  function setBlockType(tag: 'P' | 'H1' | 'H2' | 'H3' | 'BLOCKQUOTE') {
    editor.update(() => {
      const selection = $getSelection()
      if (!selection) return
      if (tag === 'P') $setBlocksType(selection, () => $createParagraphNode())
      else if (tag === 'BLOCKQUOTE') $setBlocksType(selection, () => $createQuoteNode())
      else $setBlocksType(selection, () => $createHeadingNode(tag.toLowerCase() as 'h1' | 'h2' | 'h3'))
    })
  }

  function applyStyle(patch: Record<string, string>) {
    editor.update(() => {
      const selection = $getSelection()
      if (selection) $patchStyleText(selection, patch)
    })
  }

  function applyColor(color: string) {
    setInk(color)
    applyStyle({ color })
  }

  function insertLink() {
    const url = window.prompt('Link URL')
    if (url) editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
  }

  function toggleList(ordered: boolean) {
    const inList = editor.getEditorState().read(() => {
      const selection = $getSelection()
      const nodes = selection?.getNodes() ?? []
      return nodes.some((n) => $isListNode(n) || $isListItemNode(n))
    })
    editor.dispatchCommand(inList ? REMOVE_LIST_COMMAND : ordered ? INSERT_ORDERED_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND, undefined)
  }

  function insertTable() {
    editor.dispatchCommand(INSERT_TABLE_COMMAND, { columns: '3', rows: '3', includeHeaders: { rows: true, columns: true } })
  }

  function mergeCells() {
    editor.update(() => {
      const selection = $getSelection()
      if (!selection) return
      const nodes = selection.getNodes()
      if (nodes.length === 0) return
      const tableNode = $findTableNode(nodes[0])
      if (!tableNode) return
      const cellNodes = new Set<TableCellNode>()
      for (const node of nodes) {
        const cell = $getTableCellNodeFromLexicalNode(node)
        if (cell) cellNodes.add(cell)
      }
      if (cellNodes.size > 1) $mergeCells([...cellNodes])
    })
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onUploadImage) return
    try {
      const url = await onUploadImage(file)
      editor.update(() => {
        const node = $createPmvImageNode({ src: url, altText: file.name })
        $insertNodes([node])
      })
    } catch {
      window.alert('Image upload failed.')
    }
  }

  async function runAI(action: AIAction) {
    if (!onAIRequest) return
    const selected = editor.getEditorState().read(() => {
      const selection = $getSelection()
      return $isRangeSelection(selection) ? selection.getTextContent() : ''
    })
    if (!selected.trim()) {
      window.alert('Select some text first.')
      return
    }
    setAiBusy(action)
    try {
      const result = await onAIRequest(selected, action)
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) selection.insertText(result)
      })
    } finally {
      setAiBusy(null)
    }
  }

  function $scanFor(termToFind: string): { node: TextNode; start: number; end: number }[] {
    const results: { node: TextNode; start: number; end: number }[] = []
    for (const node of $getRoot().getAllTextNodes()) {
      const text = node.getTextContent()
      let idx = text.indexOf(termToFind)
      while (idx !== -1) {
        results.push({ node, start: idx, end: idx + termToFind.length })
        idx = text.indexOf(termToFind, idx + termToFind.length)
      }
    }
    return results
  }

  function findNext() {
    if (!term) return
    editor.update(() => {
      const matches = $scanFor(term)
      if (matches.length === 0) {
        window.alert(`No matches for "${term}".`)
        return
      }
      const match = matches[cursorRef.current % matches.length]
      cursorRef.current += 1
      match.node.select(match.start, match.end)
    })
  }

  function replaceOne() {
    if (!term) return
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection) && selection.getTextContent() === term) {
        selection.insertText(replaceWith)
      }
    })
    findNext()
  }

  function replaceAll() {
    if (!term) return
    editor.update(() => {
      for (const node of $getRoot().getAllTextNodes()) {
        const text = node.getTextContent()
        if (text.includes(term)) node.setTextContent(text.split(term).join(replaceWith))
      }
    })
    cursorRef.current = 0
  }

  const findPanel = (
    <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${letter ? 'border-b border-[#eeeae2] bg-[#faf8f3]' : 'border-b border-white/10 bg-white/[.03]'}`}>
      <Search size={13} className={letter ? 'text-[#9aa3ae]' : 'text-slate-500'} />
      <input
        className={`h-7 w-32 rounded border px-2 text-xs outline-none ${letter ? 'border-[#ddd6c8] bg-white text-[#1b2430]' : 'border-white/12 bg-white/[.05] text-slate-100'}`}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Find"
        aria-label="Find in document"
      />
      <input
        className={`h-7 w-32 rounded border px-2 text-xs outline-none ${letter ? 'border-[#ddd6c8] bg-white text-[#1b2430]' : 'border-white/12 bg-white/[.05] text-slate-100'}`}
        value={replaceWith}
        onChange={(e) => setReplaceWith(e.target.value)}
        placeholder="Replace with"
        aria-label="Replace with"
      />
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={findNext} className={`rounded px-2 py-1 text-xs font-semibold ${letter ? 'bg-[#0a1728] text-white hover:opacity-90' : 'bg-gold text-navy-950 hover:bg-gold-400'}`}>Find</button>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={replaceOne} className={`rounded border px-2 py-1 text-xs font-semibold ${letter ? 'border-[#ddd6c8] text-[#3d4a5c] hover:bg-black/[.05]' : 'border-white/12 text-slate-200 hover:bg-white/[.05]'}`}>Replace</button>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={replaceAll} className={`rounded border px-2 py-1 text-xs font-semibold ${letter ? 'border-[#ddd6c8] text-[#3d4a5c] hover:bg-black/[.05]' : 'border-white/12 text-slate-200 hover:bg-white/[.05]'}`}>Replace all</button>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setFindOpen(false)} className="ml-auto grid h-6 w-6 place-items-center rounded text-xs text-slate-500 hover:text-white" aria-label="Close find and replace"><X size={13} /></button>
    </div>
  )

  const aiPanel = (
    <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${letter ? 'border-b border-[#eeeae2] bg-[#faf8f3]' : 'border-b border-white/10 bg-white/[.03]'}`}>
      <Sparkles size={13} className={letter ? 'text-[#9aa3ae]' : 'text-gold'} />
      <span className={`text-xs font-semibold ${letter ? 'text-[#3d4a5c]' : 'text-slate-300'}`}>Rewrite selection</span>
      {(['rewrite', 'shorten', 'expand'] as const).map((action) => (
        <button
          key={action}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void runAI(action)}
          disabled={aiBusy !== null}
          className={`rounded border px-2 py-1 text-xs font-semibold capitalize disabled:opacity-50 ${letter ? 'border-[#ddd6c8] text-[#3d4a5c] hover:bg-black/[.05]' : 'border-white/12 text-slate-200 hover:bg-white/[.05]'}`}
        >
          {aiBusy === action ? 'Working…' : action}
        </button>
      ))}
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setAiOpen(false)} className="ml-auto grid h-6 w-6 place-items-center rounded text-xs text-slate-500 hover:text-white" aria-label="Close AI tools"><X size={13} /></button>
    </div>
  )

  return (
    <div className={`shrink-0 ${letter ? 'border-b border-[#e7e4dc] bg-[#f4f1ea]' : 'border-b border-white/10 bg-navy-900'}`}>
      {findOpen && findPanel}
      {aiOpen && aiPanel}
      <div className={`flex flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible ${letter ? 'px-3 py-1.5' : 'p-2'}`}>
        {letter && (
          <>
            <select className="h-8 max-w-[7.5rem] shrink-0 rounded border border-[#ddd6c8] bg-white px-1 text-[12px] text-[#1b2430]" defaultValue="P" title="Paragraph style" onMouseDown={(e) => e.preventDefault()} onChange={(e) => setBlockType(e.target.value as 'P' | 'H1' | 'H2' | 'H3' | 'BLOCKQUOTE')}>
              <option value="P">Body</option>
              <option value="H1">Title</option>
              <option value="H2">Heading</option>
              <option value="H3">Subheading</option>
              <option value="BLOCKQUOTE">Quote</option>
            </select>
            <select className="h-8 max-w-[8.5rem] shrink-0 rounded border border-[#ddd6c8] bg-white px-1 text-[12px] text-[#1b2430]" defaultValue={DOC_FONTS[0].value} title="Font" onMouseDown={(e) => e.preventDefault()} onChange={(e) => applyStyle({ 'font-family': e.target.value })}>
              {DOC_FONTS.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}
            </select>
            <select className="h-8 w-[4.4rem] shrink-0 rounded border border-[#ddd6c8] bg-white px-1 text-[12px] text-[#1b2430]" defaultValue="15px" title="Size" onMouseDown={(e) => e.preventDefault()} onChange={(e) => applyStyle({ 'font-size': e.target.value })}>
              {DOC_SIZES.map((size) => <option key={size} value={size}>{size.replace('px', '')}</option>)}
            </select>
            <span className="mx-1 h-4 w-px shrink-0 bg-[#ddd6c8]" />
          </>
        )}
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => run((s) => s.toggleFormat('bold'))} title="Bold"><strong>B</strong></button>
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => run((s) => s.toggleFormat('italic'))} title="Italic"><em>I</em></button>
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => run((s) => s.toggleFormat('underline'))} title="Underline"><span className="underline">U</span></button>
        <span className={`mx-1 h-4 w-px shrink-0 ${letter ? 'bg-[#ddd6c8]' : 'bg-white/10'}`} />
        <span className={`shrink-0 px-0.5 text-[10px] font-semibold uppercase tracking-[.12em] ${letter ? 'text-[#7b8492]' : 'text-slate-500'}`}>Align</span>
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => setBlockAlign('left')} title="Align left"><AlignLeft size={15} /></button>
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => setBlockAlign('center')} title="Align center"><AlignCenter size={15} /></button>
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => setBlockAlign('right')} title="Align right"><AlignRight size={15} /></button>
        <span className={`mx-1 h-4 w-px shrink-0 ${letter ? 'bg-[#ddd6c8]' : 'bg-white/10'}`} />
        <span className={`shrink-0 px-0.5 text-[10px] font-semibold uppercase tracking-[.12em] ${letter ? 'text-[#7b8492]' : 'text-slate-500'}`}>Color</span>
        {LETTER_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyColor(c.value)}
            className={`h-6 w-6 shrink-0 rounded-sm border ${ink === c.value ? (letter ? 'border-[#0a1728] ring-1 ring-[#0a1728]/30' : 'border-gold ring-1 ring-gold/40') : 'border-black/15'}`}
            style={{ background: c.value }}
          />
        ))}
        <input type="color" title="Custom color" value={ink} className="h-7 w-8 shrink-0 cursor-pointer border-0 bg-transparent p-0" onMouseDown={(e) => e.preventDefault()} onChange={(e) => applyColor(e.target.value)} />
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => applyStyle({ 'background-color': '#f5e6b8' })} title="Highlight"><Highlighter size={14} /></button>
        <span className={`mx-1 h-4 w-px shrink-0 ${letter ? 'bg-[#ddd6c8]' : 'bg-white/10'}`} />
        <button type="button" className={`${tool} text-[12px]`} onMouseDown={(e) => e.preventDefault()} onClick={() => toggleList(false)}>Bullets</button>
        <button type="button" className={`${tool} text-[12px]`} onMouseDown={(e) => e.preventDefault()} onClick={() => toggleList(true)}>Numbers</button>
        <button type="button" className={`${tool} text-[12px]`} onMouseDown={(e) => e.preventDefault()} onClick={insertLink}>Link</button>
        <button type="button" className={`${tool} text-[12px]`} onMouseDown={(e) => e.preventDefault()} onClick={insertTable} title="Insert table"><Table size={14} /> Table</button>
        <button type="button" className={`${tool} text-[12px]`} onMouseDown={(e) => e.preventDefault()} onClick={mergeCells} title="Merge selected cells"><Merge size={14} /> Merge</button>
        {onUploadImage && (
          <>
            <button type="button" className={`${tool} text-[12px]`} onMouseDown={(e) => e.preventDefault()} onClick={() => fileInputRef.current?.click()}>Image</button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onPickImage} />
          </>
        )}
        <button type="button" className={`${tool} text-[12px]`} onMouseDown={(e) => e.preventDefault()} onClick={() => setFindOpen((v) => !v)} title="Find and replace"><Search size={14} /> Find</button>
        {onAIRequest && (
          <button type="button" className={`${tool} text-[12px]`} onMouseDown={(e) => e.preventDefault()} onClick={() => setAiOpen((v) => !v)} title="AI assist"><Sparkles size={14} /> AI</button>
        )}
      </div>
    </div>
  )
}

// Root only accepts block-level nodes; wrap any stray inline/text nodes that
// parsing produced in a paragraph so appending them can never corrupt the tree.
function appendHtmlToRoot(editor: LexicalEditor, html: string) {
  const dom = new DOMParser().parseFromString(html, 'text/html')
  const nodes = $generateNodesFromDOM(editor, dom)
  const root = $getRoot()
  root.clear()
  const safe = nodes.map((node: LexicalNode) => ($isElementNode(node) ? node : $createParagraphNode().append(node)))
  if (safe.length > 0) root.append(...safe)
}

// Reduce arbitrary HTML to readable text. Used to recover a working rich editor
// when a letter's stored markup cannot be parsed back into the schema, so staff
// keep rich formatting (with the text preserved) instead of a plain textarea.
function stripHtmlToText(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html || '', 'text/html')
    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
  } catch { return '' }
}

// The rich editor is a large, third-party-backed component. If Lexical throws
// while opening or rendering a letter, it must degrade rather than crash the
// entire HQ workspace boundary. This local boundary keeps the failure contained.
class ComposerBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { console.error('RichTextComposer crashed; showing plain editor', error) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export function RichTextComposer(props: RichTextComposerProps) {
  const { value, onChange, surface = 'hq', fill = false, placeholder } = props
  const letter = surface === 'letter'
  // Last-resort plain editor, only if even a text-seeded rich editor cannot mount.
  const plainFallback = (
    <div className={`flex min-h-0 flex-col ${fill ? 'h-full overflow-hidden' : ''} ${letter ? 'bg-transparent' : 'rounded-md border border-white/10 bg-navy-900'}`}>
      <p className={`shrink-0 px-4 py-2 text-[12px] ${letter ? 'border-b border-[#e7e4dc] bg-[#fff8e1] text-[#7a5b00]' : 'border-b border-amber-400/20 bg-amber-400/[.06] text-amber-200'}`}>
        Rich formatting could not load for this letter. You can still edit the content below and save.
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`min-h-[240px] w-full flex-1 resize-none px-4 py-3 font-mono text-[13px] leading-6 outline-none ${letter ? 'bg-[#faf8f3] text-[#1b2430]' : 'bg-navy-900 text-slate-100'}`}
      />
    </div>
  )
  // If the rich editor crashes opening the stored markup, recover into a fresh
  // rich editor seeded with just the letter's text - so rich formatting stays
  // available (formatting reset, wording preserved) instead of dropping to a
  // plain box. A distinct key forces a clean remount so it does not re-crash on
  // the same markup.
  const recovered = (
    <ComposerBoundary fallback={plainFallback}>
      <RichTextComposerInner {...props} key="recovered-plain" value={stripHtmlToText(value)} />
    </ComposerBoundary>
  )
  return (
    <ComposerBoundary fallback={recovered}>
      <RichTextComposerInner {...props} />
    </ComposerBoundary>
  )
}

function RichTextComposerInner({
  value,
  onChange,
  onUploadImage,
  fill = false,
  placeholder,
  surface = 'hq',
  footer,
  initialHTML,
  collaborationRoom,
  onAIRequest,
}: RichTextComposerProps) {
  const letter = surface === 'letter'
  const editorRef = useRef<LexicalEditor | null>(null)
  const syncHandle = useRef<SyncHandle>({ lastEmitted: initialHTML || value, flush: null })

  const initialConfig = useMemo<InitialConfigType>(
    () => ({
      namespace: 'pmv-rich-text',
      theme: buildTheme(surface),
      onError: (error: Error) => {
        console.error(error)
      },
      nodes: COMPOSER_NODES,
      editorState: (editor: LexicalEditor) => {
        const html = initialHTML || value
        if (!html) return
        // Parsing stored HTML into Lexical nodes can throw on markup the schema
        // does not expect. That must never take down the whole HQ workspace, so
        // fall back to an empty document and let the editable fallback handle it.
        try {
          appendHtmlToRoot(editor, html)
        } catch (err) {
          console.error('RichTextComposer: could not parse initial HTML', err)
        }
      },
    }),
    [initialHTML, surface, value],
  )

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || value === syncHandle.current.lastEmitted) return
    syncHandle.current.lastEmitted = value
    editor.update(() => {
      try {
        appendHtmlToRoot(editor, value || '<p><br></p>')
      } catch (err) {
        console.error('RichTextComposer: could not sync HTML value', err)
      }
    })
  }, [value])

  const letterFlow = fill && footer
  const editorClass = letter
    ? `${letterFlow ? 'min-h-[240px]' : fill ? 'h-full min-h-[240px] overflow-y-auto' : 'min-h-48'} relative px-4 py-5 font-serif text-[15px] leading-[1.75] text-[#1b2430] outline-none sm:px-8 [&_a]:text-[#0a1728] [&_a]:underline [&_img]:my-2 [&_img]:max-w-full`
    : `${fill ? 'h-full min-h-[280px] overflow-y-auto' : 'min-h-48'} relative max-w-none bg-white px-4 py-3 text-sm text-navy-950 outline-none [&_a]:text-sky-700 [&_a]:underline [&_img]:my-2 [&_img]:max-w-full`

  return (
    <div className={`flex min-h-0 flex-col ${fill ? 'h-full overflow-hidden' : ''} ${letter ? 'bg-transparent' : 'rounded-md border border-white/10 bg-navy-900'}`}>
      <LexicalComposer initialConfig={initialConfig}>
        <EditorRefPlugin editorRef={editorRef} />
        <Toolbar letter={letter} onUploadImage={onUploadImage} onAIRequest={onAIRequest} />
        {collaborationRoom ? (
          <LexicalCollaboration>
            <CollaborationPlugin id={collaborationRoom} providerFactory={createCollabProvider} shouldBootstrap username="Pinnacle staff" cursorColor="#c9a227" />
          </LexicalCollaboration>
        ) : (
          <HistoryPlugin />
        )}
        <LinkPlugin />
        <ListPlugin />
        <TablePlugin hasHorizontalScroll />
        <MarkdownShortcutPlugin transformers={LETTER_TRANSFORMERS} />
        <VariableChipPlugin />
        <ChangeEmitter onChange={onChange} handle={syncHandle} />
        <div className={`relative min-h-0 ${fill ? (letterFlow ? 'flex-1 overflow-y-auto' : 'flex-1 overflow-hidden') : ''}`}>
          <div className={`relative ${fill && !letterFlow ? 'h-full' : ''}`}>
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className={editorClass}
                  onBlur={() => syncHandle.current.flush?.()}
                  {...(placeholder
                    ? {
                        'aria-placeholder': placeholder,
                        placeholder: (
                          <p className={`pointer-events-none absolute ${letter ? 'left-4 top-5 font-serif text-[15px] italic text-[#9aa3ae] sm:left-8' : 'left-4 top-3 text-sm text-slate-500'}`}>
                            {placeholder}
                          </p>
                        ),
                      }
                    : { placeholder: null })}
                />
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
          </div>
          {footer}
        </div>
        <WordCount letter={letter} />
      </LexicalComposer>
    </div>
  )
}
