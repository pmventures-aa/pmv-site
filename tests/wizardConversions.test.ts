import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

describe('shared wizard chrome', () => {
  const wizard = read('src/components/admin/wizard.tsx')

  it('renders a gold progress bar that animates with the step', () => {
    expect(wizard).toContain('WizardProgress')
    expect(wizard).toContain('bg-gold')
    expect(wizard).toContain('animate={{ width')
  })

  it('animates step transitions with AnimatePresence in wait mode', () => {
    expect(wizard).toContain('AnimatePresence mode="wait"')
    expect(wizard).toContain('initial={false}')
  })

  it('exposes an accessible error banner and Back/Continue footer', () => {
    expect(wizard).toContain('role="alert"')
    expect(wizard).toContain('WizardFooter')
  })
})

describe('CreateAssignment runs as a wizard', () => {
  const page = read('src/pages/admin/FieldWorkAdmin.tsx')

  it('uses the shared wizard chrome', () => {
    expect(page).toContain('WizardProgress')
    expect(page).toContain('WizardStep')
    expect(page).toContain('WizardFooter')
    expect(page).toContain('WizardError')
  })

  it('keeps the dispatch creation endpoints intact', () => {
    expect(page).toContain("api.post('/admin/field-assignments'")
    expect(page).toContain("'/admin/dispatch-providers'")
    expect(page).toContain("'/admin/account-users'")
  })

  it('validates each step before advancing (per-step validation)', () => {
    expect(page).toContain('function validateStep(')
    expect(page).toContain('Enter the service for this assignment.')
    expect(page).toContain('Choose a provider or add a new one.')
  })
})

describe('New user runs as a wizard', () => {
  const page = read('src/pages/admin/UsersAdmin.tsx')

  it('uses the shared wizard chrome', () => {
    expect(page).toContain('WizardProgress')
    expect(page).toContain('WizardStep')
    expect(page).toContain('WizardFooter')
  })

  it('splits account basics from the client business profile', () => {
    expect(page).toContain('New user')
    expect(page).toContain('Client business profile')
  })

  it('ends on a review step before creating the account', () => {
    expect(page).toContain('Review before creating')
    expect(page).toContain("api.post<{")
    expect(page).toContain("'/admin/account-users'")
  })
})
