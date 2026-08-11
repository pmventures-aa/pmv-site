import type { ReactNode } from 'react'
import * as RadixDialog from '@radix-ui/react-dialog'

// Shared Dialog primitive (Radix under the hood, for correct focus-trap /
// Escape / click-outside behavior): used by the public site, client
// portal, and staff console alike, so it's deliberately self-styled here
// rather than pulling in any single surface's design tokens.
export const Dialog = RadixDialog.Root
export const DialogTrigger = RadixDialog.Trigger

// Standard dialog widths. Default 'md' keeps the historical footprint for
// simple confirm/edit dialogs; 'lg' fits form + column pair; 'xl' fits
// the compose message + audience aside layout used by the Email Center.
const SIZE_CLASS: Record<'sm' | 'md' | 'lg' | 'xl' | 'full', string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-5xl',
  full: 'max-w-[min(1200px,calc(100vw-2rem))]',
}

export function DialogContent({
  children,
  className = '',
  title,
  description,
  size = 'md',
}: {
  children: ReactNode
  className?: string
  title: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
      <RadixDialog.Content
        className={`fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] ${SIZE_CLASS[size]} -translate-x-1/2 -translate-y-1/2 rounded-md border border-white/10 bg-navy-900 p-6 shadow-2xl focus:outline-none ${className}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <RadixDialog.Title className="text-lg font-semibold text-white">{title}</RadixDialog.Title>
            {description && <RadixDialog.Description className="mt-1 text-sm text-slate-400">{description}</RadixDialog.Description>}
          </div>
          <RadixDialog.Close className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close">
            ✕
          </RadixDialog.Close>
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}
