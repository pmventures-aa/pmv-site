import { describe, expect, it } from 'vitest'
import {
  checklistTemplateFor,
  allRequiredResolved,
  checklistProgress,
  isIssueCategory,
  isIssueSeverity,
  issueCategoryLabel,
  issueSeverityLabel,
} from '../shared/cleaningChecklist'

describe('cleaning checklist templates', () => {
  it('gives STR turnovers guest-ready staging and restock items', () => {
    const keys = checklistTemplateFor('str_turnover').map((i) => i.itemKey)
    expect(keys).toContain('beds')
    expect(keys).toContain('restock')
    expect(keys).toContain('staging')
  })

  it('gives deep and move-out extra detail items', () => {
    expect(checklistTemplateFor('deep').some((i) => i.itemKey === 'baseboards')).toBe(true)
    expect(checklistTemplateFor('move_in_out').some((i) => i.itemKey === 'buildup')).toBe(true)
  })

  it('keeps the base template for standard residential', () => {
    const keys = checklistTemplateFor('residential_standard').map((i) => i.itemKey)
    expect(keys).not.toContain('staging')
    expect(keys).toContain('walkthrough')
  })
})

describe('completion gating', () => {
  const template = checklistTemplateFor('residential_standard').map((t) => ({ required: t.required, status: 'pending' }))

  it('blocks completion while a required item is pending', () => {
    expect(allRequiredResolved(template)).toBe(false)
  })

  it('allows completion when every required item is complete or N/A', () => {
    const resolved = template.map((t, i) => ({ ...t, status: i % 2 ? 'complete' : 'not_applicable' }))
    expect(allRequiredResolved(resolved)).toBe(true)
  })

  it('ignores optional items for gating', () => {
    const items = [
      { required: true, status: 'complete' },
      { required: false, status: 'pending' },
    ]
    expect(allRequiredResolved(items)).toBe(true)
  })

  it('reports progress across complete and N/A', () => {
    const items = [{ status: 'complete' }, { status: 'not_applicable' }, { status: 'pending' }]
    expect(checklistProgress(items)).toEqual({ done: 2, total: 3 })
  })
})

describe('issue vocabulary', () => {
  it('validates categories and severities', () => {
    expect(isIssueCategory('leak_water')).toBe(true)
    expect(isIssueCategory('nope')).toBe(false)
    expect(isIssueSeverity('urgent')).toBe(true)
    expect(isIssueSeverity('critical')).toBe(false)
  })
  it('labels categories and severities', () => {
    expect(issueCategoryLabel('missing_item')).toBe('Missing item')
    expect(issueSeverityLabel('needs_attention')).toBe('Needs attention')
  })
})
