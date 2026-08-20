import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dash = readFileSync(new URL('../src/pages/admin/DocumentOperationsDashboard.tsx', import.meta.url), 'utf8')

// Opening a document used to render it below the hero, a six-metric grid, two
// panels, and the governance workbench - i.e. halfway down the page. The
// working area must lead, with the overview demoted to a collapsed section.
describe('document center layout', () => {
  it('renders the working document area before the operations overview', () => {
    const workspaceIdx = dash.indexOf('<DocumentCenter/>')
    const overviewIdx = dash.indexOf('Operations overview')
    expect(workspaceIdx).toBeGreaterThan(-1)
    expect(overviewIdx).toBeGreaterThan(-1)
    expect(workspaceIdx).toBeLessThan(overviewIdx)
  })

  it('demotes the overview + governance into a collapsed details section', () => {
    // The metrics, recently-updated/governance panels, and the governance
    // workbench all live inside the collapsible, so they never bury the docs.
    const detailsIdx = dash.indexOf('<details')
    expect(detailsIdx).toBeGreaterThan(dash.indexOf('<DocumentCenter/>'))
    expect(dash).toContain('<DocumentGovernanceWorkbench/>')
    expect(dash.indexOf('<DocumentGovernanceWorkbench/>')).toBeGreaterThan(detailsIdx)
  })
})
