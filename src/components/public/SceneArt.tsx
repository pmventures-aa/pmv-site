import type { StoryImageKey } from '../../data/storyImages'

// Brand-consistent SVG scene art. Until real photography is dropped into the
// storyImages slots, these render as the "photo" - intentional editorial line
// art on a layered navy field, not an empty gradient. Each slot maps to one of
// a few architectural/editorial archetypes so the set stays cohesive.

type Archetype = 'room' | 'house' | 'device' | 'document' | 'people' | 'signal'

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

const GOLD = '#c9a227'

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#132038" />
        <stop offset="1" stopColor="#0a1120" />
      </linearGradient>
      <radialGradient id={`${id}-glow`} cx="72%" cy="24%" r="60%">
        <stop offset="0" stopColor={GOLD} stopOpacity="0.22" />
        <stop offset="0.55" stopColor={GOLD} stopOpacity="0" />
      </radialGradient>
    </defs>
  )
}

// Individual scenes. Strokes are thin and gold/white at low opacity for a
// premium, restrained architectural feel.
const stroke = { fill: 'none', stroke: 'rgba(255,255,255,0.5)', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const goldStroke = { fill: 'none', stroke: GOLD, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function Room() {
  return (
    <g>
      {/* floor + wall */}
      <path d="M40 210 H360" {...stroke} opacity="0.35" />
      {/* window */}
      <rect x="70" y="70" width="120" height="95" rx="4" {...stroke} />
      <path d="M130 70 V165 M70 118 H190" {...stroke} opacity="0.6" />
      <path d="M78 158 L120 108 M120 158 L182 96" {...goldStroke} opacity="0.5" />
      {/* bed, cleanly made */}
      <path d="M210 165 h120 v22 h-120 z" {...stroke} />
      <path d="M210 165 v-26 a10 10 0 0 1 10 -10 h100 a10 10 0 0 1 10 10 v26" {...stroke} opacity="0.7" />
      <path d="M226 143 h48" {...goldStroke} />
      {/* plant */}
      <path d="M52 210 v-20 M52 190 q-12 -14 -2 -26 M52 190 q12 -12 3 -28" {...goldStroke} opacity="0.7" />
      <path d="M44 210 h16 l-2 -12 h-12 z" {...stroke} />
    </g>
  )
}

function House() {
  return (
    <g>
      <path d="M60 200 H340" {...stroke} opacity="0.35" />
      <path d="M110 200 V120 L200 74 L290 120 V200" {...stroke} />
      <path d="M92 132 L200 74 L308 132" {...goldStroke} />
      <rect x="150" y="150" width="40" height="50" rx="2" {...stroke} opacity="0.8" />
      <rect x="220" y="140" width="40" height="34" rx="2" {...stroke} opacity="0.8" />
      <path d="M220 157 h40 M240 140 v34" {...stroke} opacity="0.5" />
      <circle cx="182" cy="176" r="2.4" fill={GOLD} />
    </g>
  )
}

function DeviceScene() {
  return (
    <g>
      <rect x="150" y="58" width="100" height="184" rx="14" {...stroke} />
      <rect x="164" y="80" width="72" height="10" rx="3" {...stroke} opacity="0.5" />
      <rect x="164" y="104" width="72" height="48" rx="6" {...stroke} opacity="0.4" />
      {/* check */}
      <circle cx="200" cy="128" r="16" {...goldStroke} />
      <path d="M192 128 l6 6 l11 -13" {...goldStroke} />
      <rect x="164" y="168" width="72" height="8" rx="3" {...stroke} opacity="0.35" />
      <rect x="164" y="184" width="52" height="8" rx="3" {...stroke} opacity="0.3" />
    </g>
  )
}

function DocumentScene() {
  return (
    <g>
      <rect x="120" y="66" width="160" height="168" rx="8" {...stroke} />
      <path d="M144 100 h112 M144 122 h112 M144 144 h80" {...stroke} opacity="0.4" />
      <path d="M144 186 q22 -18 44 0 t44 0" {...goldStroke} />
      <path d="M242 176 l14 -14 6 6 -14 14 z" {...goldStroke} />
    </g>
  )
}

function People() {
  return (
    <g>
      <path d="M60 210 H340" {...stroke} opacity="0.3" />
      {/* figure one */}
      <circle cx="150" cy="112" r="20" {...stroke} />
      <path d="M118 200 v-34 a32 32 0 0 1 64 0 v34" {...stroke} />
      {/* figure two */}
      <circle cx="250" cy="120" r="18" {...goldStroke} />
      <path d="M222 200 v-30 a28 28 0 0 1 56 0 v30" {...goldStroke} opacity="0.85" />
      {/* handoff line */}
      <path d="M176 150 h48" {...stroke} opacity="0.5" strokeDasharray="4 6" />
    </g>
  )
}

function Signal() {
  return (
    <g>
      <circle cx="200" cy="150" r="10" {...goldStroke} />
      <circle cx="200" cy="150" r="42" {...stroke} opacity="0.55" />
      <circle cx="200" cy="150" r="78" {...stroke} opacity="0.28" />
      <circle cx="120" cy="108" r="4" fill={GOLD} />
      <circle cx="286" cy="120" r="4" fill="rgba(255,255,255,0.7)" />
      <circle cx="268" cy="206" r="4" fill="rgba(255,255,255,0.6)" />
      <circle cx="128" cy="196" r="4" fill={GOLD} />
      <path d="M124 112 L196 148 M282 124 L204 148 M264 202 L206 154 M132 192 L196 154" {...stroke} opacity="0.3" />
    </g>
  )
}

const SCENES: Record<Archetype, () => JSX.Element> = {
  room: Room,
  house: House,
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
      <Defs id={id} />
      <rect width="400" height="300" fill={`url(#${id}-bg)`} />
      <rect width="400" height="300" fill={`url(#${id}-glow)`} />
      <Scene />
    </svg>
  )
}
