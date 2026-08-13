import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('conversation create authorization', () => {
  it('rejects non-staff creators even though the route is mounted under /portal', () => {
    const source = readFileSync(new URL('../functions/_lib/routes/conversations.ts', import.meta.url), 'utf8')
    const postHandler = source.slice(source.indexOf("conversationRoutes.post('/conversations'"))
    expect(postHandler).toContain('if (!isStaffLike(user.role)) return c.json({ error: \'forbidden\' }, 403)')
  })
})
