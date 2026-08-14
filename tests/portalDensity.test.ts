import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('client portal density', () => {
  const ui = readFileSync(new URL('../src/components/ui.tsx', import.meta.url), 'utf8')
  const shell = readFileSync(new URL('../src/components/layout/Shell.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  const welcome = readFileSync(new URL('../src/components/DashboardWelcome.tsx', import.meta.url), 'utf8')
  const dashboard = readFileSync(new URL('../src/pages/portal/Dashboard.tsx', import.meta.url), 'utf8')
  const billing = readFileSync(new URL('../src/pages/portal/Billing.tsx', import.meta.url), 'utf8')

  it('scopes compact chrome to the client shell', () => {
    expect(shell).toContain('portal-app')
    expect(shell).toContain('w-56')
    expect(shell).toContain('lg:px-6 lg:py-5')
    expect(css).toContain('.portal-app .btn')
    expect(css).toContain('.portal-app .pmv-form-control')
  })

  it('keeps shared portal cards and badges square and tight', () => {
    expect(ui).toContain('rounded-md border border-white/10 bg-navy-900/70 p-4')
    expect(ui).toContain('rounded-sm border px-1.5 py-0.5 text-[11px]')
    expect(ui).toContain('text-xl font-semibold text-white')
    expect(ui).not.toMatch(/EmptyState[\s\S]*BrandMark3D/)
  })

  it('compacts the portal welcome and home without pill chrome', () => {
    expect(welcome).toContain("variant === 'portal'")
    expect(welcome).toContain('rounded-md border border-white/10')
    expect(welcome).toContain('h-10 w-[60px]')
    expect(dashboard).not.toContain('rounded-2xl')
    expect(dashboard).not.toContain('rounded-full')
    expect(dashboard).toContain('rounded-md border border-gold/20')
  })

  it('keeps billing as a list, not a lecture or hover-lift card', () => {
    expect(billing).not.toContain('hover:-translate-y')
    expect(billing).not.toContain('How payment works')
    expect(billing).toContain('billingCompliance.noCardStorage')
    expect(billing).toContain('rounded-sm border border-white/10')
  })
})
