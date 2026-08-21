import { HQ_EMAIL_CATALOG } from '../../shared/hqEmailTemplates'

// Browsing 63+ templates.
//
// The panel already grouped by category and searched names. With the full
// catalog seeded that is not enough: the list is one long scroll, and the two
// questions people actually arrive with are "where is the email that says
// <phrase>" and "which of these have we actually changed". Both are answered
// here rather than in the component, so they are testable.

export interface FilterableTemplate {
  id: string
  slug: string
  name: string
  category: string
  description?: string | null
  subject: string
  preheader?: string | null
  title?: string | null
  body_html: string
  enabled: number
  is_system: number
}

export type StatusFilter = 'all' | 'customized' | 'shipped' | 'off'

// Shipped copy, by slug, for the edited/pristine comparison.
const CATALOG_BY_SLUG = new Map(HQ_EMAIL_CATALOG.map((t) => [t.slug, t]))

/** Collapse markup and entities so a search matches what a reader sees. */
export function searchableText(html: string): string {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Whether a template still matches the copy it shipped with.
 *
 * A custom template has no shipped counterpart, so it is never "edited": it
 * was authored, which is a different thing and is already shown as "Custom".
 * A system slug with no catalog entry is treated as pristine rather than
 * guessed at, so a catalog rename cannot mark everything edited overnight.
 */
export function isCustomized(row: FilterableTemplate): boolean {
  if (!row.is_system) return false
  const shipped = CATALOG_BY_SLUG.get(row.slug)
  if (!shipped) return false
  return (
    row.subject !== shipped.subject ||
    searchableText(row.body_html) !== searchableText(shipped.bodyHtml) ||
    (row.title || '') !== (shipped.title || '') ||
    (row.preheader || '') !== (shipped.preheader || '')
  )
}

/** Free-text match across everything a person might remember about an email. */
export function matchesQuery(row: FilterableTemplate, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    row.name,
    row.slug,
    row.description || '',
    row.subject,
    row.preheader || '',
    row.title || '',
    // Searching the body is the point: people remember a phrase, not a slug.
    searchableText(row.body_html),
  ].join(' ').toLowerCase()
  return q.split(/\s+/).every((term) => haystack.includes(term))
}

export function matchesStatus(row: FilterableTemplate, status: StatusFilter): boolean {
  if (status === 'all') return true
  if (status === 'off') return !row.enabled
  if (status === 'customized') return isCustomized(row)
  if (status === 'shipped') return !!row.is_system && !isCustomized(row)
  return true
}

export interface FilterState {
  query: string
  category: string | 'all'
  status: StatusFilter
}

export function filterTemplates<T extends FilterableTemplate>(rows: T[], state: FilterState): T[] {
  return rows.filter(
    (row) =>
      (state.category === 'all' || row.category === state.category) &&
      matchesStatus(row, state.status) &&
      matchesQuery(row, state.query),
  )
}

/**
 * Category counts for the filter chips.
 *
 * Counted after the query and status filters but before the category filter,
 * so a chip shows how many results choosing it would give rather than going
 * to zero the moment another chip is active.
 */
export function categoryCounts<T extends FilterableTemplate>(
  rows: T[],
  state: Omit<FilterState, 'category'>,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!matchesStatus(row, state.status) || !matchesQuery(row, state.query)) continue
    counts.set(row.category, (counts.get(row.category) || 0) + 1)
  }
  return counts
}

export function customizedCount<T extends FilterableTemplate>(rows: T[]): number {
  return rows.reduce((total, row) => total + (isCustomized(row) ? 1 : 0), 0)
}
