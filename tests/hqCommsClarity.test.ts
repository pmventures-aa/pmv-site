import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('HQ communications clarity', () => {
  const email = read('../src/pages/admin/EmailThreadsPanel.tsx')
  const templates = read('../src/pages/admin/EmailTemplatesPanel.tsx')

  it('labels the HQ email tab as a shared inbox so it is clear who can see it', () => {
    expect(email).toContain('Shared inbox')
    expect(email).toContain('The whole HQ team can see and reply')
  })

  it('never lets the templates panel hang forever on "Loading" - it times out and offers retry', () => {
    expect(templates).toContain('setLoadFailed')
    expect(templates).toContain('Promise.race')
    expect(templates).toMatch(/timed out/i)
    expect(templates).toContain('Retry')
  })
})
