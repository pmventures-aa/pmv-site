import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Stage 3b: the signer-side experience gets DocHub's hallmark - adopt your
// signature once, then one-tap "sign here" on every signature/initials field,
// rendered in a signature script instead of a plain text box.
describe('signer experience (stage 3b)', () => {
  const src = readFileSync(new URL('../src/pages/public/SignerExperience.tsx', import.meta.url), 'utf8')

  it('offers adopt-a-signature with an apply-to-all shortcut', () => {
    expect(src).toContain('function AdoptCard')
    expect(src).toContain('Adopt your signature')
    expect(src).toContain('applyAllAdopted')
    expect(src).toContain('Apply to all')
  })

  it('signature and initials fields become one-tap once adopted', () => {
    expect(src).toContain('Tap to sign here')
    // Initials derive from the adopted name automatically.
    expect(src).toContain("field.field_type==='initial'?adopted.initials:adopted.name")
  })

  it('renders adopted and completed signatures in a script face', () => {
    expect(src).toContain('SIG_FONT')
    expect(src).toMatch(/Segoe Script/)
  })

  it('keeps the manual typed path so a signer can still sign without adopting', () => {
    expect(src).toContain('Type your full legal signature')
    // The pre-existing verification, consent, and completion flow is untouched.
    expect(src).toContain('function VerificationPanel')
    expect(src).toContain('function ConsentPanel')
    expect(src).toContain('Complete & Submit')
  })
})
