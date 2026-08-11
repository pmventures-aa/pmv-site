// Ambient, breathing ring visual used both as the client-portal loading
// state and as the hero-banner artwork on the Command Center dashboard.
// Deliberately not a spinner - three overlapping stroke-only ellipses that
// each rotate at their own slow phase, plus a soft glowing halo, produce
// a calm, organic motion the eye reads as "the app is thinking" without
// the manic "please wait" feel of a circular progress spinner.
//
// Everything ships as inline SVG + CSS keyframes so it works in any
// browser (including offline) without external assets, and the animation
// pauses automatically for viewers who set prefers-reduced-motion.

interface Props {
  size?: number
  className?: string
  /** When true, hides the accessible name - use inside decorative hero banners. */
  decorative?: boolean
}

export function PortalOrb({ size = 220, className = '', decorative = false }: Props) {
  const stroke = 'url(#pmv-orb-gradient)'
  return (
    <div
      className={`pmv-orb relative grid place-items-center ${className}`}
      style={{ width: size, height: size }}
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : 'Pinnacle portal orb'}
    >
      <div className="pmv-orb__halo absolute inset-0 rounded-full" aria-hidden />
      <svg viewBox="0 0 220 220" width={size} height={size} className="relative">
        <defs>
          <linearGradient id="pmv-orb-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f5c76e" stopOpacity=".95" />
            <stop offset=".55" stopColor="#d7b56d" stopOpacity=".85" />
            <stop offset="1" stopColor="#8a6d2f" stopOpacity=".55" />
          </linearGradient>
          <radialGradient id="pmv-orb-glow" cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor="#f5c76e" stopOpacity=".22" />
            <stop offset="1" stopColor="#f5c76e" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="110" cy="110" r="82" fill="url(#pmv-orb-glow)" />

        <g fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round">
          <ellipse
            cx="110"
            cy="110"
            rx="90"
            ry="72"
            className="pmv-orb__ring pmv-orb__ring--a"
          />
          <ellipse
            cx="110"
            cy="110"
            rx="78"
            ry="90"
            className="pmv-orb__ring pmv-orb__ring--b"
          />
          <ellipse
            cx="110"
            cy="110"
            rx="86"
            ry="86"
            className="pmv-orb__ring pmv-orb__ring--c"
            strokeDasharray="6 22"
          />
        </g>
      </svg>
    </div>
  )
}
