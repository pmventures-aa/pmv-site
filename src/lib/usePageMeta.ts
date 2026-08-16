import { useEffect } from 'react'

const SITE_NAME = 'Pinnacle Management Ventures'
const SITE_URL = 'https://pinnaclemanagementventures.com'
const DEFAULT_DESCRIPTION =
  'Pinnacle Management Ventures provides South Florida property cleaning, inspections, eviction and REO support, document and mobile services, administrative help, and business operations support.'
const SOCIAL_IMAGE = '/logo-crest-on-dark.png'

function ensureMeta(name: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', name)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function ensureOg(property: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('property', property)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

// index.html sets the initial title and description. Public routes use this
// lightweight helper to keep metadata accurate as visitors move through the
// client-side application, then restore the previous values on unmount.
export function usePageMeta(title: string, description = DEFAULT_DESCRIPTION) {
  useEffect(() => {
    const prevTitle = document.title
    const meta = document.querySelector('meta[name="description"]')
    const prevDescription = meta?.getAttribute('content') ?? DEFAULT_DESCRIPTION
    const canonical = document.querySelector('link[rel="canonical"]')
    const prevCanonical = canonical?.getAttribute('href') ?? null
    const url = `${SITE_URL}${window.location.pathname}`

    document.title = `${title} | ${SITE_NAME}`
    meta?.setAttribute('content', description)

    let canonicalEl: HTMLLinkElement | null = canonical as HTMLLinkElement | null
    if (!canonicalEl) {
      canonicalEl = document.createElement('link')
      canonicalEl.setAttribute('rel', 'canonical')
      document.head.appendChild(canonicalEl)
    }
    canonicalEl.setAttribute('href', url)

    ensureMeta('robots', 'index, follow')
    ensureOg('og:site_name', SITE_NAME)
    ensureOg('og:type', 'website')
    ensureOg('og:title', `${title} | ${SITE_NAME}`)
    ensureOg('og:description', description)
    ensureOg('og:url', url)
    ensureOg('og:image', `${SITE_URL}${SOCIAL_IMAGE}`)
    ensureMeta('twitter:card', 'summary_large_image')

    return () => {
      document.title = prevTitle
      meta?.setAttribute('content', prevDescription)
      if (canonicalEl) {
        if (prevCanonical) canonicalEl.setAttribute('href', prevCanonical)
        else canonicalEl.remove()
      }
    }
  }, [title, description])
}
