import { useEffect, useRef } from 'react'
import { btnOutline } from './ui'

// Lightweight in-house rich text editor for Communications Center drafts —
// bold/italic/underline/link/image/signature. Deliberately not a full WYSIWYG
// library: this repo has no existing rich-text dependency anywhere (message
// threads and notes are plain textareas), and the ask here is "plain text
// but with images and a signature", not a full editor. Uses contentEditable
// + document.execCommand, which is deprecated but still broadly supported
// and is the simplest way to get inline formatting without a new dependency.
export function RichTextComposer({
  value,
  onChange,
  onUploadImage,
}: {
  value: string
  onChange: (html: string) => void
  onUploadImage: (file: File) => Promise<string>
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
    if (!file) return
    try {
      const url = await onUploadImage(file)
      exec('insertImage', url)
    } catch {
      window.alert('Image upload failed.')
    }
  }

  const toolBtn = `${btnOutline} !px-2.5 !py-1 text-xs`

  return (
    <div className="rounded-md border border-white/10 bg-navy-900">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 p-2">
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
        <button type="button" className={toolBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => fileInputRef.current?.click()}>
          Image
        </button>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onPickImage} />
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        className="min-h-48 max-w-none px-4 py-3 text-sm text-white outline-none [&_a]:text-gold [&_a]:underline [&_img]:my-2 [&_img]:max-w-full"
      />
    </div>
  )
}
