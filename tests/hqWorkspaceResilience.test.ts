import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Hardening for the intermittent "This workspace needs to be reloaded" screen:
// the HQ error boundary now self-heals on navigation, and one malformed email
// body can no longer crash the whole Messages workspace.
describe('HQ workspace resilience', () => {
  const boundary = read('../src/components/admin/AdminPageBoundary.tsx')
  const layout = read('../src/components/admin/AdminLayout.tsx')
  const email = read('../src/pages/admin/EmailThreadsPanel.tsx')

  it('auto-recovers the error boundary when the route (path or query) changes', () => {
    expect(boundary).toContain('resetKey')
    expect(boundary).toContain('componentDidUpdate')
    expect(boundary).toContain('this.setState({ error: null })')
    // Must key on search too - HQ sections switch via ?tab=/?thread=, not path.
    expect(layout).toContain('resetKey={location.pathname + location.search}')
  })

  it('renders each email body defensively so one bad message cannot crash Messages', () => {
    expect(email).toContain('function safeMessageHtml')
    expect(email).toContain('safeMessageHtml(m.body_html, m.body_text)')
    // The guard falls back instead of throwing out of the render.
    expect(email).toMatch(/catch\s*\{[\s\S]*could not render this message/)
  })
})
