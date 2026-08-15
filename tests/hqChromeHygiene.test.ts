import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('HQ chrome hygiene', () => {
  const layout = readFileSync(new URL('../src/components/admin/AdminLayout.tsx', import.meta.url), 'utf8')
  const messages = readFileSync(new URL('../src/pages/admin/MessagesAdmin.tsx', import.meta.url), 'utf8')
  const settings = readFileSync(new URL('../src/pages/admin/SettingsAdmin.tsx', import.meta.url), 'utf8')
  const bell = readFileSync(new URL('../src/components/admin/NotificationBell.tsx', import.meta.url), 'utf8')
  const feed = readFileSync(new URL('../src/components/kit/NotificationFeedPanel.tsx', import.meta.url), 'utf8')

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
})
