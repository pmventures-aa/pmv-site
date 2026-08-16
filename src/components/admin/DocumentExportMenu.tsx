import { useEffect, useRef, useState } from 'react'
import { Download, Eye, EyeOff, FileDown, FileText, FileType2, Lock, type LucideIcon } from 'lucide-react'
import { toast } from '../kit/toast'
import { Dialog, DialogContent } from '../kit/Dialog'
import { btnPrimary, btnSecondary } from './ui'

type ExportFormat = {
  key: 'docx' | 'pdf' | 'protected_pdf' | 'txt'
  label: string
  hint: string
  icon: LucideIcon
  ext: string
}

const FORMATS: ExportFormat[] = [
  { key: 'docx', label: 'Word Document (.docx)', hint: 'Editable in Microsoft Word', icon: FileType2, ext: 'docx' },
  { key: 'pdf', label: 'PDF', hint: 'Branded PDF, ready to share', icon: FileText, ext: 'pdf' },
  { key: 'protected_pdf', label: 'Protected PDF', hint: 'Password-protected PDF', icon: Lock, ext: 'pdf' },
  { key: 'txt', label: 'Plain Text (.txt)', hint: 'Text only, no formatting', icon: FileDown, ext: 'txt' },
]

const EXPORT_ERROR = "We couldn't prepare this document. Your original has not been changed."

function safeTitle(title: string): string {
  return (title || 'document').replace(/["\\/:*?<>|]/g, '').replace(/[\u0000-\u001f\u007f]/g, '').trim() || 'document'
}

function availableFormats(documentType: 'file' | 'text', mimeType?: string | null, originalName?: string | null): ExportFormat[] {
  if (documentType === 'text') return FORMATS
  const mime = String(mimeType || '').toLowerCase()
  const name = String(originalName || '').toLowerCase()
  const isPdf = mime === 'application/pdf' || name.endsWith('.pdf')
  const isDocx = mime.includes('wordprocessingml') || name.endsWith('.docx')
  return isPdf ? [FORMATS[1], FORMATS[2]] : isDocx ? [FORMATS[0]] : []
}

export function DocumentExportMenu({ documentId, title, documentType, mimeType, originalName, align = 'left', label = 'Export', variant = 'secondary', compact = false, fullWidth = false }: {
  documentId: string
  title: string
  documentType: 'file' | 'text'
  mimeType?: string | null
  originalName?: string | null
  align?: 'left' | 'right'
  label?: string
  variant?: 'primary' | 'secondary'
  compact?: boolean
  fullWidth?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [protectedOpen, setProtectedOpen] = useState(false)
  const [pending, setPending] = useState<ExportFormat | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pwError, setPwError] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const formats = availableFormats(documentType, mimeType, originalName)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function doExport(f: ExportFormat, passwordValue?: string) {
    const res = await fetch(`/api/admin/documents-workspace/${documentId}/export`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: f.key, ...(passwordValue ? { password: passwordValue } : {}) }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error || EXPORT_ERROR)
    }
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${safeTitle(title)}${f.key === 'protected_pdf' ? ' (Protected)' : ''}.${f.ext}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }

  async function start(f: ExportFormat) {
    if (f.key === 'protected_pdf') {
      setPending(f)
      setPassword('')
      setConfirm('')
      setPwError('')
      setProtectedOpen(true)
      return
    }
    setBusy(f.key)
    try {
      await doExport(f)
      toast.success(`${f.label} downloaded`)
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : EXPORT_ERROR, { action: { label: 'Try Again', onClick: () => void start(f) } })
    } finally {
      setBusy(null)
    }
  }

  async function createProtected() {
    if (!pending) return
    if (password.length < 8) {
      setPwError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setPwError('Passwords do not match.')
      return
    }
    setPwError('')
    setBusy(pending.key)
    try {
      await doExport(pending, password)
      setProtectedOpen(false)
      setOpen(false)
      toast.success('Protected PDF downloaded — the password is not stored anywhere')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : EXPORT_ERROR, { action: { label: 'Try Again', onClick: () => void createProtected() } })
    } finally {
      setBusy(null)
    }
  }

  const triggerCls = variant === 'primary' ? btnPrimary : btnSecondary
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={`${triggerCls} ${compact ? '!px-2.5' : ''} ${fullWidth ? 'w-full' : ''}`}
        disabled={busy !== null || formats.length === 0}
        aria-haspopup="menu"
        aria-expanded={open}
        title={formats.length ? 'Download / Export this document' : 'No export available for this file type'}
        onClick={() => setOpen((o) => !o)}
      >
        {busy ? <FileDown size={14} className="animate-pulse" /> : <Download size={14} />}
        {!compact && <span>{busy ? 'Preparing…' : label}</span>}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-30 mt-1.5 min-w-[250px] rounded-xl border border-white/10 bg-[#0d141c] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,.5)] ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {formats.length === 0 && (
            <a role="menuitem" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/[.05]" href={`/api/admin/documents-workspace/${documentId}/file`} download>
              <FileDown size={15} className="text-gold" />
              Download original file
              <span className="ml-auto text-[10px] text-slate-500">.file</span>
            </a>
          )}
          {formats.map((f) => (
            <button
              key={f.key}
              type="button"
              role="menuitem"
              disabled={busy !== null}
              onClick={() => void start(f)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[.05] focus-visible:ring-2 focus-visible:ring-gold/40 disabled:opacity-60"
            >
              <f.icon size={15} className="shrink-0 text-gold" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-white">{f.label}</span>
                <span className="block text-[11px] text-slate-500">{f.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <Dialog open={protectedOpen} onOpenChange={(o) => { setProtectedOpen(o); if (!o) setPwError('') }}>
        <DialogContent title="Create Protected PDF" description="Lock this document with a password. The password is never stored by Pinnacle — keep it somewhere safe." size="sm">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300" htmlFor="pdf-password">Password</label>
              <div className="relative">
                <input id="pdf-password" className="w-full rounded-md border border-white/12 bg-white/[.045] px-3 py-2 pr-10 text-sm font-medium text-slate-100 focus:border-gold/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/15" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-white" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300" htmlFor="pdf-password-confirm">Confirm password</label>
              <input id="pdf-password-confirm" className="w-full rounded-md border border-white/12 bg-white/[.045] px-3 py-2 text-sm font-medium text-slate-100 focus:border-gold/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/15" type={showPassword ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat the password" autoComplete="new-password" />
            </div>
            {pwError && <p className="text-xs font-medium text-rose-300">{pwError}</p>}
            <div className="flex items-center gap-2">
              <input id="pdf-password-show" type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} className="h-4 w-4 accent-gold" />
              <label htmlFor="pdf-password-show" className="text-xs text-slate-400">Show password</label>
            </div>
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button type="button" className={btnSecondary} onClick={() => setProtectedOpen(false)} disabled={busy !== null}>Cancel</button>
              <button type="button" className={btnPrimary} onClick={() => void createProtected()} disabled={busy !== null}>
                <Lock size={14} /> {busy === 'protected_pdf' ? 'Preparing…' : 'Create Protected PDF'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}