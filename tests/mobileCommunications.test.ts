import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('mobile communications workspace', () => {
  const templates = readFileSync(new URL('../src/pages/admin/EmailTemplatesPanel.tsx', import.meta.url), 'utf8')
  const threads = readFileSync(new URL('../src/pages/admin/EmailThreadsPanel.tsx', import.meta.url), 'utf8')
  const who = readFileSync(new URL('../src/components/kit/WhoSection.tsx', import.meta.url), 'utf8')
  const messages = readFileSync(new URL('../src/pages/admin/MessagesAdmin.tsx', import.meta.url), 'utf8')
  const emailCenter = readFileSync(new URL('../src/pages/admin/CommunicationsCRMAdmin.tsx', import.meta.url), 'utf8')
  const composer = readFileSync(new URL('../src/components/admin/RichTextComposer.tsx', import.meta.url), 'utf8')
  const composePane = readFileSync(new URL('../src/pages/admin/EmailComposePane.tsx', import.meta.url), 'utf8')
  const clientThread = readFileSync(new URL('../src/components/kit/ThreadView.tsx', import.meta.url), 'utf8')
  const staffDm = readFileSync(new URL('../src/pages/admin/ConversationsPanel.tsx', import.meta.url), 'utf8')
  const pulse = readFileSync(new URL('../src/pages/admin/CommunicationsHub.tsx', import.meta.url), 'utf8')

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

  it('fits the Email Center compose dialog within the mobile viewport', () => {
    expect(emailCenter).toContain('max-h-[calc(100dvh-1rem)]')
    expect(emailCenter).toContain('overflow-x-hidden')
    expect(emailCenter).toContain('sm:max-h-[78vh]')
    expect(emailCenter).toContain('sm:!w-auto')
    expect(emailCenter).toContain('sm:min-w-[180px]')
  })

  it('uses a one-row scrolling formatting toolbar only on narrow screens', () => {
    expect(composer).toContain('flex-nowrap')
    expect(composer).toContain('overflow-x-auto')
    expect(composer).toContain('sm:flex-wrap')
    expect(composer).toContain('px-4 py-5')
    expect(composer).toContain('sm:px-8')
  })

  it('stacks compose selectors below primary actions on mobile', () => {
    expect(composePane).toContain('order-3')
    expect(composePane).toContain('lg:order-none')
    expect(composePane).toContain('w-[3.25rem]')
    expect(composePane).toContain('sm:w-[4.5rem]')
  })

  it('lands on communication lists before opening a mobile detail', () => {
    expect(messages).toContain("matchMedia('(max-width: 767px)')")
    expect(threads).toContain("matchMedia('(max-width: 767px)')")
    expect(staffDm).toContain("matchMedia('(max-width: 767px)')")
  })

  it('keeps secure-message and staff-DM composers reachable above safe areas', () => {
    expect(clientThread).toContain('sticky bottom-0')
    expect(clientThread).toContain('env(safe-area-inset-bottom)')
    expect(clientThread).toContain('pb-24')
    expect(staffDm).toContain('sticky bottom-0')
    expect(staffDm).toContain('env(safe-area-inset-bottom)')
  })

  it('turns Email Center into mobile folder, list, and detail drill-in', () => {
    expect(emailCenter).toContain("selectedId ? 'hidden' : 'flex'")
    expect(emailCenter).toContain("selectedId ? 'flex' : 'hidden'")
    expect(emailCenter).toContain('xl:grid-cols-[220px_360px_minmax(0,1fr)]')
    expect(emailCenter).toContain('Back to email list')
    expect(emailCenter).toContain('xl:hidden')
    expect(emailCenter).toContain('hidden overflow-x-auto rounded-md border border-white/10 xl:block')
  })

  it('splits Pulse into mobile Overview and Reporting views', () => {
    expect(messages).toContain("section === 'overview'")
    expect(messages).toContain("section === 'reporting'")
    expect(messages).toContain('lg:hidden')
    expect(pulse).toContain('min-w-[480px]')
    expect(pulse).toContain('sm:min-w-0')
  })

  it('keeps template controls and preview compact on mobile', () => {
    expect(templates).toContain('h-[50dvh]')
    expect(templates).toContain('lg:h-[720px]')
    expect(templates).toContain('sm:w-[5.2rem]')
  })
})
