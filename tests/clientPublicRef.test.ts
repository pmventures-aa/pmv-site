import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('opaque client workspace references', () => {
  const migration = readFileSync(new URL('../migrations/0071_client_public_refs.sql', import.meta.url), 'utf8')
  const helper = readFileSync(new URL('../functions/_lib/clientRef.ts', import.meta.url), 'utf8')
  const admin = readFileSync(new URL('../functions/_lib/routes/admin.ts', import.meta.url), 'utf8')
  const clients = readFileSync(new URL('../src/pages/admin/ClientsList.tsx', import.meta.url), 'utf8')
  const detail = readFileSync(new URL('../src/pages/admin/ClientDetailModern.tsx', import.meta.url), 'utf8')
  const uploads = readFileSync(new URL('../functions/_lib/routes/uploads.ts', import.meta.url), 'utf8')

  it('backfills and automatically creates random public refs for clients', () => {
    expect(migration).toContain('lower(hex(randomblob(16)))')
    expect(migration).toContain('trg_users_client_public_ref')
    expect(migration).toContain('trg_users_promoted_client_public_ref')
    expect(migration).not.toMatch(/SESSION_SECRET|session_token|password/i)
  })

  it('resolves refs to internal ids and returns neutral not-found for unauthorized lookup', () => {
    expect(helper).toContain('(public_ref = ? OR id = ?)')
    expect(helper).toContain('canAccessClient')
    expect(admin).toContain("loadStaffClientReference(c.env, user, c.req.param('id'))")
    expect(admin).toContain("return c.json({ error: 'not found' }, 404)")
  })

  it('uses public refs in visible client links while keeping internal ids for relational writes', () => {
    expect(clients).toContain('clients/${c.public_ref}/overview')
    expect(detail).toContain('clients/${account.public_ref}/${key}')
    expect(detail).toContain('clients/${publicRef}/${tab}')
    expect(detail).toContain('clientId={account.id}')
  })

  it('requires an authenticated, authorized session for avatar reads', () => {
    expect(uploads).toContain("uploadRoutes.get('/avatar/:userId',requireUser")
    expect(uploads).toContain("return c.json({error:'not found'},404)")
  })

  it('collapses operational record sets instead of rendering every table at once', () => {
    const manage = readFileSync(new URL('../src/pages/admin/ClientDetail.tsx', import.meta.url), 'utf8')
    expect(manage).toContain('Open only the record set you need')
    expect(manage).toContain("expanded ? 'Collapse' : 'Open'")
    expect(manage).toContain("label: 'Operations'")
  })
})
