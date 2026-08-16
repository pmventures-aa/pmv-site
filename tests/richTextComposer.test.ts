import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

describe('RichTextComposer is Lexical-based', () => {
  const composer = read('src/components/admin/RichTextComposer.tsx')

  it('is built on Lexical instead of execCommand contentEditable', () => {
    expect(composer).toContain("from '@lexical/react/LexicalComposer'")
    expect(composer).toContain('<LexicalComposer')
    expect(composer).toContain('<RichTextPlugin')
    expect(composer).not.toContain("document.execCommand")
  })

  it('keeps the public API and callers untouched', () => {
    expect(composer).toMatch(/value: string/)
    expect(composer).toMatch(/onChange: \(html: string\) => void/)
    expect(composer).toMatch(/onUploadImage\?: \(file: File\) => Promise<string>/)
    expect(composer).toMatch(/surface\?: 'hq' \| 'letter'/)
    expect(composer).toMatch(/footer\?: ReactNode/)
  })

  it('adds the optional initialHTML, collaborationRoom, and onAIRequest props', () => {
    expect(composer).toMatch(/initialHTML\?: string/)
    expect(composer).toMatch(/collaborationRoom\?: string/)
    expect(composer).toMatch(/onAIRequest\?: \(selection: string, action: AIAction\) => Promise<string>/)
  })

  it('debounces onChange to 120ms and flushes on blur', () => {
    expect(composer).toContain('setTimeout(flush, 120)')
    expect(composer).toContain("onBlur={() => syncHandle.current.flush?.()}")
  })

  it('emits the default HTML shape via $generateHtmlFromNodes', () => {
    expect(composer).toContain('$generateHtmlFromNodes(editor)')
    expect(composer).toContain('$generateNodesFromDOM(editor, dom)')
  })
})

describe('RichTextComposer feature set', () => {
  const composer = read('src/components/admin/RichTextComposer.tsx')

  it('shows a live word and character count', () => {
    expect(composer).toContain('function WordCount')
    expect(composer).toContain('count.words')
    expect(composer).toContain('count.chars')
  })

  it('supports find and replace', () => {
    expect(composer).toContain('function findNext()')
    expect(composer).toContain('function replaceOne()')
    expect(composer).toContain('function replaceAll()')
    expect(composer).toContain('Replace all')
  })

  it('supports markdown shortcuts', () => {
    expect(composer).toContain('<MarkdownShortcutPlugin')
  })

  it('supports tables with cell merging', () => {
    expect(composer).toContain('<TablePlugin')
    expect(composer).toContain('INSERT_TABLE_COMMAND')
    expect(composer).toContain('$mergeCells')
  })

  it('keeps image upload working through the editor', () => {
    expect(composer).toContain('onUploadImage(file)')
    expect(composer).toContain('$createPmvImageNode({ src: url, altText: file.name })')
  })

  it('exposes AI assist for the selected text', () => {
    expect(composer).toContain('onAIRequest(selected, action)')
    expect(composer).toContain("'rewrite' | 'shorten' | 'expand'")
  })

  it('wires optional real-time collaboration', () => {
    expect(composer).toContain('<CollaborationPlugin')
    expect(composer).toContain('new WebrtcProvider')
    expect(composer).toContain('new IndexeddbPersistence')
  })
})

describe('editor image node round-trips HTML', () => {
  const image = read('src/components/admin/richTextImage.tsx')

  it('exports to an img element so emails keep images', () => {
    expect(image).toContain("exportDOM()")
    expect(image).toContain("document.createElement('img')")
  })

  it('imports img tags back into the editor', () => {
    expect(image).toContain('static importDOM()')
    expect(image).toContain('img.src')
  })
})

describe('existing callers keep working', () => {
  it('EmailComposePane still passes the original props', () => {
    const page = read('src/pages/admin/EmailComposePane.tsx')
    expect(page).toContain('<RichTextComposer')
    expect(page).toContain('surface="letter"')
    expect(page).toContain('value={draft.html}')
    expect(page).toContain('onChange={(html) => onChange({ ...draft, html })}')
  })

  it('EmailTemplatesPanel still passes the original props', () => {
    const page = read('src/pages/admin/EmailTemplatesPanel.tsx')
    expect(page).toContain('surface="letter"')
    expect(page).toContain('onUploadImage={uploadImage}')
    expect(page).toContain('value={draft.body_html}')
  })

  it('CommunicationsCRMAdmin still passes the original props', () => {
    const page = read('src/pages/admin/CommunicationsCRMAdmin.tsx')
    expect(page).toContain('<RichTextComposer value={bodyHtml} onChange={setBodyHtml} onUploadImage={uploadImage}')
  })
})
