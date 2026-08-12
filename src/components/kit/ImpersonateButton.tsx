import { useState } from 'react'
import { Loader2, UserCheck } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { Dialog, DialogContent } from './Dialog'
import { toast } from './toast'

// Owner-only button that starts an impersonation session against a
// target user. Requires a written reason (persisted in the audit trail).
// Reloads the page on success so the user shell picks up the impersonation
// swap on the next request.
export function ImpersonateButton({ targetUserId, targetLabel, className = '' }: { targetUserId: string; targetLabel: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function start() {
    if (reason.trim().length < 8) return toast.error('Please enter a reason (min 8 characters).')
    setBusy(true)
    try {
      await api.post('/admin/impersonate', { target_user_id: targetUserId, reason: reason.trim() })
      toast.success(`Now viewing as ${targetLabel}`)
      window.location.href = '/portal'
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not start impersonation') }
    finally { setBusy(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={`inline-flex items-center gap-1.5 rounded-md border border-rose-400/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-200 hover:bg-rose-500/20 ${className}`}>
        <UserCheck size={11}/>Impersonate
      </button>
      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); setReason('') } }}>
        <DialogContent size="md" title={`Impersonate ${targetLabel}`} description="Every action taken during this session is logged with your identity as the owner. Session auto-expires in 45 minutes.">
          <label className="block text-xs font-semibold text-slate-400">Reason (required)</label>
          <textarea className="mt-1 w-full min-h-24 rounded-md border border-white/10 bg-navy-950 px-3 py-2 text-sm text-white" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Reproducing bug reported by the client on invoice #123"/>
          <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/[.06] p-3 text-[11px] leading-5 text-amber-100">
            <strong>Blocked while impersonating:</strong> password change, 2FA disable, account deletion, session revoke, nested impersonation. Every request is written to the audit log.
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => { setOpen(false); setReason('') }} className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">Cancel</button>
            <button onClick={() => void start()} disabled={busy || reason.trim().length < 8} className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-60">
              {busy && <Loader2 size={12} className="animate-spin"/>}Start impersonation
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
