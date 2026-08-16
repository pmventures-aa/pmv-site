import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { totpAsync, totpHexKey, verifyTotp, generateTotpSecret, otpauthUri, hashRecoveryCode } from '../functions/_lib/totp'

// RFC 6238 Appendix B test vectors (SHA-1, 8 digits for the reference set).
// Our default is 6 digits, so we re-derive using the 6-digit variant of the
// same published values via the shared secret.
const RFC_SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('TOTP (RFC 6238)', () => {
  it('accepts the appendix B secret encoding', async () => {
    // "12345678901234567890" in ASCII, base32-encoded with standard alphabet.
    const secret = '12345678901234567890'
    const code8 = await totpAsync(RFC_SECRET_BASE32, 59, { digits: 8 })
    expect(code8).toBe('94287082')
    expect(secret.length).toBe(20)
  })

  it('matches published RFC 6238 vectors for the shared secret', async () => {
    const vectors: Array<[number, string]> = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ]
    for (const [t, expected8] of vectors) {
      const code8 = await totpAsync(RFC_SECRET_BASE32, t, { digits: 8 })
      expect(code8, `T=${t}`).toBe(expected8)
    }
  })

  it('supports SHA-256 and SHA-512 with the published vectors', async () => {
    // Known RFC 6238 appendix B quirk: the SHA-256/SHA-512 columns were
    // generated with the ASCII secret extended to 32 and 64 bytes
    // respectively (not the 20-byte base32-decoded key used by SHA-1).
    const enc = new TextEncoder()
    const hex = (s: string) => [...enc.encode(s)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const key32 = '12345678901234567890123456789012'
    const key64 = '1234567890123456789012345678901234567890123456789012345678901234'
    const sha256_8 = await totpHexKey(hex(key32), 59, { algorithm: 'SHA-256', digits: 8 })
    expect(sha256_8).toBe('46119246')
    const sha512_8 = await totpHexKey(hex(key64), 59, { algorithm: 'SHA-512', digits: 8 })
    expect(sha512_8).toBe('90693936')
    // Interop check against the SHA-1 column for the canonical 20-byte key.
    expect(await totpAsync(RFC_SECRET_BASE32, 59, { digits: 8 })).toBe('94287082')
  })

  it('verifies a 6-digit code within a small time window', async () => {
    const { secretBase32 } = generateTotpSecret()
    const t = Date.now() / 1000
    const code = await totpAsync(secretBase32, t)
    expect(await verifyTotp(secretBase32, code, t)).toBe(true)
    expect(await verifyTotp(secretBase32, '000000', t)).toBe(false)
  })

  it('generates a valid otpauth URI containing the secret', () => {
    const uri = otpauthUri('owner@pinnaclemanagementventures.com', 'Pinnacle Management Ventures', RFC_SECRET_BASE32)
    expect(uri.startsWith('otpauth://totp/')).toBe(true)
    expect(uri).toContain('secret=' + RFC_SECRET_BASE32)
    expect(uri).toContain('issuer=Pinnacle')
  })

  it('hashes recovery codes deterministically and non-reversibly', async () => {
    const a = await hashRecoveryCode('ABCDE-12345')
    const b = await hashRecoveryCode('ABCDE-12345')
    const c = await hashRecoveryCode('ABCDE-12346')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('consent policy + MFA migration (0078)', () => {
  it('defines consent policy, signing key, and MFA tables/columns', () => {
    const sql = readFileSync(new URL('../migrations/0078_document_evidence_foundation.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS consent_policies/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS consent_policy_versions/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS signer_consents/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS signing_keys/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS mfa_credentials/)
    expect(sql).toMatch(/ALTER TABLE document_files ADD COLUMN version_number INTEGER/)
    expect(sql).toMatch(/ALTER TABLE document_files ADD COLUMN is_authoritative INTEGER/)
    expect(sql).toMatch(/ALTER TABLE document_files ADD COLUMN is_executed INTEGER/)
    expect(sql).toMatch(/ALTER TABLE envelopes ADD COLUMN consent_policy_version_id TEXT/)
    expect(sql).toMatch(/execution_type TEXT NOT NULL DEFAULT 'E_SIGN'/)
  })

  it('backfills lineage semantics for existing document kinds', () => {
    const sql = readFileSync(new URL('../migrations/0078_document_evidence_foundation.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/UPDATE document_files SET version_number = 1/)
    expect(sql).toMatch(/is_authoritative = 1/)
    expect(sql).toMatch(/is_executed = 1/)
  })
})

describe('consent policies', () => {
  it('seeds and resolves a versioned standard policy', async () => {
    const { ensureConsentPolicy, latestConsentPolicyVersion, DEFAULT_ESIGN_DISCLOSURE } = await import('../functions/_lib/consentPolicies')
    const calls: string[] = []
    const DB = {
      prepare(sql: string) {
        calls.push(sql)
        const exec = () => ({ results: [] as any[] })
        const first = async () => null
        const run = async () => ({ success: true })
        return { bind: () => ({ all: exec, run, first }) }
      },
      batch: async () => [{ success: true }, { success: true }],
    } as any
    const env = { DB, SESSION_SECRET: 'x' } as any
    const { sha256Hex } = await import('../functions/_lib/documentSealing')
    const expectedSha = await sha256Hex(DEFAULT_ESIGN_DISCLOSURE)
    // ensureConsentPolicy against an empty DB writes policy + version rows.
    const seeded = await ensureConsentPolicy(env, 'standard')
    expect(seeded.version).toBe(1)
    expect(seeded.sha256).toBe(expectedSha)
    expect(seeded.bodyHtml).toBe(DEFAULT_ESIGN_DISCLOSURE)
    expect(calls.some((s) => /INSERT INTO consent_policies/.test(s))).toBe(true)
    expect(calls.some((s) => /INSERT INTO consent_policy_versions/.test(s))).toBe(true)
    const latest = await latestConsentPolicyVersion(env, 'standard')
    expect(latest).toBeNull()
  })
})