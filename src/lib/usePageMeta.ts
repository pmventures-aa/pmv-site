import { useEffect } from 'react'

const SITE_NAME = 'Pinnacle Management Ventures'
const DEFAULT_DESCRIPTION =
  'Pinnacle Management Ventures provides business consulting, operational coordination, POS and payment transition support, property and field support, and defined mobile professional services.'

// index.html sets the initial title and description. Public routes use this
// lightweight helper to keep metadata accurate as visitors move through the
// client-side application, then restore the previous values on unmount.
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
