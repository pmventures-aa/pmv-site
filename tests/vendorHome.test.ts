import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Vendor portal home: approved vendors land on a real dashboard (welcome +
// stats + active-assignment cards with per-job progress), not a bare list.
describe('vendor portal home', () => {
  const home = read('../src/pages/admin/VendorHome.tsx')
  const app = read('../src/pages/admin/AdminApp.tsx')
  const nav = read('../src/components/layout/nav.ts')

  it('renders vendors a home dashboard instead of redirecting to the bare list', () => {
    expect(app).toContain("import('./VendorHome')")
    expect(app).toContain("workspace.party_type==='vendor') return <VendorHome/>")
    // The old redirect to field-work/mine must be gone.
    expect(app).not.toContain("party_type==='vendor') return <Navigate to={p('field-work/mine')}")
  })

  it('gives the vendor nav a Home item pointing at the workspace root', () => {
    expect(nav).toContain("{key:'home',label:'Home',to:'',icon:Home}")
  })

  it('reads the vendor own assignments and splits active from completed', () => {
    expect(home).toContain("api.get<{ assignments: Assignment[] }>('/admin/field-assignments')")
    expect(home).toContain('a.vendor_user_id === user?.id')
    expect(home).toContain("a.status !== 'completed'")
  })

  it('shows per-job progress and workspace-aware welcome copy', () => {
    expect(home).toContain('hqWorkspaceCopy')
    expect(home).toContain('through this job')
    expect(home).toContain('STATUS_PCT')
  })

  it('keeps assignment cards from overflowing on mobile (grid items can shrink)', () => {
    // CSS grid items default to min-width:auto and will not shrink below their
    // content, so the card grid needs min-w-0 on the <li> for truncate to work.
    expect(home).toContain('<li key={a.id} className="min-w-0">')
  })

  it('keeps user-facing source free of em dashes (release gate)', () => {
    expect(home).not.toContain('—')
  })
})
