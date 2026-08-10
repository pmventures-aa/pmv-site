import { useRef, useState } from 'react'
import { LockKeyhole, ShieldCheck, UploadCloud } from 'lucide-react'
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
    <section className="overflow-hidden rounded-xl border border-white/[.09] bg-navy-900/55 shadow-[0_14px_40px_rgba(0,0,0,.12)]">
      <div className="flex items-start justify-between gap-4 border-b border-white/[.07] px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-emerald-400/20 bg-emerald-400/[.07] text-emerald-300"><ShieldCheck size={17}/></span>
          <div>
            <p className="text-sm font-semibold text-white">{label}{required ? <span className="text-gold"> *</span> : null}</p>
            {help && <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{help}</p>}
          </div>
        </div>
        {files.length > 0 && <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/[.06] px-2.5 py-1 text-[11px] font-semibold text-emerald-300">Verified upload ready</span>}
      </div>

      <div className="p-4 sm:p-5">
        {files.length > 0 && (
          <ul className="mb-3 space-y-2">
            {files.map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-3 rounded-lg border border-emerald-400/15 bg-emerald-400/[.035] px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/[.04] text-emerald-300"><Icon name="file" size={15}/></span>
                  <div className="min-w-0"><p className="truncate text-sm text-white">{file.name}</p>{file.detail && <p className="text-[11px] text-slate-500">{file.detail}</p>}</div>
                </div>
                <button type="button" onClick={() => void onRemove(file.id)} className="shrink-0 text-xs text-slate-500 hover:text-rose-300">Remove</button>
              </li>
            ))}
          </ul>
        )}

        <div
          className={`rounded-xl border border-dashed px-4 py-6 transition ${dragging ? 'border-gold bg-gold/[.06]' : 'border-white/15 bg-black/[.08]'}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files) }}
        >
          <div className="flex flex-col items-center text-center">
            <span className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/[.025] text-gold"><UploadCloud size={19}/></span>
            <p className="mt-3 text-sm font-semibold text-white">{uploading ? 'Encrypting & uploading…' : files.length ? 'Replace or add document' : 'Secure document upload'}</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Take a clear photo on your phone or choose a PDF/image. Files are stored privately and are only available to authorized Pinnacle reviewers.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" disabled={uploading} onClick={() => cameraRef.current?.click()} className="btn-outline !px-3 !py-2 text-xs disabled:opacity-50">Take photo</button>
              <button type="button" disabled={uploading} onClick={() => browseRef.current?.click()} className="btn-outline !px-3 !py-2 text-xs disabled:opacity-50">Choose file</button>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-600"><LockKeyhole size={12}/> Private storage · PDF, JPG, PNG, WebP · max 20 MB</div>
          </div>
          <input ref={cameraRef} type="file" className="sr-only" accept="image/*" capture="environment" multiple={false} onChange={(event) => { pick(event.target.files); event.currentTarget.value = '' }} />
          <input ref={browseRef} type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp" multiple={multiple} onChange={(event) => { pick(event.target.files); event.currentTarget.value = '' }} />
        </div>
      </div>
    </section>
  )
}
