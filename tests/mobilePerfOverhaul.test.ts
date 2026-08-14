import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('mobile and performance overhaul contracts', () => {
  const adminApp = readFileSync(new URL('../src/pages/admin/AdminApp.tsx', import.meta.url), 'utf8')
  const portalApp = readFileSync(new URL('../src/pages/portal/PortalApp.tsx', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
  const fieldApi = readFileSync(new URL('../functions/_lib/routes/fieldWork.ts', import.meta.url), 'utf8')
  const offerings = readFileSync(new URL('../functions/_lib/routes/serviceOfferings.ts', import.meta.url), 'utf8')
  const users = readFileSync(new URL('../src/pages/admin/UsersAdmin.tsx', import.meta.url), 'utf8')
  const invites = readFileSync(new URL('../src/pages/admin/InvitationsAdmin.tsx', import.meta.url), 'utf8')
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

  it('lazy-loads HQ, portal, and public routes instead of one eager surface bundle', () => {
    expect(adminApp).toContain("lazy(() => import('./FieldWorkVendor'))")
    expect(adminApp).toContain("lazy(() => import('./QuotesAdmin'))")
    expect(adminApp).toContain("lazy(() => import('./MessagesAdmin'))")
    expect(adminApp).not.toMatch(/^import AdminDashboard from/m)
    expect(portalApp).toContain("lazy(() => import('./Dashboard'))")
    expect(portalApp).toContain("lazy(() => import('./Matters'))")
    expect(main).toContain("lazy(() => import('./pages/public/ScopeRequest'))")
    expect(vite).toContain('manualChunks')
  })

  it('keeps Home eager so the public first paint does not wait on every marketing page', () => {
    expect(main).toContain("import Home from './pages/Home'")
  })

  it('omits signature image blobs from the field-assignment list DTO', () => {
    const listStart = fieldApi.indexOf("fieldWorkRoutes.get('/field-assignments'")
    const listEnd = fieldApi.indexOf("fieldWorkRoutes.get('/field-assignments/:id'")
    const list = fieldApi.slice(listStart, listEnd)
    expect(list).toContain('fa.vendor_signature_type, fa.vendor_signature_name')
    expect(list).not.toContain('fa.*')
    expect(list).not.toContain('vendor_signature_image_key')
  })

  it('caches the public service catalog in KV and busts it on writes', () => {
    expect(offerings).toContain('public-service-offerings:v1')
    expect(offerings).toContain('bustPublicOfferingsCache')
    expect(offerings).toContain("Cache-Control', 'public, max-age=60")
  })

  it('stops minting legacy hq. and client. hosts from HQ user and invite screens', () => {
    expect(users).toContain('accountSetupUrl')
    expect(users).not.toContain('client.pinnaclemanagementventures.com')
    expect(users).not.toContain('hq.pinnaclemanagementventures.com')
    expect(invites).toContain('vendorSignupUrl')
    expect(invites).not.toContain('hq.pinnaclemanagementventures.com')
  })

  it('registers an HQ PWA that does not cache authenticated API responses', () => {
    expect(main).toContain('installHqPwa')
    expect(main).toContain('/sw.js')
    expect(sw).toContain("url.pathname.startsWith('/api/')")
    expect(sw).toContain("url.pathname.startsWith('/assets/')")
  })
})
