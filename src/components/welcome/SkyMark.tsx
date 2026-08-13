import { useId } from 'react'
import type { SkyPeriod } from '../../lib/welcomeSky'

const PALETTE: Record<SkyPeriod, {
  top: string
  mid: string
  horizon: string
  land: string
  landFar: string
  star: string
  glow: string
}> = {
  sunrise: {
    top: '#1a2748',
    mid: '#c47a52',
    horizon: '#f3c98a',
    land: '#121c33',
    landFar: '#1c2a46',
    star: 'transparent',
    glow: '#ffd7a1',
  },
  day: {
    top: '#3d5a7a',
    mid: '#7ea0b8',
    horizon: '#d7c4a0',
    land: '#1a283c',
    landFar: '#24364f',
    star: 'transparent',
    glow: '#ffe7b8',
  },
  sunset: {
    top: '#1b1a3a',
    mid: '#b45a48',
    horizon: '#efb07a',
    land: '#10182c',
    landFar: '#1a243c',
    star: 'rgba(255,255,255,.35)',
    glow: '#ffc08a',
  },
  night: {
    top: '#070b16',
    mid: '#142038',
    horizon: '#243656',
    land: '#070b14',
    landFar: '#0e1626',
    star: 'rgba(255,255,255,.55)',
    glow: '#d7e4ff',
  },
}

function sunPosition(period: SkyPeriod) {
  if (period === 'sunrise') return { cx: 84, cy: 64, r: 16 }
  if (period === 'day') return { cx: 118, cy: 34, r: 14 }
  if (period === 'sunset') return { cx: 52, cy: 70, r: 17 }
  return { cx: 128, cy: 30, r: 11 }
}

export function SkyMark({ period, className = '' }: { period: SkyPeriod; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const sky = PALETTE[period]
  const sun = sunPosition(period)
  const isNight = period === 'night'

  return (
    <svg
      className={`pmv-sky-mark ${className}`}
      viewBox="0 0 168 112"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sky.top} />
          <stop offset="52%" stopColor={sky.mid} />
          <stop offset="78%" stopColor={sky.horizon} />
          <stop offset="100%" stopColor={sky.landFar} />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx={String(sun.cx / 168)} cy={String(sun.cy / 112)} r="0.42">
          <stop offset="0%" stopColor={sky.glow} stopOpacity={isNight ? 0.35 : 0.72} />
          <stop offset="100%" stopColor={sky.glow} stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-soft`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      <rect width="168" height="112" rx="18" fill={`url(#${uid}-sky)`} />
      <ellipse className="pmv-sky-haze" cx="84" cy="70" rx="78" ry="22" fill={`url(#${uid}-glow)`} />
      {isNight && (
        <g fill={sky.star}>
          <circle className="pmv-sky-star" cx="28" cy="22" r="1.1" />
          <circle className="pmv-sky-star pmv-sky-star-late" cx="64" cy="16" r="0.8" />
          <circle className="pmv-sky-star" cx="96" cy="28" r="1" />
          <circle className="pmv-sky-star pmv-sky-star-late" cx="148" cy="18" r="0.9" />
        </g>
      )}
      <circle className="pmv-sky-sun" cx={sun.cx} cy={sun.cy} r={sun.r + 10} fill={sky.glow} opacity={isNight ? 0.18 : 0.28} filter={`url(#${uid}-soft)`} />
      <circle className="pmv-sky-sun" cx={sun.cx} cy={sun.cy} r={sun.r} fill={isNight ? '#e8eef8' : sky.glow} />
      <path d="M0 86 C 28 78, 48 92, 78 84 C 108 76, 128 90, 168 80 L 168 112 L 0 112 Z" fill={sky.landFar} opacity="0.92" />
      <path d="M0 94 C 36 88, 58 102, 92 93 C 122 85, 142 100, 168 92 L 168 112 L 0 112 Z" fill={sky.land} />
      <rect x="0" y="78" width="168" height="1" fill={sky.horizon} opacity="0.28" />
    </svg>
  )
}
