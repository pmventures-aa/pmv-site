import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const page = read('../src/pages/public/AboutThisApp.tsx')
const router = read('../src/main.tsx')
const sitemap = read('../public/sitemap.xml')

// Google rejected verification twice over one mistake: the consent screen's
// home page pointed at Pinnacle HQ, which is a sign-in form. A login page is
// behind a login AND explains nothing, which is exactly the two failures that
// came back.

describe('the page a reviewer lands on is public', () => {
  it('is routed outside any protected wrapper', () => {
    expect(router).toContain('<Route path="/about-this-app" element={<AboutThisApp />} />')
    // Nothing about it may be gated: no auth guard, no role check, no redirect.
    expect(page).not.toMatch(/ProtectedRoute|requireUser|useAuth|Navigate/)
  })

  it('is discoverable rather than an orphan URL', () => {
    expect(sitemap).toContain('/about-this-app')
  })
})

describe('it explains the purpose of the app', () => {
  it('says what the software does before anything else', () => {
    expect(page).toContain('What the application does')
    expect(page).toContain('without creating an\n              account')
  })

  it('walks through the flow the scopes serve', () => {
    expect(page).toContain('How a booking works')
    expect(page).toContain('A visitor opens the booking page')
  })

  it('names both scopes by their full identifier', () => {
    // A reviewer matches the scopes on the consent screen against the page.
    expect(page).toContain('https://www.googleapis.com/auth/calendar.readonly')
    expect(page).toContain('https://www.googleapis.com/auth/calendar.events')
  })

  it('gives each scope a what and a why', () => {
    expect(page).toContain('What it accesses.')
    expect(page).toContain('Why it is needed.')
  })
})

describe('the data claims match the ones in the privacy policy', () => {
  const privacy = read('../src/pages/public/Privacy.tsx')

  it('affirms Limited Use in both places', () => {
    expect(page).toContain('Limited Use requirements')
    expect(privacy).toContain('Limited Use requirements')
  })

  it('states the same retention', () => {
    expect(page).toContain('at most two minutes')
    expect(privacy).toContain('no more than two minutes')
  })

  it('states the same removal behaviour', () => {
    // Both must agree, because a reviewer reads both and a contradiction
    // between them is worse than either page being vague.
    expect(page).toContain('revokes the grant with Google and deletes the stored tokens')
    expect(privacy).toContain('revokes the grant with Google and deletes the stored tokens')
  })

  it('links to the policy and terms it agrees with', () => {
    expect(page).toContain('to="/privacy"')
    expect(page).toContain('to="/terms"')
  })
})
