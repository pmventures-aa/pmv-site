import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LocateFixed, MapPin, Navigation, Radio } from 'lucide-react'
import { useAppPath } from '../../lib/basePath'
import { FieldLocationStaleness } from './FieldLocationIndicator'

export type FieldMapPin = {
  id: string
  kind: 'site' | 'agent' | 'staff' | 'vendor' | 'me'
  label: string
  sublabel?: string
  status?: string
  lat: number
  lng: number
  href?: string
  stale?: boolean
  // ISO timestamp of the last received location for this pin (people
  // pins only; site pins can leave this null). Powers the Live/Stale/
  // Last-known label in the selected pin card so we never render a
  // stale pin as though it were currently live.
  lastSeenAt?: string | null
  sharingActive?: boolean | null
}

const DEFAULT_CENTER = { lat: 26.3683, lng: -80.1289 }
const TILE_ZOOM = 8

function lngToX(lng: number, zoom: number) {
  return ((lng + 180) / 360) * 2 ** zoom
}

function latToY(lat: number, zoom: number) {
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat))
  const s = Math.sin((clamped * Math.PI) / 180)
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** zoom
}

function wrapTile(n: number, zoom: number) {
  const max = 2 ** zoom
  return ((n % max) + max) % max
}

export function FieldLiveMap({
  pins,
  className = '',
  title = 'Live field map',
  emptyLabel = 'No live coordinates yet. Create a field assignment with a site pin, or open an assignment on a provider phone so GPS can report in.',
}: {
  pins: FieldMapPin[]
  className?: string
  title?: string
  emptyLabel?: string
}) {
  const p = useAppPath()
  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 640, h: 360 })
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const update = () => setSize({ w: Math.max(320, el.clientWidth), h: Math.max(280, el.clientHeight) })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Manual center override lets "My Location" recenter regardless of the
  // computed group centroid; null falls back to the auto-fit centroid.
  const [manualCenter, setManualCenter] = useState<{ lat: number; lng: number } | null>(null)

  const view = useMemo(() => {
    const valid = pins.filter((pin) => Number.isFinite(pin.lat) && Number.isFinite(pin.lng))
    const auto = valid.length
      ? { lat: valid.reduce((sum, pin) => sum + pin.lat, 0) / valid.length, lng: valid.reduce((sum, pin) => sum + pin.lng, 0) / valid.length }
      : DEFAULT_CENTER
    return { center: manualCenter || auto, pins: valid }
  }, [pins, manualCenter])

  const mePin = view.pins.find((pin) => pin.kind === 'me')
  const canRecenter = !!mePin || (typeof navigator !== 'undefined' && !!navigator.geolocation)

  function recenterMe() {
    if (mePin) { setManualCenter({ lat: mePin.lat, lng: mePin.lng }); setSelected(mePin.id); return }
    // No cached "me" pin - ask the browser for a one-shot fix. Silent when
    // permission is already granted, prompts otherwise, no-op if denied.
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (p) => setManualCenter({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setManualCenter(null),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
    )
  }

  const tileSize = 256
  const centerX = lngToX(view.center.lng, TILE_ZOOM)
  const centerY = latToY(view.center.lat, TILE_ZOOM)
  const originX = centerX * tileSize - size.w / 2
  const originY = centerY * tileSize - size.h / 2
  const minTx = Math.floor(originX / tileSize)
  const maxTx = Math.floor((originX + size.w) / tileSize)
  const minTy = Math.floor(originY / tileSize)
  const maxTy = Math.floor((originY + size.h) / tileSize)
  const tiles: { key: string; x: number; y: number; left: number; top: number }[] = []
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      tiles.push({
        key: `${tx}:${ty}`,
        x: wrapTile(tx, TILE_ZOOM),
        y: ty,
        left: tx * tileSize - originX,
        top: ty * tileSize - originY,
      })
    }
  }

  const selectedPin = view.pins.find((pin) => pin.id === selected) || null
  const people = view.pins.filter((pin) => pin.kind !== 'site')
  const livePeople = people.filter((pin) => !pin.stale)

  return (
    <div className={`overflow-hidden rounded-lg border border-white/10 bg-[#0b1a2b] ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-gold/80">{title}</p>
          <p className="mt-0.5 text-xs text-slate-400">{view.pins.length ? `${people.length} people · ${view.pins.filter((pin) => pin.kind === 'site').length} job sites · ${livePeople.length} live` : 'Waiting for a team member to share a location'}</p>
        </div>
        <div className="flex items-center gap-2">
          {canRecenter && (
            <button
              type="button"
              onClick={recenterMe}
              className="inline-flex items-center gap-1 rounded-md border border-white/12 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:border-gold/40 hover:text-gold"
              title={mePin ? 'Recenter on my location' : 'Show my current location'}
              aria-label="Recenter map on my location"
            >
              <LocateFixed size={11} /> My location
            </button>
          )}
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${livePeople.length ? 'text-emerald-300' : 'text-slate-400'}`}><Radio size={11} /> {livePeople.length ? `${livePeople.length} live` : 'Last known'}</span>
        </div>
      </div>
      <div ref={boxRef} className="relative h-[360px] overflow-hidden bg-[#1b2838]">
        {tiles.map((tile) => (
          tile.y >= 0 && tile.y < 2 ** TILE_ZOOM ? (
            <img
              key={tile.key}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{ left: tile.left, top: tile.top, width: tileSize, height: tileSize }}
              src={`https://tile.openstreetmap.org/${TILE_ZOOM}/${tile.x}/${tile.y}.png`}
            />
          ) : null
        ))}
        {view.pins.map((pin) => {
          const left = lngToX(pin.lng, TILE_ZOOM) * tileSize - originX
          const top = latToY(pin.lat, TILE_ZOOM) * tileSize - originY
          const active = selected === pin.id
          return (
            <button
              key={pin.id}
              type="button"
              onClick={() => setSelected(pin.id)}
              className={`absolute z-10 -translate-x-1/2 -translate-y-full rounded-full border px-1.5 py-0.5 text-[10px] font-bold shadow-lg ${pin.kind === 'site' ? 'border-gold/50 bg-gold text-navy-950' : pin.kind === 'me' ? 'border-sky-200/70 bg-sky-300 text-navy-950' : 'border-emerald-300/50 bg-emerald-400 text-navy-950'} ${active ? 'ring-2 ring-white' : ''} ${pin.stale ? 'opacity-60' : ''}`}
              style={{ left, top }}
              title={pin.label}
            >
              <span className="inline-flex items-center gap-1">{pin.kind === 'site' ? <MapPin size={10} /> : <Navigation size={10} />}{pin.label.split(' ')[0]}</span>
            </button>
          )
        })}
        {!view.pins.length && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-navy-950/35">
            <p className="max-w-sm px-4 text-center text-xs leading-5 text-slate-300">{emptyLabel}</p>
          </div>
        )}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="absolute bottom-1 right-1 z-20 rounded bg-navy-950/75 px-1.5 py-0.5 text-[9px] text-slate-300 hover:text-white">
          © OpenStreetMap contributors
        </a>
      </div>
      {selectedPin && (
        <div className="flex items-start justify-between gap-3 border-t border-white/10 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{selectedPin.label}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{selectedPin.sublabel || selectedPin.status || (selectedPin.kind === 'site' ? 'Job site' : 'Team location')}</p>
            {selectedPin.kind !== 'site' && (
              <FieldLocationStaleness lastSeenAt={selectedPin.lastSeenAt} sharingActive={selectedPin.sharingActive} className="mt-1" />
            )}
          </div>
          {selectedPin.href && <Link to={p(selectedPin.href)} className="shrink-0 text-xs font-bold text-gold hover:underline">Open</Link>}
        </div>
      )}
    </div>
  )
}
