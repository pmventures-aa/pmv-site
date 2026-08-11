import { useEffect } from 'react'

const SITE_NAME = 'Pinnacle Management Ventures'
const DEFAULT_DESCRIPTION =
  'Pinnacle Management Ventures: professional support wherever business takes you. Consulting, funding & capital, property management, mobile notary, property inspections, document courier, and administrative support.'

// index.html only sets one static <title>/<meta description> for the whole
// app: this is the per-route equivalent, without pulling in
// react-helmet-async (no other data-fetching/routing-adjacent libraries are
// used in this codebase; see src/lib/api.ts). Restores the site defaults on
// unmount so navigating between public pages never leaves a stale title.
export function usePageMeta(title: string, description = DEFAULT_DESCRIPTION) {
  useEffect(() => {
    const prevTitle = document.title
    const meta = document.querySelector('meta[name="description"]')
    const prevDescription = meta?.getAttribute('content') ?? DEFAULT_DESCRIPTION

    document.title = `${title} | ${SITE_NAME}`
    meta?.setAttribute('content', description)

    return () => {
      document.title = prevTitle
      meta?.setAttribute('content', prevDescription)
    }
  }, [title, description])
}
