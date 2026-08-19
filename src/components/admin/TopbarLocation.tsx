import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { useGeolocationPermission } from '../../lib/useGeolocationPermission'
import { useLiveLocationShare } from '../../lib/useLiveLocationShare'

// Small, box-shaped live-location indicator for the HQ top bar. One per layout;
// backed by the singleton live-share hook so it reflects the device's real
// sharing state and is the single persistent control.
//
// Once the browser has confirmed a grant, sharing auto-starts silently and stays
// on across navigation - the operator authorizes once and then just sees a live
// box, never a repeat permission prompt. Clicking toggles: go live / stop, or
// (when permission is still undetermined) ask the browser exactly once.
//
// `compact` renders an icon-only square for the tight mobile bar; the default
// shows a short status label beside the icon.
export function TopbarLocation({ compact = false }: { compact?: boolean }) {
  const geo = useGeolocationPermission()
  const { sharing, start, stop } = useLiveLocationShare()
  const location = useLocation()
  // The active field-assignment screen runs its own dedicated location watch,
  // so we don't also auto-start the general share there.
  const onActiveAssignment = /\/field-work\/[^/]+/.test(location.pathname)

  useEffect(() => {
    if (!geo.confirmed) return
    if (geo.permission !== 'granted') return
    if (sharing !== 'idle') return
    if (onActiveAssignment) return
    start()
  }, [geo.confirmed, geo.permission, sharing, onActiveAssignment, start])

  if (geo.permission === 'unsupported') return null

  const live = sharing === 'live'
  const starting = sharing === 'starting'
  const errored = sharing === 'error'
  const granted = geo.permission === 'granted'
  const blocked = geo.permission === 'denied' || geo.permission === 'revoked'

  const tone = live
    ? 'border-emerald-400/45 bg-emerald-400/[.08] text-emerald-300'
    : starting
      ? 'border-amber-400/40 bg-amber-400/[.07] text-amber-300'
      : errored
        ? 'border-rose-400/40 bg-rose-400/[.07] text-rose-300'
        : blocked
          ? 'border-rose-400/25 bg-transparent text-rose-300/70'
          : granted
            ? 'border-white/12 bg-white/[.02] text-slate-300 hover:border-emerald-400/40 hover:text-emerald-300'
            : 'border-gold/30 bg-gold/[.05] text-gold/85 hover:border-gold/55'

  const label = live ? 'Live' : starting ? 'Locating' : errored ? 'Retry' : blocked ? 'Off' : granted ? 'Share' : 'Location'

  const title = live
    ? 'Sharing live location with HQ. Click to stop.'
    : starting
      ? 'Starting location sharing…'
      : errored
        ? 'Location error. Click to retry.'
        : geo.permission === 'revoked'
          ? 'Location was turned off. Click to re-enable.'
          : geo.permission === 'denied'
            ? 'Location is blocked for HQ. Enable it in your browser settings.'
            : granted
              ? 'Share your live location with HQ'
              : 'Enable live location sharing (asked once, remembered after)'

  function onClick() {
    if (live) { void stop(); return }
    if (granted) { start(); return }
    // prompt / unknown / denied / revoked: ask the browser once. When it grants,
    // the effect above auto-starts the watch, so we never fire two dialogs.
    geo.request()
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={geo.busy || starting}
      title={title}
      aria-label={title}
      aria-pressed={live}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold transition disabled:opacity-60 ${tone} ${compact ? 'w-9 justify-center px-0' : ''}`}
    >
      <span className="relative grid place-items-center">
        <MapPin size={14} aria-hidden="true" />
        {live && <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />}
      </span>
      {!compact && <span>{label}</span>}
    </button>
  )
}
