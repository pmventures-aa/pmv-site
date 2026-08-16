import { useReducedMotion } from 'motion/react'
import { Link, useNavigate, type LinkProps } from 'react-router-dom'
import type { MouseEvent, ReactNode } from 'react'

type StartViewTransition = (updateCallback: () => void) => void

// Progressive-enhancement page transition. Where the View Transition API is
// available and the visitor does not prefer reduced motion, navigation runs
// inside a view transition for a subtle cross-fade. Everywhere else this is a
// normal React Router Link with identical behavior.
export function ViewTransitionLink({ to, onClick, children, ...rest }: LinkProps & { children?: ReactNode }) {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const documentWithVT = document as Document & { startViewTransition?: StartViewTransition }
  const supports = typeof document !== 'undefined' && typeof documentWithVT.startViewTransition === 'function'

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (event.defaultPrevented) return
    if (!supports || reduce) return
    event.preventDefault()
    documentWithVT.startViewTransition?.(() => {
      navigate(to)
      window.scrollTo({ top: 0 })
    })
  }

  return (
    <Link to={to} onClick={handleClick} {...rest}>
      {children}
    </Link>
  )
}