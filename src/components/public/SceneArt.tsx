import type { StoryImageKey } from '../../data/storyImages'

// Brand scene art. Until real photography is dropped into the storyImages
// slots, these render as the "photo": full-color, purpose-built coastal
// illustrations with depth, not empty gradients or thin line art. They share a
// warm South-Florida palette (sea + coral + gold + sand over navy) so the set
// reads as one intentional system while each slot tells its own story.

type Archetype = 'house' | 'room' | 'device' | 'document' | 'people' | 'signal'

const SLOT_ARCHETYPE: Record<StoryImageKey, Archetype> = {
  field_inspection: 'house',
  property_exterior: 'house',
  property_interior: 'room',
  vendor_arrival: 'people',
  documentation: 'document',
  completion: 'device',
  document_signing: 'document',
  notary_remote: 'device',
  courier_handoff: 'people',
  coordination: 'signal',
  business_owner: 'people',
  review: 'document',
}

// Shared palette (kept in sync with tailwind.config.js accents).
const C = {
  seaDeep: '#1C4A6B', sea: '#2FA39B', sea400: '#46BDB2', sea300: '#7FD3CB', seaMist: '#BFE9E2',
  coral: '#E8765A', coral300: '#F4A892', coral600: '#C85A42',
  gold: '#C9A227', gold300: '#E3CC7A',
  sand: '#EFE7D6', sandDeep: '#E3D6BC', cream: '#F6F1E6', sand500: '#CDB98F',
  leaf: '#3F9B6E', leafLt: '#57B583',
  navy: '#0E2340', slate: 'rgba(14,35,64,0.55)',
}

// A consistent coastal backdrop: layered sky, a warm sun, and a sand ground.
// Every scene sits on this so the set feels cohesive.
function Backdrop({ id, sun = C.gold }: { id: string; sun?: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.seaDeep} />
          <stop offset="0.55" stopColor={C.sea400} />
          <stop offset="1" stopColor={C.seaMist} />
        </linearGradient>
        <linearGradient id={`${id}-ground`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.sand} />
          <stop offset="1" stopColor={C.sandDeep} />
        </linearGradient>
        <radialGradient id={`${id}-sun`} cx="76%" cy="26%" r="30%">
          <stop offset="0" stopColor={sun} stopOpacity="0.9" />
          <stop offset="0.5" stopColor={sun} stopOpacity="0.25" />
          <stop offset="1" stopColor={sun} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id}-sky)`} />
      <circle cx="304" cy="78" r="34" fill={sun} opacity="0.85" />
      <rect width="400" height="300" fill={`url(#${id}-sun)`} />
      <path d="M0 214 Q120 198 210 210 T400 206 V300 H0 Z" fill={`url(#${id}-ground)`} />
    </>
  )
}

// A recurring palm motif ties the coastal theme together.
function Palm({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0 q3 -34 1 -60" fill="none" stroke={C.coral600} strokeWidth="4" strokeLinecap="round" />
      <g fill={C.leaf}>
        <path d="M1 -60 q-26 -6 -40 8 q22 -2 40 4 z" />
        <path d="M1 -60 q26 -6 40 8 q-22 -2 -40 4 z" />
        <path d="M1 -60 q-14 -22 -34 -24 q14 12 32 26 z" />
        <path d="M1 -60 q14 -22 34 -24 q-14 12 -32 26 z" />
      </g>
      <path d="M1 -60 q-4 -16 -2 -26 q6 10 6 24 z" fill={C.leafLt} />
    </g>
  )
}

function House({ id }: { id: string }) {
  return (
    <g>
      <Backdrop id={id} sun={C.gold300} />
      <Palm x={52} y={222} s={1.1} />
      {/* house */}
      <path d="M120 214 V120 h150 v94 z" fill={C.cream} />
      <path d="M120 214 V120 h20 v94 z" fill={C.sand} />
      <path d="M108 122 L195 66 L282 122 Z" fill={C.coral} />
      <path d="M108 122 L195 66 L195 122 Z" fill={C.coral600} opacity="0.55" />
      {/* door + windows */}
      <rect x="176" y="160" width="34" height="54" rx="2" fill={C.sea} />
      <circle cx="203" cy="188" r="2.4" fill={C.gold} />
      <rect x="140" y="150" width="28" height="26" rx="2" fill={C.sea300} />
      <rect x="222" y="150" width="30" height="26" rx="2" fill={C.gold300} />
      <path d="M236 150 v26 M222 163 h30" stroke={C.cream} strokeWidth="1.4" />
      <path d="M140 214 H288" stroke={C.sand500} strokeWidth="2" opacity="0.5" />
    </g>
  )
}

function Room({ id }: { id: string }) {
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-wall`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.cream} />
          <stop offset="1" stopColor={C.sand} />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id}-wall)`} />
      <rect x="0" y="212" width="400" height="88" fill={C.sandDeep} />
      {/* window to the sea */}
      <g>
        <rect x="60" y="64" width="128" height="104" rx="6" fill={C.seaDeep} />
        <rect x="66" y="70" width="116" height="92" rx="3" fill={C.sea400} />
        <rect x="66" y="120" width="116" height="42" rx="3" fill={C.seaMist} />
        <circle cx="150" cy="98" r="14" fill={C.gold300} />
        <rect x="60" y="64" width="128" height="104" rx="6" fill="none" stroke={C.cream} strokeWidth="4" />
        <path d="M124 66 V166 M62 116 H186" stroke={C.cream} strokeWidth="4" />
      </g>
      {/* neatly made bed */}
      <path d="M210 212 v-30 a10 10 0 0 1 10 -10 h108 a10 10 0 0 1 10 10 v30 z" fill={C.cream} />
      <rect x="210" y="196" width="128" height="16" fill={C.sea300} />
      <path d="M232 172 h40 v16 h-40 z" fill={C.coral300} />
      <rect x="206" y="210" width="136" height="8" fill={C.sand500} opacity="0.6" />
      {/* plant */}
      <g transform="translate(56 212)">
        <path d="M0 0 h26 l-4 -18 h-18 z" fill={C.coral} />
        <path d="M13 -18 q-16 -14 -6 -34 M13 -18 q16 -12 8 -34 M13 -18 q0 -18 0 -30" fill="none" stroke={C.leaf} strokeWidth="3" strokeLinecap="round" />
      </g>
    </g>
  )
}

function DeviceScene({ id }: { id: string }) {
  return (
    <g>
      <Backdrop id={id} sun={C.sea300} />
      {/* floating cards */}
      <g transform="rotate(-8 120 150)">
        <rect x="74" y="120" width="92" height="60" rx="8" fill={C.cream} />
        <rect x="86" y="134" width="40" height="7" rx="3" fill={C.sea400} />
        <rect x="86" y="148" width="60" height="6" rx="3" fill={C.sand500} />
        <rect x="86" y="160" width="48" height="6" rx="3" fill={C.sand500} />
      </g>
      {/* phone */}
      <rect x="182" y="70" width="104" height="176" rx="16" fill={C.navy} />
      <rect x="190" y="82" width="88" height="152" rx="8" fill={C.cream} />
      <rect x="202" y="96" width="64" height="9" rx="4" fill={C.sea} />
      <rect x="202" y="200" width="64" height="9" rx="4" fill={C.sand500} opacity="0.6" />
      <rect x="202" y="216" width="44" height="9" rx="4" fill={C.sand500} opacity="0.5" />
      {/* check badge */}
      <circle cx="234" cy="150" r="26" fill={C.coral} />
      <circle cx="234" cy="150" r="26" fill="none" stroke={C.cream} strokeWidth="2" opacity="0.6" />
      <path d="M223 150 l8 8 l15 -18" fill="none" stroke={C.cream} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* sparkle */}
      <path d="M300 150 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" fill={C.gold300} />
    </g>
  )
}

function DocumentScene({ id }: { id: string }) {
  return (
    <g>
      <Backdrop id={id} sun={C.coral300} />
      {/* document */}
      <rect x="120" y="60" width="164" height="182" rx="10" fill={C.cream} />
      <rect x="120" y="60" width="164" height="40" rx="10" fill={C.sea} />
      <rect x="120" y="90" width="164" height="10" fill={C.sea} />
      <rect x="140" y="74" width="70" height="10" rx="4" fill={C.cream} opacity="0.85" />
      <path d="M140 120 h124 M140 138 h124 M140 156 h96" stroke={C.sand500} strokeWidth="4" strokeLinecap="round" opacity="0.6" />
      {/* signature */}
      <path d="M140 196 q20 -20 40 0 t44 -2" fill="none" stroke={C.navy} strokeWidth="3" strokeLinecap="round" />
      {/* wax seal */}
      <circle cx="244" cy="206" r="18" fill={C.coral} />
      <circle cx="244" cy="206" r="18" fill="none" stroke={C.coral600} strokeWidth="3" />
      <path d="M244 196 l3 7 8 0 -6 5 2 8 -7 -4 -7 4 2 -8 -6 -5 8 0 z" fill={C.gold300} />
    </g>
  )
}

function People({ id }: { id: string }) {
  return (
    <g>
      <Backdrop id={id} sun={C.gold300} />
      <Palm x={344} y={222} s={1} />
      {/* building hint */}
      <rect x="60" y="128" width="96" height="86" rx="4" fill={C.cream} opacity="0.85" />
      <rect x="74" y="144" width="20" height="20" fill={C.sea300} />
      <rect x="104" y="144" width="20" height="20" fill={C.sea300} />
      <rect x="134" y="144" width="14" height="70" fill={C.coral300} />
      {/* figure one - coral */}
      <g>
        <circle cx="196" cy="120" r="18" fill={C.sand500} />
        <path d="M170 214 v-42 a26 26 0 0 1 52 0 v42 z" fill={C.coral} />
        <path d="M196 150 v40" stroke={C.coral600} strokeWidth="2" opacity="0.6" />
      </g>
      {/* figure two - sea */}
      <g>
        <circle cx="256" cy="128" r="16" fill={C.sand500} />
        <path d="M232 214 v-38 a24 24 0 0 1 48 0 v38 z" fill={C.sea} />
      </g>
      {/* greeting */}
      <path d="M216 168 q10 -8 22 -4" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round" strokeDasharray="1 7" />
    </g>
  )
}

function Signal({ id }: { id: string }) {
  return (
    <g>
      <Backdrop id={id} sun={C.sea300} />
      <g transform="translate(200 150)">
        <circle r="86" fill="none" stroke={C.cream} strokeWidth="2" opacity="0.35" />
        <circle r="56" fill="none" stroke={C.cream} strokeWidth="2" opacity="0.5" />
        <circle r="28" fill="none" stroke={C.cream} strokeWidth="2" opacity="0.7" />
        {/* connecting lines */}
        <path d="M0 0 L-78 -44 M0 0 L82 -30 M0 0 L64 56 M0 0 L-70 50" stroke={C.cream} strokeWidth="1.5" opacity="0.4" />
        {/* central map pin */}
        <path d="M0 -16 a16 16 0 0 1 16 16 c0 12 -16 26 -16 26 s-16 -14 -16 -26 a16 16 0 0 1 16 -16 z" fill={C.coral} />
        <circle cy="0" r="6" fill={C.cream} />
        {/* nodes */}
        <circle cx="-78" cy="-44" r="6" fill={C.gold} />
        <circle cx="82" cy="-30" r="6" fill={C.sea300} />
        <circle cx="64" cy="56" r="6" fill={C.gold300} />
        <circle cx="-70" cy="50" r="6" fill={C.coral300} />
      </g>
    </g>
  )
}

const SCENES: Record<Archetype, (p: { id: string }) => JSX.Element> = {
  house: House,
  room: Room,
  device: DeviceScene,
  document: DocumentScene,
  people: People,
  signal: Signal,
}

export function SceneArt({ slot, className = '' }: { slot: StoryImageKey; className?: string }) {
  const id = `scene-${slot}`
  const Scene = SCENES[SLOT_ARCHETYPE[slot]]
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className={`h-full w-full ${className}`} role="presentation" aria-hidden="true">
      <Scene id={id} />
    </svg>
  )
}
