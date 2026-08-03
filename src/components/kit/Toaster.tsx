import { Toaster as SonnerToaster } from 'sonner'

// Mounted once at the app root (see src/main.tsx) — shared by the public
// site, client portal, and staff console alike. Call `toast(...)` from
// ../kit/toast anywhere to show one; no per-page wiring needed.
export function AppToaster() {
  return (
    <SonnerToaster
      theme="dark"
      richColors
      position="top-right"
      toastOptions={{
        style: {
          background: '#0E2340',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#F1F5F9',
        },
      }}
    />
  )
}
