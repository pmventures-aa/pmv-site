import { describe, expect, it } from 'vitest'
import { HQ_EMAIL_CATALOG } from '../shared/hqEmailTemplates'
import {
  categoryCounts,
  customizedCount,
  filterTemplates,
  isCustomized,
  matchesQuery,
  matchesStatus,
  searchableText,
  type FilterableTemplate,
} from '../src/lib/templateFilter'

// Browsing the seeded catalog is the case these exist for: 63+ rows in one
// list, where the two real questions are "where is the email that says
// <phrase>" and "which have we actually changed".

const shipped = HQ_EMAIL_CATALOG[0]

function row(over: Partial<FilterableTemplate> = {}): FilterableTemplate {
  return {
    id: 'row-1',
    slug: shipped.slug,
    name: shipped.name,
    category: shipped.category,
    description: shipped.description,
    subject: shipped.subject,
    preheader: shipped.preheader,
    title: shipped.title,
    body_html: shipped.bodyHtml,
    enabled: 1,
    is_system: 1,
    ...over,
  }
}

describe('searchable text', () => {
  it('strips markup so a search matches what a reader sees', () => {
    expect(searchableText('<p style="margin:0 0 18px">Hi <strong>there</strong></p>')).toBe('Hi there')
  })

  it('decodes the entities that appear in stored bodies', () => {
    expect(searchableText('<p>Tom&nbsp;&amp;&nbsp;Jerry</p>')).toBe('Tom & Jerry')
  })

  it('survives empty and malformed input', () => {
    expect(searchableText('')).toBe('')
    expect(searchableText('<p>unclosed')).toBe('unclosed')
  })
})

describe('search', () => {
  it('finds a template by a phrase in its body, not just its name', () => {
    const target = row({ body_html: '<p>You will wait briefly in the waiting room.</p>' })
    expect(matchesQuery(target, 'waiting room')).toBe(true)
  })

  it('matches on slug, subject, and description too', () => {
    expect(matchesQuery(row(), shipped.slug)).toBe(true)
    expect(matchesQuery(row({ subject: 'Your invoice is ready' }), 'invoice')).toBe(true)
    expect(matchesQuery(row({ description: 'Sent when a quote expires' }), 'expires')).toBe(true)
  })

  it('requires every term, so extra words narrow rather than widen', () => {
    const target = row({ name: 'Welcome email', body_html: '<p>Portal access</p>' })
    expect(matchesQuery(target, 'welcome portal')).toBe(true)
    expect(matchesQuery(target, 'welcome invoice')).toBe(false)
  })

  it('ignores case and surrounding whitespace', () => {
    expect(matchesQuery(row({ name: 'Welcome' }), '  WELCOME  ')).toBe(true)
  })

  it('matches everything when the query is empty', () => {
    expect(matchesQuery(row(), '')).toBe(true)
  })
})

describe('customized detection', () => {
  it('treats an untouched system template as shipped', () => {
    expect(isCustomized(row())).toBe(false)
  })

  it('notices an edited subject', () => {
    expect(isCustomized(row({ subject: 'Something else entirely' }))).toBe(true)
  })

  it('notices edited body copy', () => {
    expect(isCustomized(row({ body_html: '<p>Completely rewritten.</p>' }))).toBe(true)
  })

  it('ignores markup-only differences that read identically', () => {
    // Re-saving through the editor can change tags and spacing without
    // changing a word. That is not an edit worth flagging.
    const reserialized = row({ body_html: shipped.bodyHtml.replace(/style="[^"]*"/g, '') })
    expect(isCustomized(reserialized)).toBe(false)
  })

  it('never calls a custom template edited', () => {
    // It was authored, not edited, and is already labelled Custom.
    expect(isCustomized(row({ is_system: 0, subject: 'anything' }))).toBe(false)
  })

  it('treats an unknown system slug as pristine rather than guessing', () => {
    expect(isCustomized(row({ slug: 'slug_that_is_not_in_the_catalog' }))).toBe(false)
  })

  it('counts customized rows across a list', () => {
    expect(customizedCount([row(), row({ subject: 'changed' }), row({ is_system: 0 })])).toBe(1)
  })
})

describe('status filter', () => {
  it('separates shipped, customized, and off', () => {
    const pristine = row()
    const edited = row({ subject: 'changed' })
    const disabled = row({ enabled: 0 })
    expect(matchesStatus(pristine, 'shipped')).toBe(true)
    expect(matchesStatus(pristine, 'customized')).toBe(false)
    expect(matchesStatus(edited, 'customized')).toBe(true)
    expect(matchesStatus(edited, 'shipped')).toBe(false)
    expect(matchesStatus(disabled, 'off')).toBe(true)
    expect(matchesStatus(pristine, 'off')).toBe(false)
  })

  it('passes everything on all', () => {
    expect(matchesStatus(row({ enabled: 0, subject: 'x' }), 'all')).toBe(true)
  })
})

describe('combined filtering', () => {
  const rows = [
    row({ id: 'a', category: 'account', name: 'Welcome' }),
    // Pristine: overriding the subject here would make it customized too.
    row({ id: 'b', category: 'billing', name: 'Invoice ready' }),
    row({ id: 'c', category: 'billing', name: 'Invoice overdue', subject: 'changed', body_html: '<p>Past due.</p>' }),
  ]

  it('applies category, status, and query together', () => {
    expect(filterTemplates(rows, { category: 'billing', status: 'all', query: '' }).map((r) => r.id)).toEqual(['b', 'c'])
    expect(filterTemplates(rows, { category: 'billing', status: 'customized', query: '' }).map((r) => r.id)).toEqual(['c'])
    expect(filterTemplates(rows, { category: 'all', status: 'all', query: 'past due' }).map((r) => r.id)).toEqual(['c'])
  })

  it('returns nothing when filters genuinely exclude everything', () => {
    expect(filterTemplates(rows, { category: 'account', status: 'customized', query: '' })).toEqual([])
  })

  it('counts categories ignoring the active category, so chips stay useful', () => {
    // Chips must show what picking them would yield, not collapse to zero
    // because another chip is currently selected.
    const counts = categoryCounts(rows, { status: 'all', query: '' })
    expect(counts.get('billing')).toBe(2)
    expect(counts.get('account')).toBe(1)
  })

  it('reflects the query in the category counts', () => {
    const counts = categoryCounts(rows, { status: 'all', query: 'past due' })
    expect(counts.get('billing')).toBe(1)
    expect(counts.get('account')).toBeUndefined()
  })
})
