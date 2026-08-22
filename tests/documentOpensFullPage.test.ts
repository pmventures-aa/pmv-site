import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Opening a document used to wedge the canvas into a minmax(0,1fr) column
// between a 260px library rail and a 330px inspector. A US Letter page is 8.5in
// = 816px at 96dpi, so the letterhead clipped mid-word and the editor pane
// scrolled sideways. A document is the thing you came to read; it gets the
// window.

const center = readFileSync(new URL('../src/pages/admin/DocumentCenter.tsx', import.meta.url), 'utf8')
const fullPage = readFileSync(new URL('../src/pages/admin/DocumentFullPage.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/pages/admin/AdminApp.tsx', import.meta.url), 'utf8')

describe('selecting a document opens it full page', () => {
  it('navigates rather than selecting into a column', () => {
    expect(center).toContain('const openFullPage=useCallback((id:string)=>{navigate(p(`document-center/${id}`))}')
  })

  it('routes both the list and the rail through it', () => {
    expect(center).toContain('<DocumentLibrary rows={rows} loading={loading}')
    expect(center).toContain('onSelect={openFullPage}')
    expect(center).not.toContain('onSelect={setSelected}')
  })

  it('has a full page route to land on', () => {
    expect(app).toContain('<Route path="document-center/:id" element={<DocumentFullPage/>}/>')
  })

  it('gives the canvas the whole width when it gets there', () => {
    expect(fullPage).toContain('<DocumentCanvas')
    expect(fullPage).toContain('fullPage />')
  })
})

// This is the exact moment the problem was reported: create a letterhead, and
// land inside a pane too narrow to show it.
describe('creating a document lands you inside it', () => {
  it.each([
    ['a blank text document', "toast.success('Document created');await load();openFullPage(r.id)"],
    ['a quick-create template', 'created - start writing`);await load();openFullPage(r.id)'],
    ['an upload', "toast.success('Document uploaded');await load();openFullPage(d.id)"],
  ])('%s opens full page', (_label, snippet) => {
    expect(center).toContain(snippet)
  })

  it('no create path selects into the narrow column any more', () => {
    expect(center).not.toContain('setSelected(r.id)')
    expect(center).not.toContain('setSelected(d.id)')
  })
})
