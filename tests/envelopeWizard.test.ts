import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Stage 3a: a guided DocHub-style "send for signature" flow that orchestrates
// the existing envelope APIs behind four plain steps.
describe('new signature request wizard', () => {
  const wizard = read('../src/pages/admin/EnvelopeCreateWizard.tsx')
  const app = read('../src/pages/admin/AdminApp.tsx')
  const workspace = read('../src/pages/admin/EnvelopeWorkspaceEnterprise.tsx')

  it('is routed and reachable from the signed-documents workspace', () => {
    expect(app).toContain('const EnvelopeCreateWizard = lazy(')
    expect(app).toContain('path="envelopes/new"')
    expect(workspace).toContain("appPath('envelopes/new')")
    expect(workspace).toContain('New signature request')
  })

  it('walks upload -> signers -> place fields -> send through the real endpoints', () => {
    expect(wizard).toContain("api.upload<{ file: { id: string } }>('/admin/documents/upload'")
    expect(wizard).toContain("api.post<{ id: string }>('/admin/envelopes'")
    expect(wizard).toContain('/recipients`')
    expect(wizard).toContain('/fields`')
    expect(wizard).toContain('/send`')
  })

  it('reuses the shared click-to-place canvas rather than reinventing it', () => {
    expect(wizard).toContain('FieldPlacementCanvas')
    expect(wizard).toContain('onPlace={placeField}')
  })

  it('validates before sending: a signer email and at least one placed field', () => {
    expect(wizard).toContain('emailOk')
    expect(wizard).toContain('disabled={fields.length === 0}')
  })
})
