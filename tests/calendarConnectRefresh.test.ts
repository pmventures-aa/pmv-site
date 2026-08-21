import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const ui = read('../src/pages/admin/settings/CalendarSyncSettings.tsx')
const routes = read('../functions/_lib/routes/externalCalendar.ts')

// Consent happens in a different tab. The status card was fetched once on
// mount, so returning from Google left this tab rendering state captured
// before the grant existed: it said "Not connected" after a connection that
// had in fact succeeded, and only a manual page reload fixed it.

describe('returning from Google updates the card', () => {
  it('re-reads status when the tab is looked at again', () => {
    expect(ui).toContain("window.addEventListener('focus', recheck)")
    expect(ui).toContain("document.addEventListener('visibilitychange', recheck)")
  })

  it('only re-reads after a connect was actually started', () => {
    // Otherwise every tab switch refetches, on a page nobody is watching.
    expect(ui).toContain('awaitingConsent')
    expect(ui).toContain('if (!awaitingConsent.current) return')
  })

  it('ignores the hidden half of a visibility change', () => {
    // visibilitychange fires on the way out too; refetching then is pointless
    // and would clear the flag before the user ever came back.
    expect(ui).toContain("if (document.visibilityState === 'hidden') return")
  })

  it('removes both listeners on unmount', () => {
    expect(ui).toContain("window.removeEventListener('focus', recheck)")
    expect(ui).toContain("document.removeEventListener('visibilitychange', recheck)")
  })
})

describe('a blocked popup is not a dead button', () => {
  it('falls back to navigating this tab', () => {
    // Mobile browsers routinely refuse window.open, which made Connect look
    // like it did nothing at all.
    expect(ui).toContain('if (!popup) window.location.href = res.url')
  })

  it('clears the pending flag when the connect never started', () => {
    expect(ui).toMatch(/catch \(err\) \{\s*awaitingConsent\.current = false/)
  })
})

describe('there is always a manual way out', () => {
  it('offers a recheck next to Connect', () => {
    // If neither event fires, the user still has a control that does not
    // require them to know to reload the page.
    expect(ui).toContain('Recheck')
    expect(ui).toContain('onClick={() => { void load() }}')
  })
})

describe('the callback still records the grant', () => {
  it('writes the account active with encrypted tokens', () => {
    expect(routes).toContain("status = 'active'")
    expect(routes).toContain('await writeToken(c.env, tok.access_token)')
    expect(routes).toContain('last_error = NULL')
  })

  it('keeps an existing refresh token when Google omits one', () => {
    // Google only returns a refresh token on first consent; overwriting with
    // null on a re-consent would silently break the connection later.
    expect(routes).toContain('COALESCE(excluded.refresh_token_enc, calendar_provider_accounts.refresh_token_enc)')
  })
})
