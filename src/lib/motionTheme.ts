import type { Transition, Variants } from 'motion/react'

// One motion language across PMV, tuned by intent instead of by page.
// Public work can use `gentle` and `ambient`; product interactions should
// stay on the quicker `snap` and `ui` transitions.
export const pmvMotion = {
  snap: { duration: 0.16, ease: [0.2, 0.8, 0.2, 1] },
  ui: { type: 'spring', stiffness: 420, damping: 36, mass: 0.78 },
  gentle: { type: 'spring', stiffness: 190, damping: 26, mass: 0.9 },
  premium: { duration: 0.42, ease: [0.25, 1, 0.5, 1] },
  ambient: { duration: 12, ease: 'easeInOut' },
} satisfies Record<string, Transition>

export const pmvFadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: pmvMotion.gentle },
}

export const pmvStagger: Variants = {
  hidden: {},
  show: {
    transition: {
      delayChildren: 0.04,
      staggerChildren: 0.065,
    },
  },
}

export const pmvPanel: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.992 },
  show: { opacity: 1, y: 0, scale: 1, transition: pmvMotion.gentle },
  exit: { opacity: 0, y: -6, scale: 0.995, transition: pmvMotion.snap },
}
