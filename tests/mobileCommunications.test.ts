import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('mobile communications workspace', () => {
  const templates = readFileSync(new URL('../src/pages/admin/EmailTemplatesPanel.tsx', import.meta.url), 'utf8')
  const threads = readFileSync(new URL('../src/pages/admin/EmailThreadsPanel.tsx', import.meta.url), 'utf8')
  const who = readFileSync(new URL('../src/components/kit/WhoSection.tsx', import.meta.url), 'utf8')
  const messages = readFileSync(new URL('../src/pages/admin/MessagesAdmin.tsx', import.meta.url), 'utf8')

  it('uses list-to-editor drill-in on narrow screens while retaining the desktop split', () => {
    expect(templates).toContain("mobileEditing ? 'hidden' : 'flex'")
    expect(templates).toContain("mobileEditing ? 'flex' : 'hidden'")
    expect(templates).toContain('lg:flex-row')
    expect(templates).toContain('lg:w-[280px]')
    expect(templates).toContain('<ChevronLeft size={16} /> Templates')
  })

  it('keeps template actions reachable through a horizontal mobile toolbar', () => {
    expect(templates).toContain('flex-nowrap items-center')
    expect(templates).toContain('overflow-x-auto')
    expect(templates).toContain('lg:flex-wrap')
    expect(templates).toContain("matchMedia('(max-width: 1023px)')")
  })

  it('removes duplicated message metadata on mobile but keeps desktop detail', () => {
    expect(threads).toContain('<div className=\"hidden md:block\">')
    expect(threads).toContain('messageWhoRows(m)')
    expect(threads).toContain('md:flex')
  })

  it('gives people chips the full mobile width and preserves desktop rows', () => {
    expect(who).toContain('flex-col items-stretch')
    expect(who).toContain('sm:flex-row')
    expect(who).toContain('hidden min-w-0 truncate text-slate-500 sm:inline')
    expect(who).toContain('hidden border-t')
  })

  it('uses one horizontally scrollable mobile channel bar', () => {
    expect(messages).toContain('flex-nowrap')
    expect(messages).toContain('overflow-x-auto')
    expect(messages).toContain('sm:flex-wrap')
  })
})
