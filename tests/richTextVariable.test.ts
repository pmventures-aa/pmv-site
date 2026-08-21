import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { VARIABLE_TOKEN_RE } from '../src/components/admin/richTextVariable'
import { extractTemplateTokens, isKnownEmailVariable } from '../shared/emailVariables'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const node = read('../src/components/admin/richTextVariable.tsx')
const composer = read('../src/components/admin/RichTextComposer.tsx')

// Variables used to be plain text: the insert menu emitted the characters
// "{{first_name}}" and nothing stopped someone backspacing into
// "{{first_nam}}". They are now atomic DecoratorNodes. The critical property
// is that this changed the EDITOR only, not the stored format.

describe('variable chips are atomic', () => {
  it('is a DecoratorNode, not text', () => {
    expect(node).toContain('extends DecoratorNode')
    expect(node).toContain("static getType(): string {\n    return 'pmvVariable'")
  })

  it('has no editable interior and selects as one unit', () => {
    // isIsolated keeps the caret from landing inside the chip, which is what
    // makes a half-deleted token impossible.
    expect(node).toContain('isIsolated(): true')
    expect(node).toContain('isKeyboardSelectable(): true')
    expect(node).toContain('isInline(): true')
    expect(node).toContain('contentEditable={false}')
  })

  it('is registered with the editor schema', () => {
    expect(composer).toContain('VariableNode,')
    expect(composer).toContain('<VariableChipPlugin />')
    expect(composer).toContain('registerVariableChips(editor)')
  })
})

describe('the stored format does not change', () => {
  it('exports the same {{key}} text the merge pipeline already consumes', () => {
    // A wrapper element here would put editor-only markup into every outbound
    // email and force a migration of saved templates.
    expect(node).toContain('document.createTextNode(`{{${this.__variableKey}}}`)')
    expect(node).not.toMatch(/exportDOM[\s\S]{0,400}createElement/)
  })

  it('reports the token as its text content, so plain-text export still works', () => {
    expect(node).toContain('getTextContent(): string')
    expect(node).toContain('return `{{${this.__variableKey}}}`')
  })

  it('rebuilds chips from text on every route content arrives by', () => {
    // A transform covers load, paste, and typing. A one-time pass on load
    // would miss the other two.
    expect(node).toContain('registerNodeTransform(TextNode')
  })
})

describe('token matching', () => {
  const match = (text: string) => VARIABLE_TOKEN_RE.exec(text)

  it('finds a plain token', () => {
    expect(match('Hi {{first_name}},')?.[1]).toBe('first_name')
  })

  it('tolerates the spacing people actually type', () => {
    expect(match('{{ first_name }}')?.[1]).toBe('first_name')
  })

  it('supports dotted keys', () => {
    expect(match('{{client.company}}')?.[1]).toBe('client.company')
  })

  it('ignores things that are not tokens', () => {
    expect(match('just some text')).toBeNull()
    expect(match('{{}}')).toBeNull()
    expect(match('{{ }}')).toBeNull()
    // A lone brace pair is not a token, so a stray brace cannot eat the line.
    expect(match('{first_name}')).toBeNull()
  })

  it('does not swallow a conditional block opener as a variable', () => {
    // {{#if company_name}} must stay text: the merge layer handles it, and
    // turning it into a chip would silently drop the conditional.
    expect(match('{{#if company_name}}')).toBeNull()
    expect(match('{{/if}}')).toBeNull()
    expect(match('{{#unless company_name}}')).toBeNull()
  })

  it('is not a global regex, so exec cannot be left mid-iteration', () => {
    // A shared /g regex keeps lastIndex between calls; this transform runs on
    // every text node, so a stateful regex would skip matches at random.
    expect(VARIABLE_TOKEN_RE.global).toBe(false)
  })

  it('agrees with the registry extractor on what a token is', () => {
    const body = 'Hi {{first_name}}, your {{service_type}} is set.'
    const found = extractTemplateTokens(body)
    expect(found).toContain('first_name')
    expect(found).toContain('service_type')
    for (const key of found) expect(VARIABLE_TOKEN_RE.test(`{{${key}}}`)).toBe(true)
  })
})

describe('unknown variables are visible as problems', () => {
  it('distinguishes registered variables from typos', () => {
    expect(isKnownEmailVariable('first_name')).toBe(true)
    expect(isKnownEmailVariable('frist_name')).toBe(false)
  })

  it('renders an unregistered variable in a warning style, not silently', () => {
    expect(node).toContain('isKnownEmailVariable(variableKey)')
    expect(node).toContain('will send as empty text')
    expect(node).toContain('variableChipUnknown')
  })

  it('shows the human label rather than the raw key', () => {
    expect(node).toContain('meta?.label ?? variableKey')
  })
})
