import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseWhoAddresses, uniqueWhoPeople, visibleWhoRows, whoAddress, whoDisplayName } from '../src/lib/who'

describe('who helpers', () => {
  it('formats a named address', () => {
    expect(whoAddress({ name: 'Ada', email: 'ada@x.com' })).toBe('Ada <ada@x.com>')
    expect(whoDisplayName({ email: 'ada@x.com' })).toBe('ada@x.com')
  })

  it('parses JSON address lists and quoted name forms', () => {
    expect(parseWhoAddresses('[{"email":"ada@x.com","name":"Ada"}]')).toEqual([{ email: 'ada@x.com', name: 'Ada' }])
    expect(parseWhoAddresses('Ada Client <ada@x.com>, other@x.com')).toEqual([
      { email: 'ada@x.com', name: 'Ada Client' },
      { email: 'other@x.com', name: null },
    ])
  })

  it('dedupes people by email or user id', () => {
    const people = uniqueWhoPeople([
      { email: 'Ada@x.com', name: null, role: 'Client' },
      { email: 'ada@x.com', name: 'Ada', userId: 'c1' },
    ])
    expect(people).toHaveLength(1)
    expect(people[0].name).toBe('Ada')
    expect(people[0].userId).toBe('c1')
    expect(people[0].role).toBe('Client')
  })

  it('hides empty who rows', () => {
    expect(visibleWhoRows([
      { label: 'From', people: [{ name: 'Ada', email: 'ada@x.com' }] },
      { label: 'Cc', people: [] },
      { label: 'Sent', text: '  ' },
    ])).toHaveLength(1)
  })
})

describe('Messages hub who coverage', () => {
  const files = {
    layout: readFileSync(new URL('../src/components/admin/AdminLayout.tsx', import.meta.url), 'utf8'),
    messages: readFileSync(new URL('../src/pages/admin/MessagesAdmin.tsx', import.meta.url), 'utf8'),
    email: readFileSync(new URL('../src/pages/admin/EmailThreadsPanel.tsx', import.meta.url), 'utf8'),
    inbox: readFileSync(new URL('../src/components/kit/ThreadView.tsx', import.meta.url), 'utf8'),
    staff: readFileSync(new URL('../src/pages/admin/ConversationsPanel.tsx', import.meta.url), 'utf8'),
    templates: readFileSync(new URL('../src/pages/admin/EmailTemplatesPanel.tsx', import.meta.url), 'utf8'),
    campaigns: readFileSync(new URL('../src/pages/admin/CommunicationsCRMAdmin.tsx', import.meta.url), 'utf8'),
  }

  it('keeps a signed-in who control on the Communications chrome when HQ nav is hidden', () => {
    expect(files.layout).toContain('WhoMenu')
    expect(files.layout).toContain('hideHqNav')
  })

  it('puts a Who section on every Messages subtab', () => {
    expect(files.messages).toContain('SessionWho')
    expect(files.email).toContain('WhoSection')
    expect(files.inbox).toContain('WhoSection')
    expect(files.staff).toContain('WhoSection')
    expect(files.templates).toContain('SessionWho')
    expect(files.campaigns).toContain('SessionWho')
  })
})
