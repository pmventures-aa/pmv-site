import { useRef, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { toast } from './toast'

function initialsOf(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

// Shared across admin, portal, and (via ClientDetail) the client-on-staff's-
// behalf case — self-styled like the rest of src/components/kit/ so it
// doesn't pull in any one surface's design tokens.
export function Avatar({
  userId,
  name,
  size = 40,
  editable = false,
  uploadPath,
  onUploaded,
}: {
  userId: string
  name?: string | null
  size?: number
  // When set, hovering shows an upload overlay; the file POSTs to this path
  // (either /me/avatar for self-service, or /admin/clients/:id/avatar for
  // staff setting a client's photo on their behalf).
  editable?: boolean
  uploadPath?: string
  onUploaded?: () => void
}) {
  const [broken, setBroken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !uploadPath) return
    setBusy(true)
    try {
      await api.upload(uploadPath, file)
      setBroken(false)
      setVersion((v) => v + 1)
      toast.success('Photo updated.')
      onUploaded?.()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not upload photo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="group relative shrink-0 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/15"
      style={{ width: size, height: size }}
    >
      {!broken ? (
        <img
          src={`/api/avatar/${userId}?v=${version}`}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="grid h-full w-full place-items-center font-semibold text-slate-300" style={{ fontSize: size * 0.38 }}>
          {initialsOf(name)}
        </span>
      )}
      {editable && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="absolute inset-0 grid place-items-center bg-black/60 text-xs text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-100"
          aria-label="Change photo"
        >
          {busy ? '…' : '📷'}
        </button>
      )}
      {editable && <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} />}
    </div>
  )
}
