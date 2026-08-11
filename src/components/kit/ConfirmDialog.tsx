import * as RadixAlert from '@radix-ui/react-alert-dialog'

const btnBase = 'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition disabled:opacity-60'
const btnOutline = `${btnBase} border border-white/15 text-slate-100 hover:border-white/30`
const btnDanger = `${btnBase} bg-rose-500 text-white hover:bg-rose-400`
const btnPrimary = `${btnBase} bg-gold text-navy-950 hover:bg-gold-400`

// Controlled confirm-before-destroy dialog (Radix AlertDialog under the
// hood: modal, focus-trapped, Escape-to-cancel). Shared across every
// surface; the caller owns the open/busy state.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  busy = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
}) {
  return (
    <RadixAlert.Root open={open} onOpenChange={onOpenChange}>
      <RadixAlert.Portal>
        <RadixAlert.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <RadixAlert.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-md border border-white/10 bg-navy-900 p-6 shadow-2xl focus:outline-none">
          <RadixAlert.Title className="text-lg font-semibold text-white">{title}</RadixAlert.Title>
          {description && <RadixAlert.Description className="mt-2 text-sm text-slate-400">{description}</RadixAlert.Description>}
          <div className="mt-6 flex justify-end gap-3">
            <RadixAlert.Cancel asChild>
              <button className={btnOutline}>{cancelLabel}</button>
            </RadixAlert.Cancel>
            <button onClick={onConfirm} disabled={busy} className={destructive ? btnDanger : btnPrimary}>
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        </RadixAlert.Content>
      </RadixAlert.Portal>
    </RadixAlert.Root>
  )
}
