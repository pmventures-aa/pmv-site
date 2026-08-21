import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { resolveTemplateTokens, buildEmailPreviewVars } from '../shared/emailVariables'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('template token resolver', () => {
  it('substitutes known tokens and blanks the rest by default', () => {
    const out = resolveTemplateTokens('Hi {{first_name}}, welcome to {{company_name}}. {{mystery}}', {
      first_name: 'Cody', company_name: 'Pinnacle',
    })
    expect(out).toBe('Hi Cody, welcome to Pinnacle. ')
  })

  it('can keep unresolved tokens intact for an editor preview', () => {
    const out = resolveTemplateTokens('Owed: {{amount}}', {}, { keepUnknown: true })
    expect(out).toBe('Owed: {{amount}}')
  })

  it('tolerates spacing inside the braces and empty input', () => {
    expect(resolveTemplateTokens('{{ first_name }}', { first_name: 'Ada' })).toBe('Ada')
    expect(resolveTemplateTokens('', { a: 'b' })).toBe('')
    expect(resolveTemplateTokens(null, {})).toBe('')
  })

  it('resolves every registry token when handed the full sample set', () => {
    const vars = buildEmailPreviewVars()
    const out = resolveTemplateTokens('{{first_name}}|{{company_name}}|{{invoice_number}}', vars)
    expect(out).not.toContain('{{')
  })
})

describe('managed template editor wiring', () => {
  const editor = read('../src/pages/admin/settings/ManagedTemplatesSettings.tsx')
  const menu = read('../src/components/admin/VariableInsertMenu.tsx')

  it('offers an Insert variable menu and a resolved preview', () => {
    expect(editor).toContain('VariableInsertMenu')
    expect(editor).toContain('onInsert={(token) => insertToken(index, token)}')
    expect(editor).toContain('resolveTemplateTokens')
    expect(editor).toContain('Preview with sample values')
  })

  it('warns about unrecognized variables instead of silently shipping them', () => {
    expect(editor).toContain('Unrecognized variables')
    expect(editor).toContain('isKnownEmailVariable')
  })

  it('drives the variable menu from the shared registry', () => {
    expect(menu).toContain('emailVariablesByCategory')
    expect(menu).toContain('`{{${v.key}}}`')
  })
})
