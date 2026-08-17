import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { LocateFixed, Loader2, Radio } from 'lucide-react'
import { useGeolocationPermission } from '../../lib/useGeolocationPermission'
import { useLiveLocationShare } from '../../lib/useLiveLocationShare'
import { btnOutline } from './ui'

// Auto-location for the HQ mobile shell. Rules (see sprint spec):
//   - Only fires on a phone-sized viewport (max-width: 767px).
//   - If the browser already granted permission, sharing starts silently.
//   - If permission is still undetermined, one explanatory banner appears on
//     the first mobile entry; Allow triggers the browser dialog exactly once,
//     then sharing auto-starts. "Not now" hides the banner for this device.
//   - After a denial we never re-nag here; the small denied affordance stays
//     on the Network map and field-assignment detail only.
//   - Never starts while on an active field assignment (the assignment detail
//     already runs its own location watch) or on the Network page (which has
//     its own controls and banner).
export function LocationAutoStart() {
  const location = useLocation()
  const geoPerm = useGeolocationPermission()
  const { sharing, start, stop } = useLiveLocationShare()
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 767px)').matches
      : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const onNetworkPage = /\/network(\/|$)/.test(location.pathname)
  const onActiveAssignment = /\/field-work\/[^/]+/.test(location.pathname)

  // Silent auto-start when this device already granted location and we are
  // not on a surface that manages its own watch.
  useEffect(() => {
    if (!isMobile) return
    if (geoPerm.permission !== 'granted') return
    if (sharing !== 'idle') return
    if (onNetworkPage || onActiveAssignment) return
    start()
  }, [isMobile, geoPerm.permission, sharing, onNetworkPage, onActiveAssignment, start])

  const showPrompt =
    isMobile && !onNetworkPage && !onActiveAssignment && sharing === 'idle'
    // Show for a first-time prompt OR when a previous grant has been
    // revoked (browser settings / OS location off / permission reset).
    // A ctaHidden dismissal is respected on 'prompt' but reset when we
    // detect a fresh 'revoked' transition - the user needs to know
    // location is no longer flowing.
    && ((geoPerm.permission === 'prompt' && !geoPerm.ctaHidden) || geoPerm.permission === 'revoked')

  if (sharing === 'live') {
    return (
      <div className="flex flex-col gap-2 border-b border-white/10 bg-emerald-400/[.07] px-3 py-2.5 sm:px-5 lg:hidden print:hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-emerald-200">
            <Radio size={13} className="shrink-0" /> Sharing live location with HQ
          </p>
          <button type="button" onClick={() => void stop()} className={`${btnOutline} shrink-0 !px-2.5 !py-1 text-xs`}>
            Stop
          </button>
        </div>
      </div>
    )
  }

  if (!showPrompt) return null

  return (
    <div className="flex flex-col gap-2 border-b border-gold/20 bg-gold/[.05] px-3 py-2.5 sm:px-5 lg:hidden print:hidden">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-xs leading-5 text-slate-300">
          {geoPerm.permission === 'revoked' ? (
            <>
              <strong className="text-white">Location access was turned off.</strong>{' '}
              HQ can no longer find you on the team map. Re-enable to resume sharing while you work.
            </>
          ) : (
            <>
              <strong className="text-white">Let HQ find you while you work.</strong>{' '}
              Sharing your location improves dispatch matching and the team map. Asked once, remembered after.
            </>
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={geoPerm.busy}
            onClick={() => { geoPerm.request(); start() }}
            className="inline-flex items-center gap-1.5 rounded-md border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold disabled:opacity-60"
          >
            {geoPerm.busy ? <Loader2 size={13} className="animate-spin" /> : <LocateFixed size={13} />}
            Allow location
          </button>
          <button type="button" onClick={geoPerm.hideCta} className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-white">
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
