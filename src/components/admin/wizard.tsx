import { type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { btnPrimary, btnOutline } from './ui'

// Shared wizard chrome for HQ multi-step forms (see ScopeWizard for the
// public-site reference). Callers keep their own step state, per-step
// validation, and submit; these primitives only standardize the header,
// progress bar, animated step transitions, error banner, and Back/Continue
// footer so every wizard behaves (and animates) the same way.

export function WizardProgress({ step, total }: { step: number; total: number }) {
  const pct = Math.max(0, Math.min(100, (step / Math.max(1, total)) * 100))
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-gold tabular-nums">{step} / {total}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
        <motion.div className="h-full bg-gold" animate={{ width: `${pct}%` }} transition={{ duration: 0.2 }} />
      </div>
    </div>
  )
}

export function WizardStep({ step, children }: { step: number; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={step}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -12 }}
        transition={{ duration: 0.18 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

export function WizardError({ message }: { message: string | null }) {
  if (!message) return null
  return <p role="alert" className="mt-4 rounded-lg border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">{message}</p>
}

export function WizardFooter({
  onBack,
  onNext,
  nextLabel = 'Continue',
  busy = false,
  backLabel = 'Back',
}: {
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  busy?: boolean
  backLabel?: string
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      {onBack ? (
        <button type="button" onClick={onBack} disabled={busy} className={btnOutline}>{backLabel}</button>
      ) : <span />}
      <button type="button" onClick={onNext} disabled={busy} className={`${btnPrimary} disabled:opacity-60`}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : null}
        {nextLabel}
      </button>
    </div>
  )
}
