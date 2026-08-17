import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Source-shape tests for the derived document-title hook. Running the
// hook needs a Router harness; instead pin the contract that matters:
// longest-prefix matching, home-item exact matching, and that both
// shells actually mount the hook so every HQ/portal page gets a title.

describe('useNavDocumentTitle', () => {
  const source = readFileSync(new URL('../src/lib/useNavDocumentTitle.ts', import.meta.url), 'utf8')

  it('prefers the longest matching prefix so nested routes resolve to their section', () => {
    expect(source).toContain('target.length > best.length')
    expect(source).toMatch(/pathname === target \|\| pathname\.startsWith\(`\$\{target\}\/`\)/)
  })

  it('home item (to === empty) only matches the exact workspace root', () => {
    expect(source).toMatch(/if \(item\.to === ''\)/)
  })

  it('falls back to the bare suffix when no nav item matches', () => {
    expect(source).toContain('document.title = best ? `${best.label} · ${suffix}` : suffix')
  })
})

describe('shells mount the derived title', () => {
  it('AdminLayout titles as Pinnacle HQ', () => {
    const source = readFileSync(new URL('../src/components/admin/AdminLayout.tsx', import.meta.url), 'utf8')
    expect(source).toContain("useNavDocumentTitle(nav, 'Pinnacle HQ')")
  })

  it('portal Shell titles as Pinnacle Portal', () => {
    const source = readFileSync(new URL('../src/components/layout/Shell.tsx', import.meta.url), 'utf8')
    expect(source).toContain("useNavDocumentTitle(nav, 'Pinnacle Portal')")
  })
})
