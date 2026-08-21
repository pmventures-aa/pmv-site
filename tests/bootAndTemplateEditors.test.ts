import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Two production issues from 2026-08-21:
// 1. A hung boot /me request left the whole site as a blank navy page (the
//    loading screen never resolved). The auth check now races a watchdog.
// 2. Brand Studio templates and Notification Settings edited email bodies as
//    raw HTML textareas, unlike the rich Email Templates editor.
describe('auth boot watchdog', () => {
  const auth = read('../src/lib/auth.tsx')
  it('races the boot session check against a timeout and applies late results', () => {
    expect(auth).toContain('Promise.race')
    expect(auth).toContain('auth boot timed out')
    // A slow-but-valid session still lands after the fallback.
    expect(auth).toContain('if (timedOut)')
  })
})

describe('every email body editor is rich', () => {
  it('Brand Studio no longer edits email bodies at all', () => {
    // Its template editor was never wired to a send path, so it was removed
    // rather than kept in sync. Email copy is edited in HQ -> Email Templates,
    // covered by tests/templateConsolidation.test.ts.
    const studio = read('../src/pages/mail/BrandingStudio.tsx')
    expect(studio).not.toContain("tab==='templates'")
    expect(studio).toContain('Email Templates')
  })
  it('Notification Settings event emails use the rich composer', () => {
    const notif = read('../src/pages/admin/settings/NotificationSettings.tsx')
    expect(notif).toContain('RichTextComposer')
    expect(notif).not.toMatch(/textarea[^>]*body_html/)
  })
})
