import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// The post-signup journey (welcome letter + 14-day client discovery sequence)
// was fully live but had no single control surface in HQ. These lock in the
// hub page and its wiring so it stays discoverable.
describe('signup journey hub', () => {
  const page = read('../src/pages/admin/JourneyAutomation.tsx')
  const nav = read('../src/components/layout/nav.ts')
  const app = read('../src/pages/admin/AdminApp.tsx')
  const migration = read('../migrations/0038_relationship_automation.sql')

  it('is an owner-only HQ page reachable at signup-journey', () => {
    expect(nav).toContain("key:'signup-journey'")
    expect(app).toContain('path="signup-journey"')
    // Owner-gated exactly like automation-center: force-shown to owners, hidden
    // from non-owner admins.
    expect(app).toContain("visible.add('signup-journey')")
    expect(app).toContain("item.key!=='signup-journey'")
  })

  it('reflects the live system by reading the real template + automation + enrollment endpoints', () => {
    expect(page).toContain('/admin/email-templates')
    expect(page).toContain('/admin/automation-center')
    expect(page).toContain('/admin/nurture-campaign')
    // Surfaces the immediate welcome letter and the nurture steps.
    expect(page).toContain('account_welcome_client')
    expect(page).toContain('client_nurture')
  })

  it('lets the owner pause/resume and run the journey without leaving the page', () => {
    expect(page).toContain('/admin/automation-center/${NURTURE_KEY}')
    expect(page).toContain('/admin/automation-center/${NURTURE_KEY}/run')
  })

  it('documents that enrollment is automatic at the database level (a trigger, not app code)', () => {
    // This is why every new client already flows through the journey - the hub
    // is a control surface over a live system, not a new pipeline.
    expect(migration).toContain('CREATE TRIGGER IF NOT EXISTS trg_client_nurture_enroll')
    expect(migration).toContain("WHEN NEW.role = 'client'")
  })
})
