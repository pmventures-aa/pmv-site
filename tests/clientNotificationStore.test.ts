import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const client = read('../functions/_lib/clientNotifications.ts')
const staff = read('../functions/_lib/email.ts')
const seed = read('../functions/_lib/hqEmailTemplates.ts')
const migration = read('../migrations/0098_consultation_booking_rebuild.sql')

// Client notifications used to read ONLY notification_template_overrides while
// staff notifications read hq_email_templates first. That split is why editing
// notification copy needed a browser-side dual-write across two tables. These
// guard the unification and the trap it exposed.

describe('one store for notification copy', () => {
  it('client notifications read the same hq template staff notifications do', () => {
    expect(client).toContain('renderHqEmailBySlug(env, `notify_${input.eventKey}`')
    expect(staff).toContain('renderHqEmailBySlug(env, `notify_${kind}`')
  })

  it('keeps the override table as a fallback rather than deleting the path', () => {
    // An event that has not been seeded yet must still send.
    expect(client).toContain('FROM notification_template_overrides')
    const hqIndex = client.indexOf('renderHqEmailBySlug')
    const overrideIndex = client.indexOf('FROM notification_template_overrides')
    expect(hqIndex).toBeGreaterThan(-1)
    expect(overrideIndex).toBeGreaterThan(hqIndex)
  })

  it('treats a disabled template as do-not-send, matching the staff path', () => {
    expect(client).toContain('stored?.skipped')
    expect(staff).toContain('stored?.skipped')
  })

  it('falls through instead of dropping the message when rendering throws', () => {
    expect(client).toContain('[client-notification] hq template render failed')
  })
})

describe('the eyebrow trap', () => {
  it('seeds client events with client wording, not staff wording', () => {
    // notify_* rows predate driving client mail, so every one carried
    // "Pinnacle HQ notification". Sending that to a client reads as internal
    // mail leaking out.
    expect(seed).toContain("event.audience === 'client' ? 'Your Pinnacle relationship' : 'Pinnacle HQ notification'")
  })

  it('selects audience so the seed can branch on it', () => {
    expect(seed).toContain('event_key, label, category, description, audience')
  })

  it('corrects rows already seeded with the staff eyebrow', () => {
    expect(migration).toContain("SET eyebrow = 'Your Pinnacle relationship'")
    expect(migration).toContain("audience = 'client'")
  })

  it('leaves an already-edited eyebrow alone', () => {
    // Only rows still carrying the exact seeded default are rewritten.
    expect(migration).toContain("AND eyebrow = 'Pinnacle HQ notification'")
  })

  it('escapes the underscore so the slug match is not a wildcard', () => {
    // notify_% without an escape would also match notifyXfoo.
    expect(migration).toContain("LIKE 'notify\\_%' ESCAPE '\\'")
  })
})
