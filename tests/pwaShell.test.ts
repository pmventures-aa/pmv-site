import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('HQ/portal PWA shell', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  const hqManifest = readFileSync(new URL('../public/manifest-hq.webmanifest', import.meta.url), 'utf8')
  const portalManifest = readFileSync(new URL('../public/manifest-portal.webmanifest', import.meta.url), 'utf8')

  it('registers a service worker only on post-login surfaces', () => {
    expect(main).toContain("surface === 'admin' || surface === 'portal'")
    expect(main).toContain("navigator.serviceWorker.register('/sw.js')")
    expect(main).toContain('/manifest-hq.webmanifest')
    expect(main).toContain('/manifest-portal.webmanifest')
  })

  it('caches hashed assets and never intercepts authenticated API calls', () => {
    expect(sw).toContain("url.pathname.startsWith('/api/')")
    expect(sw).toContain('return')
    expect(sw).toContain("url.pathname.startsWith('/assets/')")
    expect(hqManifest).toContain('/hq/field-work/mine')
    expect(portalManifest).toContain('"start_url": "/"')
    expect(hqManifest).not.toContain('m.pinnacle')
    expect(portalManifest).not.toContain('mobile.')
  })
})
