import { useEffect, useRef, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Highlighter } from 'lucide-react'
import { DOC_FONTS, DOC_SIZES } from '../../../shared/docHtml'

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

export function RichTextComposer({
  value,
  onChange,
  onUploadImage,
  fill = false,
  placeholder,
  surface = 'hq',
}: {
  value: string
  onChange: (html: string) => void
  onUploadImage?: (file: File) => Promise<string>
  fill?: boolean
  placeholder?: string
  surface?: 'hq' | 'letter'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastValue = useRef(value)
  const savedRange = useRef<Range | null>(null)
  const letter = surface === 'letter'
  const [ink, setInk] = useState(LETTER_COLORS[0].value)

  useEffect(() => {
    if (ref.current && value !== lastValue.current && value !== ref.current.innerHTML) {
      ref.current.innerHTML = value
    }
    lastValue.current = value
  }, [value])

  function emit() {
    if (!ref.current) return
    lastValue.current = ref.current.innerHTML
    onChange(ref.current.innerHTML)
  }

  function saveSelection() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const node = sel.anchorNode
    if (!node || !ref.current?.contains(node)) return
    savedRange.current = sel.getRangeAt(0).cloneRange()
  }

  function restoreSelection() {
    const el = ref.current
    if (!el) return
    el.focus()
    const sel = window.getSelection()
    if (!sel || !savedRange.current) return
    sel.removeAllRanges()
    sel.addRange(savedRange.current)
  }

  function exec(command: string, arg?: string) {
    restoreSelection()
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand('defaultParagraphSeparator', false, 'div')
    document.execCommand(command, false, arg)
    saveSelection()
    emit()
  }

  function applyColor(color: string) {
    setInk(color)
    exec('foreColor', color)
  }

  function insertLink() {
    const url = window.prompt('Link URL')
    if (url) exec('createLink', url)
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onUploadImage) return
    try {
      const url = await onUploadImage(file)
      exec('insertImage', url)
    } catch {
      window.alert('Image upload failed.')
    }
  }

  function applyFontSize(px: string) {
    restoreSelection()
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand('fontSize', false, '7')
    const root = ref.current
    if (!root) return
    root.querySelectorAll('font[size="7"]').forEach((el) => {
      const span = document.createElement('span')
      span.style.fontSize = px
      span.innerHTML = (el as HTMLElement).innerHTML
      el.replaceWith(span)
    })
    root.querySelectorAll<HTMLElement>('span').forEach((span) => {
      if (span.style.fontSize === 'xxx-large' || span.style.fontSize === 'x-large') span.style.fontSize = px
    })
    saveSelection()
    emit()
  }

  const empty = !value || value === '<br>' || value === '<div><br></div>'
  const tool = letter
    ? 'grid h-8 min-w-8 place-items-center rounded px-1.5 text-[13px] text-[#3d4a5c] hover:bg-black/[.06]'
    : 'inline-flex items-center justify-center rounded-md border border-white/12 bg-white/[.025] px-2.5 py-1 text-xs font-semibold text-slate-200 hover:border-gold/45 hover:text-gold'

  return (
    <div className={`flex min-h-0 flex-col ${fill ? 'h-full' : ''} ${letter ? 'bg-transparent' : 'rounded-md border border-white/10 bg-navy-900'}`}>
      <div className={`flex shrink-0 flex-wrap items-center gap-1 ${letter ? 'border-b border-[#e7e4dc] bg-[#f4f1ea] px-3 py-1.5' : 'border-b border-white/10 p-2 gap-1.5'}`}>
        {letter && (
          <>
            <select
              className="h-8 max-w-[7.5rem] rounded border border-[#ddd6c8] bg-white px-1 text-[12px] text-[#1b2430]"
              defaultValue="P"
              title="Paragraph style"
              onMouseDown={saveSelection}
              onChange={(e) => exec('formatBlock', e.target.value)}
            >
              <option value="P">Body</option>
              <option value="H1">Title</option>
              <option value="H2">Heading</option>
              <option value="H3">Subheading</option>
              <option value="BLOCKQUOTE">Quote</option>
            </select>
            <select
              className="h-8 max-w-[8.5rem] rounded border border-[#ddd6c8] bg-white px-1 text-[12px] text-[#1b2430]"
              defaultValue={DOC_FONTS[0].value}
              title="Font"
              onMouseDown={saveSelection}
              onChange={(e) => exec('fontName', e.target.value)}
            >
              {DOC_FONTS.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}
            </select>
            <select
              className="h-8 w-[4.4rem] rounded border border-[#ddd6c8] bg-white px-1 text-[12px] text-[#1b2430]"
              defaultValue="15px"
              title="Size"
              onMouseDown={saveSelection}
              onChange={(e) => applyFontSize(e.target.value)}
            >
              {DOC_SIZES.map((size) => <option key={size} value={size}>{size.replace('px', '')}</option>)}
            </select>
            <span className="mx-1 h-4 w-px bg-[#ddd6c8]" />
          </>
        )}
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')} title="Bold"><strong>B</strong></button>
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')} title="Italic"><em>I</em></button>
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')} title="Underline"><span className="underline">U</span></button>
        <span className={`mx-1 h-4 w-px ${letter ? 'bg-[#ddd6c8]' : 'bg-white/10'}`} />
        <span className={`px-0.5 text-[10px] font-semibold uppercase tracking-[.12em] ${letter ? 'text-[#7b8492]' : 'text-slate-500'}`}>Align</span>
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyLeft')} title="Align left"><AlignLeft size={15} /></button>
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyCenter')} title="Align center"><AlignCenter size={15} /></button>
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyRight')} title="Align right"><AlignRight size={15} /></button>
        <span className={`mx-1 h-4 w-px ${letter ? 'bg-[#ddd6c8]' : 'bg-white/10'}`} />
        <span className={`px-0.5 text-[10px] font-semibold uppercase tracking-[.12em] ${letter ? 'text-[#7b8492]' : 'text-slate-500'}`}>Color</span>
        {LETTER_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyColor(c.value)}
            className={`h-6 w-6 rounded-sm border ${ink === c.value ? (letter ? 'border-[#0a1728] ring-1 ring-[#0a1728]/30' : 'border-gold ring-1 ring-gold/40') : 'border-black/15'}`}
            style={{ background: c.value }}
          />
        ))}
        <input
          type="color"
          title="Custom color"
          value={ink}
          className="h-7 w-8 cursor-pointer border-0 bg-transparent p-0"
          onMouseDown={saveSelection}
          onChange={(e) => applyColor(e.target.value)}
        />
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('hiliteColor', '#f5e6b8')} title="Highlight">
          <Highlighter size={14} />
        </button>
        <span className={`mx-1 h-4 w-px ${letter ? 'bg-[#ddd6c8]' : 'bg-white/10'}`} />
        <button type="button" className={`${tool} text-[12px]`} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')}>List</button>
        <button type="button" className={`${tool} text-[12px]`} onMouseDown={(e) => e.preventDefault()} onClick={insertLink}>Link</button>
        {onUploadImage && (
          <>
            <button type="button" className={`${tool} text-[12px]`} onMouseDown={(e) => e.preventDefault()} onClick={() => fileInputRef.current?.click()}>Image</button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onPickImage} />
          </>
        )}
      </div>
      <div className={`relative min-h-0 ${fill ? 'flex-1' : ''}`}>
        {empty && placeholder && (
          <p className={`pointer-events-none absolute ${letter ? 'left-8 top-5 font-serif text-[15px] italic text-[#9aa3ae]' : 'left-4 top-3 text-sm text-slate-500'}`}>{placeholder}</p>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          onMouseUp={saveSelection}
          onKeyUp={saveSelection}
          onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'div')}
          className={letter
            ? `${fill ? 'h-full min-h-[240px]' : 'min-h-48'} overflow-y-auto px-8 py-5 font-serif text-[15px] leading-[1.75] text-[#1b2430] outline-none [&_a]:text-[#0a1728] [&_a]:underline [&_img]:my-2 [&_img]:max-w-full [&_[align=center]]:text-center [&_[align=right]]:text-right [&_[align=left]]:text-left`
            : `${fill ? 'h-full min-h-[280px]' : 'min-h-48'} max-w-none overflow-y-auto bg-white px-4 py-3 text-sm text-navy-950 outline-none [&_a]:text-sky-700 [&_a]:underline [&_img]:my-2 [&_img]:max-w-full [&_[align=center]]:text-center [&_[align=right]]:text-right [&_[align=left]]:text-left`}
        />
      </div>
    </div>
  )
}
