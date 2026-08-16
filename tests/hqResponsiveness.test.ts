import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

describe('mobile-enterprise.css helpers', () => {
  const css = read('src/mobile-enterprise.css')

  it('hides the scrollbar on horizontal action strips', () => {
    expect(css).toContain('.pmv-mobile-action-strip::-webkit-scrollbar { display: none; }')
    expect(css).toContain('.pmv-mobile-action-strip { scrollbar-width: none; }')
  })

  it('guards stacked mobile columns from spilling the viewport', () => {
    expect(css).toContain('.pmv-stack-mobile > * {')
    expect(css).toContain('min-width: 0')
    expect(css).toContain('max-width: 100%')
  })
})

describe('HQ loading states use skeletons', () => {
  it('FieldWorkAdmin shows a skeleton table while loading', () => {
    const page = read('src/pages/admin/FieldWorkAdmin.tsx')
    expect(page).toContain('SkeletonTable rows={5} cols={3}')
  })

  it('UsersAdmin shows a skeleton table while loading', () => {
    const page = read('src/pages/admin/UsersAdmin.tsx')
    expect(page).toContain('SkeletonTable rows={6} cols={4}')
  })

  it('FieldWorkVendor shows a skeleton table while loading the roster', () => {
    const page = read('src/pages/admin/FieldWorkVendor.tsx')
    expect(page).toContain('SkeletonTable rows={5} cols={2}')
  })

  it('ActivityAdmin shows a skeleton table while loading', () => {
    const page = read('src/pages/admin/ActivityAdmin.tsx')
    expect(page).toContain('SkeletonTable rows={6} cols={1}')
  })

  it('AdminDashboard lower panels use skeletons instead of Loading text', () => {
    const page = read('src/pages/admin/AdminDashboard.tsx')
    expect(page).toContain('<SkeletonTable rows={3} cols={1} />')
    expect(page).not.toContain('Loading…')
  })

  it('InvitationsAdmin shows a skeleton table while loading', () => {
    const page = read('src/pages/admin/InvitationsAdmin.tsx')
    expect(page).toContain('SkeletonTable rows={5} cols={4}')
    expect(page).not.toContain('Loading invitations…')
  })
})

describe('HQ empty states offer the next action', () => {
  it('FieldWorkAdmin empty state opens the create wizard', () => {
    const page = read('src/pages/admin/FieldWorkAdmin.tsx')
    expect(page).toContain("'Create your first assignment'")
    expect(page).toContain("'Create a RON session'")
    expect(page).toContain('onClick={() => setShowCreate(true)}')
  })

  it('UsersAdmin empty state opens the new-user form', () => {
    const page = read('src/pages/admin/UsersAdmin.tsx')
    expect(page).toContain('+ New user')
    expect(page).toContain('setShowForm(true)')
  })
})

describe('HQ filter rows scroll on mobile', () => {
  it('ActivityAdmin category filters use the scrollable action strip', () => {
    const page = read('src/pages/admin/ActivityAdmin.tsx')
    expect(page).toContain('pmv-mobile-action-strip')
  })

  it('InvitationsAdmin status filters use the scrollable action strip', () => {
    const page = read('src/pages/admin/InvitationsAdmin.tsx')
    expect(page).toContain('pmv-mobile-action-strip')
  })
})
