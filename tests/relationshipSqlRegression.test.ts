import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const relationshipSources = [
  'functions/_lib/routes/admin.ts',
  'functions/_lib/routes/auth.ts',
  'functions/_lib/routes/clientRelationships.ts',
]

describe('relationship graph SQL writes', () => {
  it('does not generate more VALUES than relationship_parties columns', () => {
    for (const path of relationshipSources) {
      const source = readFileSync(path, 'utf8')
      expect(source, path).not.toContain("VALUES (?,'person',?,?,?,?,?)")
      expect(source, path).not.toContain("VALUES (?,'business',?,?,?,?,?)")
    }
  })

  it('uses six bound values for fully parameterized relationship party inserts', () => {
    const source = readFileSync('functions/_lib/routes/clientRelationships.ts', 'utf8')
    expect(source).toContain('relationship_parties(id,party_type,display_name,email,phone,created_by_user_id) VALUES (?,?,?,?,?,?)')
  })
})
