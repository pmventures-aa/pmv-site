import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('HQ chrome hygiene', () => {
  const layout = readFileSync(new URL('../src/components/admin/AdminLayout.tsx', import.meta.url), 'utf8')
  const messages = readFileSync(new URL('../src/pages/admin/MessagesAdmin.tsx', import.meta.url), 'utf8')
  const settings = readFileSync(new URL('../src/pages/admin/SettingsAdmin.tsx', import.meta.url), 'utf8')
  const bell = readFileSync(new URL('../src/components/admin/NotificationBell.tsx', import.meta.url), 'utf8')
  const feed = readFileSync(new URL('../src/components/kit/NotificationFeedPanel.tsx', import.meta.url), 'utf8')
  const who = readFileSync(new URL('../src/components/admin/WhoMenu.tsx', import.meta.url), 'utf8')
  const hub = readFileSync(new URL('../src/pages/admin/CommunicationsHub.tsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/pages/admin/AdminApp.tsx', import.meta.url), 'utf8')
  const campaigns = readFileSync(new URL('../src/pages/admin/CommunicationsCRMAdmin.tsx', import.meta.url), 'utf8')

  it('keeps a single mail shortcut in the HQ header', () => {
    expect(layout).toContain('MailBell')
    expect(layout).not.toContain('EmailCenterBell')
    expect(layout).toContain('{!hideHqNav && <MailBell />}')
  })

  it('does not duplicate notification settings on Messages', () => {
    expect(messages).not.toMatch(/id: 'notifications'/)
    expect(messages).toContain("rawTab === 'notifications'")
    expect(messages).toContain('tab=notifications')
    expect(messages).toContain('Navigate')
    expect(settings).toContain("searchParams.get('tab')")
  })

  it('keeps one visible HQ notification bell and one settings destination', () => {
    expect(bell).toContain('return null')
    expect(feed).toContain('tab=notifications')
  })

  it('pins header popovers to the viewport so Messages overflow cannot clip them', () => {
    expect(feed).toContain('useFixedBelowAnchor')
    expect(feed).not.toContain('absolute right-0 top-11')
    expect(who).toContain('useFixedBelowAnchor')
  })

  it('keeps Campaigns as a Messages tab instead of a corner leftover', () => {
    expect(messages).toContain("id: 'campaigns'")
    expect(messages).toContain('CommunicationsCRMAdmin')
    expect(messages).not.toMatch(/ml-auto.*Campaigns/)
    expect(messages).not.toContain("p('communications/email')")
    expect(app).toContain('RedirectToCampaigns')
    expect(campaigns).toContain('embedded')
  })

  it('does not leave an Email Center jump on Pulse', () => {
    expect(hub).not.toContain('Email Center')
    expect(hub).not.toContain("p('communications/email')")
    expect(hub).toContain('tab=campaigns')
  })
})
