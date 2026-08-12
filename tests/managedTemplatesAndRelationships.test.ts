import { describe, expect, it } from 'vitest'
import { humanizeLabel, toDisplayCase } from '../shared/displayCase'
import { normalizeTemplateSections } from '../functions/_lib/managedTemplates'
import { DEFAULT_PROVIDER_AGREEMENT_SECTIONS } from '../shared/providerAgreementContent'

describe('managed templates and relationship display rules', () => {
  it('normalizes names and titles while preserving Pinnacle acronyms', () => {
    expect(toDisplayCase("  jane o'connor  ")).toBe("Jane O'Connor")
    expect(toDisplayCase('acme llc')).toBe('Acme LLC')
    expect(humanizeLabel('remote_online_notary_ron')).toBe('Remote Online Notary RON')
  })

  it('keeps only complete template sections and assigns stable ids', () => {
    const sections = normalizeTemplateSections([
      { title: '  New Section ', body: 'Useful text' },
      { title: 'Missing body', body: '' },
    ])
    expect(sections).toEqual([{ id: 'new-section', title: 'New Section', body: 'Useful text' }])
    expect(DEFAULT_PROVIDER_AGREEMENT_SECTIONS.length).toBeGreaterThanOrEqual(15)
  })
})
