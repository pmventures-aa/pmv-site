import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('envelope template document remapping', () => {
  it('stores document_sort_order and remaps fields onto new documents', () => {
    const source = readFileSync(resolve('functions/_lib/routes/documentPlatformV2.ts'), 'utf8')
    expect(source).toContain('document_sort_order')
    expect(source).toContain('docSortById')
    expect(source).toContain('mappedDocId=docMap.get(Number(f.document_sort_order||1))')
    expect(source).not.toMatch(/f\.envelope_document_id\|\|docMap/)
  })
})
