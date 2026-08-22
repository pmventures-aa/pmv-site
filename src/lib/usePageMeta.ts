import { useEffect } from 'react'

const SITE_NAME = 'Pinnacle Management Ventures'
// Canonical host is www, matching the sitemap and the static tags in index.html
// so search engines consolidate on one hostname.
const SITE_URL = 'https://www.pinnaclemanagementventures.com'
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
// `exactTitle` renders the title verbatim instead of appending "| Site Name".
// Use it on the home page so the title leads with the brand, which is the
// signal Google uses to show the site name beside the result.
// `canonicalPath` pins the canonical url to one path when a page answers on
// several. Without it the canonical follows whatever address the visitor
// arrived at, so a short share link and its long form would compete as two
// separate pages for the same content.
export function usePageMeta(
  title: string,
  description = DEFAULT_DESCRIPTION,
  opts: { exactTitle?: boolean; canonicalPath?: string } = {},
) {
  useEffect(() => {
    const prevTitle = document.title
    const meta = document.querySelector('meta[name="description"]')
    const prevDescription = meta?.getAttribute('content') ?? DEFAULT_DESCRIPTION
    const canonical = document.querySelector('link[rel="canonical"]')
    const prevCanonical = canonical?.getAttribute('href') ?? null
    const path = opts.canonicalPath ?? window.location.pathname
    const url = `${SITE_URL}${path}`
    const fullTitle = opts.exactTitle ? title : `${title} | ${SITE_NAME}`

    document.title = fullTitle
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
    ensureOg('og:title', fullTitle)
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
  }, [title, description, opts.exactTitle, opts.canonicalPath])
}
