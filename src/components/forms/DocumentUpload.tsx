import { useRef, useState } from 'react'
import { Icon } from '../kit/Icon'

export interface UploadedDocument {
  id: string
  name: string
  detail?: string
}

export function DocumentUpload({
  label,
  help,
  required = false,
  multiple = false,
  files,
  uploading = false,
  onFiles,
  onRemove,
}: {
  label: string
  help?: string
  required?: boolean
  multiple?: boolean
  files: UploadedDocument[]
  uploading?: boolean
  onFiles: (files: File[]) => void | Promise<void>
  onRemove: (id: string) => void | Promise<void>
}) {
  const [dragging, setDragging] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const browseRef = useRef<HTMLInputElement>(null)

  function pick(list: FileList | null) {
    const next = Array.from(list || [])
    if (next.length) void onFiles(multiple ? next : next.slice(0, 1))
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{label}{required ? <span className="text-gold"> *</span> : null}</p>
          {help && <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{help}</p>}
        </div>
        {files.length > 0 && <span className="shrink-0 text-xs font-medium text-emerald-300">{files.length} uploaded</span>}
      </div>

      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[.02] px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-gold/10 text-gold"><Icon name="file" size={15}/></span>
                <div className="min-w-0"><p className="truncate text-sm text-white">{file.name}</p>{file.detail && <p className="text-[11px] text-slate-500">{file.detail}</p>}</div>
              </div>
              <button type="button" onClick={() => void onRemove(file.id)} className="shrink-0 text-xs text-slate-500 hover:text-rose-300">Remove</button>
            </li>
          ))}
        </ul>
      )}

      <div
        className={`mt-3 rounded-lg border border-dashed px-4 py-5 transition ${dragging ? 'border-gold bg-gold/[.06]' : 'border-white/15 bg-white/[.015]'}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files) }}
      >
        <div className="flex flex-col items-center text-center">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-gold"><Icon name="file" size={18}/></span>
          <p className="mt-3 text-sm font-medium text-white">{uploading ? 'Uploading securely…' : files.length ? 'Add or replace a document' : 'Add your document'}</p>
          <p className="mt-1 text-xs text-slate-500">Take a photo on your phone, choose an existing photo, or browse for a PDF.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" disabled={uploading} onClick={() => cameraRef.current?.click()} className="btn-outline !px-3 !py-2 text-xs disabled:opacity-50">Take photo</button>
            <button type="button" disabled={uploading} onClick={() => browseRef.current?.click()} className="btn-outline !px-3 !py-2 text-xs disabled:opacity-50">Choose file</button>
          </div>
          <p className="mt-3 text-[11px] text-slate-600">PDF, JPG, PNG, or WebP · up to 20 MB each</p>
        </div>
        <input ref={cameraRef} type="file" className="sr-only" accept="image/*" capture="environment" multiple={false} onChange={(event) => { pick(event.target.files); event.currentTarget.value = '' }} />
        <input ref={browseRef} type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp" multiple={multiple} onChange={(event) => { pick(event.target.files); event.currentTarget.value = '' }} />
      </div>
    </div>
  )
}
