import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const nav = read('../src/components/layout/nav.ts')
const app = read('../src/pages/admin/AdminApp.tsx')
const page = read('../src/pages/admin/EmailTemplatesPage.tsx')
const studio = read('../src/pages/mail/BrandingStudio.tsx')

// Four places to edit email copy became two: email copy in HQ -> Email
// Templates, agreements and documents in Settings -> Templates. These pin the
// pieces of that which are easy to regress.

describe('email templates is a first-class destination', () => {
  it('has its own sidebar entry', () => {
    expect(nav).toContain("key:'email-templates'")
    expect(nav).toContain("to:'email-templates'")
  })

  it('has its own route, lazily loaded like the other workspaces', () => {
    expect(app).toContain("import('./EmailTemplatesPage')")
    expect(app).toContain('path="email-templates"')
  })

  it('reuses the same panel rather than forking a second editor', () => {
    // A copy would drift; the Messages tab and this route must stay identical.
    expect(page).toContain("import { EmailTemplatesPanel }")
  })

  it('stays reachable from Messages so existing links keep working', () => {
    const messages = read('../src/pages/admin/MessagesAdmin.tsx')
    expect(messages).toContain('EmailTemplatesPanel')
  })
})

describe('brand studio keeps brand only', () => {
  it('no longer offers a templates tab', () => {
    expect(studio).not.toContain("['templates','Templates']")
    expect(studio).not.toContain("tab==='templates'")
  })

  it('still offers brand and fonts', () => {
    expect(studio).toContain("['brand','Brand']")
    expect(studio).toContain("['fonts','Fonts']")
  })

  it('says where email copy went, rather than leaving a gap', () => {
    expect(studio).toContain('Email Templates')
  })

  it('does not delete any stored data', () => {
    // Removing an editor must not remove rows; nothing here sends anyway.
    expect(studio).not.toMatch(/DELETE FROM communication_templates/)
  })
})
