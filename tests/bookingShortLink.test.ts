import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const router = read('../src/main.tsx')
const page = read('../src/pages/public/Consultation.tsx')
const meta = read('../src/lib/usePageMeta.ts')
const settings = read('../src/pages/admin/settings/ConsultationBookingSettings.tsx')

// /consultation is a mouthful to read out or fit in a signature. /book is the
// share-friendly address for the same page.

describe('the short link answers', () => {
  it('renders the booking page at /book', () => {
    expect(router).toContain('<Route path="/book" element={<Consultation />} />')
  })

  it('renders rather than redirecting', () => {
    // A redirect would swap the short address someone was given for the long
    // one the moment they opened it.
    expect(router).not.toContain('path="/book" element={<Navigate')
  })

  it('leaves the existing addresses alone', () => {
    expect(router).toContain('<Route path="/consultation" element={<Consultation />} />')
    expect(router).toContain('path="/book-a-consultation"')
  })
})

describe('two addresses, one page in search results', () => {
  it('pins the canonical so they do not compete', () => {
    expect(page).toContain("{ canonicalPath: '/consultation' }")
  })

  it('lets usePageMeta take an explicit canonical', () => {
    expect(meta).toContain('canonicalPath?: string')
    expect(meta).toContain('const path = opts.canonicalPath ?? window.location.pathname')
  })

  it('reruns when the pinned path changes', () => {
    // The effect reads opts, so a stale dependency list would leave the
    // previous page's canonical in the document head.
    expect(meta).toContain('[title, description, opts.exactTitle, opts.canonicalPath]')
  })
})

describe('the link is available where it is configured', () => {
  it('shows the short link with a copy control', () => {
    expect(settings).toContain("const BOOKING_LINK = 'https://pinnaclemanagementventures.com/book'")
    expect(settings).toContain('navigator.clipboard.writeText(BOOKING_LINK)')
    expect(settings).toContain("{copied ? 'Copied' : 'Copy'}")
  })

  it('survives a refused clipboard', () => {
    // Clipboard access is denied in plenty of ordinary situations; the link is
    // selectable text on screen either way.
    expect(settings).toContain('Could not copy. Select the link and copy it by hand.')
  })

  it('says plainly whether the link is live yet', () => {
    // A link that quietly shows a phone number instead of times is worse than
    // one that says it is not published.
    expect(settings).toContain('It shows a phone number instead of times until you publish below.')
  })
})
