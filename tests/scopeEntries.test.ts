import { describe, expect, it } from 'vitest'
import { GUIDE_ENTRIES, resolveScopeEntry, SERVICE_ENTRIES, visibleQuestions } from '../shared/scopeEntries'
import { services } from '../src/data/services'

const PUBLISHED_GUIDES = [
  'switching-pos-payment-providers',
  'moving-data-between-systems',
  'managing-business-transition',
  'ongoing-administrative-support',
  'property-cleaning-turnover',
  'local-support-south-florida',
  'eviction-turnover-support',
]

describe('entry-aware scope requests', () => {
  it('maps the moving-data project URL to a data questionnaire instead of the generic picker', () => {
    const entry = resolveScopeEntry({
      guide: 'moving-data-between-systems',
      source: 'project-moving-data-between-systems',
    })
    expect(entry).not.toBeNull()
    expect(entry?.id).toBe('moving-data-between-systems')
    expect(entry?.job).toBe('pos_payments')
    expect(entry?.remoteDefault).toBe(true)
    expect(entry?.questions.map((q) => q.key)).toEqual([
      'source_system',
      'destination_system',
      'record_types',
      'exports_ready',
      'must_not_break',
    ])
    expect(entry?.pickerLabel.toLowerCase()).toContain('data')
  })

  it('resolves the same entry from source when guide is missing', () => {
    const entry = resolveScopeEntry({ source: 'project-moving-data-between-systems' })
    expect(entry?.id).toBe('moving-data-between-systems')
  })

  it('preselects add-capacity for ongoing administrative support', () => {
    const entry = resolveScopeEntry({ guide: 'ongoing-administrative-support' })
    expect(entry?.job).toBe('business_operations')
    expect(entry?.pickerLabel).toBe('Add capacity to the business')
    expect(entry?.questions.some((q) => q.key === 'need_type')).toBe(true)
  })

  it('covers every published project guide', () => {
    for (const slug of PUBLISHED_GUIDES) {
      expect(GUIDE_ENTRIES[slug], `missing guide entry for ${slug}`).toBeTruthy()
      expect(resolveScopeEntry({ guide: slug })?.id).toBe(slug)
    }
  })

  it('covers every public service page with a custom questionnaire', () => {
    for (const service of services) {
      const entry = resolveScopeEntry({ entry: service.slug, service: service.key })
      expect(entry, `missing service entry for ${service.slug}`).toBeTruthy()
      expect(entry?.questions.length).toBeGreaterThan(0)
    }
  })

  it('maps service slugs used on public pages', () => {
    expect(SERVICE_ENTRIES['field-photos-bpo']?.questions.some((q) => q.key === 'photo_set')).toBe(true)
    expect(SERVICE_ENTRIES['eviction-support']?.job).toBe('eviction_reo')
    expect(resolveScopeEntry({ offering: 'pos-terminal-swap' })?.job).toBe('pos_payments')
    expect(resolveScopeEntry({ offering: 'field-exterior-light' })?.job).toBe('property_inspection')
  })

  it('shows inspection photo follow-ups only after a photo-related type is chosen', () => {
    const entry = resolveScopeEntry({ job: 'property_inspection' })
    expect(entry).not.toBeNull()
    const before = visibleQuestions(entry!.questions, {}, 'onsite').map((q) => q.key)
    expect(before).toContain('inspection_type')
    expect(before).not.toContain('photo_set')
    const after = visibleQuestions(entry!.questions, { inspection_type: 'Field photos / BPO' }, 'onsite').map((q) => q.key)
    expect(after).toContain('photo_set')
    expect(after).toContain('platform')
    const remote = visibleQuestions(entry!.questions, {}, 'remote').map((q) => q.key)
    expect(remote).not.toContain('access')
  })

  it('reveals notary and courier questions from the document kind selection', () => {
    const entry = resolveScopeEntry({ job: 'documents_notary' })
    const base = visibleQuestions(entry!.questions, {}, 'onsite').map((q) => q.key)
    expect(base).toContain('document_kind')
    expect(base).not.toContain('pickup')
    const courier = visibleQuestions(entry!.questions, { document_kind: ['Courier / delivery'] }, 'onsite').map((q) => q.key)
    expect(courier).toContain('pickup')
    expect(courier).toContain('dropoff')
    const notary = visibleQuestions(entry!.questions, { document_kind: ['Mobile notary'] }, 'remote').map((q) => q.key)
    expect(notary).toContain('notary_kind')
    expect(notary).not.toContain('meeting_location')
  })
})
