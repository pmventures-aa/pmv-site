import { useEffect, useRef } from 'react'
import { btnOutline } from './ui'

// Lightweight in-house rich text editor for Communications Center drafts:
// bold/italic/underline/link/image. Uses contentEditable + document.execCommand,
// which is deprecated but still broadly supported and avoids a new dependency.
export function RichTextComposer({
  value,
  onChange,
  onUploadImage,
  fill = false,
  placeholder,
}: {
  value: string
  onChange: (html: string) => void
  onUploadImage?: (file: File) => Promise<string>
  fill?: boolean
  placeholder?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastValue = useRef(value)

  // Uncontrolled-ish: only push `value` into the DOM when it changes from
  // outside (e.g. loading a draft), never on every keystroke, so the
  // caret doesn't jump mid-typing.
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

  const toolBtn = `${btnOutline} !px-2.5 !py-1 text-xs`
  const empty = !value || value === '<br>' || value === '<div><br></div>'

  return (
    <div className={`flex min-h-0 flex-col rounded-md border border-white/10 bg-navy-900 ${fill ? 'h-full' : ''}`}>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-white/10 p-2">
        <button type="button" className={toolBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}>
          <strong>B</strong>
        </button>
        <button type="button" className={toolBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}>
          <em>I</em>
        </button>
        <button type="button" className={toolBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}>
          <span className="underline">U</span>
        </button>
        <button type="button" className={toolBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')}>
          • List
        </button>
        <button type="button" className={toolBtn} onMouseDown={(e) => e.preventDefault()} onClick={insertLink}>
          Link
        </button>
        {onUploadImage && (
          <>
            <button type="button" className={toolBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => fileInputRef.current?.click()}>
              Image
            </button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onPickImage} />
          </>
        )}
      </div>
      <div className={`relative min-h-0 ${fill ? 'flex-1' : ''}`}>
        {empty && placeholder && (
          <p className="pointer-events-none absolute left-4 top-3 text-sm text-slate-500">{placeholder}</p>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          className={`${fill ? 'h-full min-h-[280px]' : 'min-h-48'} max-w-none overflow-y-auto px-4 py-3 text-sm text-navy-950 outline-none bg-white [&_a]:text-sky-700 [&_a]:underline [&_img]:my-2 [&_img]:max-w-full`}
        />
      </div>
    </div>
  )
}
