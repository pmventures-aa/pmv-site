import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('location: authorize once, then static', () => {
  const permission = read('../src/lib/useGeolocationPermission.ts')
  const share = read('../src/lib/useLiveLocationShare.ts')
  const autoStart = read('../src/components/admin/LocationAutoStart.tsx')
  const network = read('../src/pages/admin/ProviderNetworkAdmin.tsx')

  it('the permission hook exposes a confirmed flag distinct from optimistic granted', () => {
    expect(permission).toContain('confirmed: boolean')
    expect(permission).toContain('setConfirmed(true)')
  })

  it('auto-start watchers gate on confirmed so no watch (and no dialog) fires on the optimistic hint', () => {
    // Both surfaces must wait for the browser to actually answer before
    // starting a watch — this is what stopped the "authorize every visit" bug.
    expect(autoStart).toContain('geoPerm.confirmed')
    expect(network).toContain('geoPerm.confirmed')
  })

  it('live sharing is a module-level singleton (one watch, shared across surfaces)', () => {
    expect(share).toMatch(/let\s+watchId/)
    expect(share).toMatch(/let\s+sharing/)
    expect(share).toContain('const listeners = new Set')
    // The watch must survive component unmount (SPA navigation) — no per-mount
    // clearWatch teardown that would end sharing on route change.
    expect(share).not.toMatch(/useEffect\(\(\) => \(\) => \{[\s\S]*clearWatch/)
  })
})

describe('top-bar location box', () => {
  const box = read('../src/components/admin/TopbarLocation.tsx')
  const layout = read('../src/components/admin/AdminLayout.tsx')

  it('is a box-shaped control mounted in the HQ top bar', () => {
    expect(box).toContain('rounded-md border')
    expect(layout).toContain('TopbarLocation')
  })

  it('auto-starts silently only after the grant is confirmed, and toggles sharing on click', () => {
    expect(box).toContain('geo.confirmed')
    expect(box).toContain('void stop()')
  })
})
