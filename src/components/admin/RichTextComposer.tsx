import { useEffect, useRef } from 'react'

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
  const letter = surface === 'letter'

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

  function exec(command: string, arg?: string) {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    emit()
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

  const empty = !value || value === '<br>' || value === '<div><br></div>'
  const tool = letter
    ? 'grid h-7 min-w-7 place-items-center rounded px-1.5 text-[13px] text-[#3d4a5c] hover:bg-black/[.06]'
    : 'inline-flex items-center justify-center rounded-md border border-white/12 bg-white/[.025] px-2.5 py-1 text-xs font-semibold text-slate-200 hover:border-gold/45 hover:text-gold'

  return (
    <div className={`flex min-h-0 flex-col ${fill ? 'h-full' : ''} ${letter ? 'bg-transparent' : 'rounded-md border border-white/10 bg-navy-900'}`}>
      <div className={`flex shrink-0 flex-wrap items-center gap-0.5 ${letter ? 'border-b border-[#e7e4dc] bg-[#f4f1ea] px-3 py-1.5' : 'border-b border-white/10 p-2 gap-1.5'}`}>
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}><strong>B</strong></button>
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}><em>I</em></button>
        <button type="button" className={tool} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}><span className="underline">U</span></button>
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
          className={letter
            ? `${fill ? 'h-full min-h-[240px]' : 'min-h-48'} overflow-y-auto px-8 py-5 font-serif text-[15px] leading-[1.75] text-[#1b2430] outline-none [&_a]:text-[#0a1728] [&_a]:underline [&_img]:my-2 [&_img]:max-w-full`
            : `${fill ? 'h-full min-h-[280px]' : 'min-h-48'} max-w-none overflow-y-auto bg-white px-4 py-3 text-sm text-navy-950 outline-none [&_a]:text-sky-700 [&_a]:underline [&_img]:my-2 [&_img]:max-w-full`}
        />
      </div>
    </div>
  )
}
