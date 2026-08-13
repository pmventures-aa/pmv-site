import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

/** Pin a popover to the viewport so overflow-hidden / later siblings cannot clip it. */
export function useFixedBelowAnchor(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  align: 'right' | 'left' = 'right',
  gap = 8,
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({})
  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setStyle(align === 'right'
        ? { position: 'fixed', top: r.bottom + gap, right: Math.max(12, window.innerWidth - r.right), left: 'auto' }
        : { position: 'fixed', top: r.bottom + gap, left: Math.max(12, r.left), right: 'auto' })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchorRef, align, gap])
  return style
}
