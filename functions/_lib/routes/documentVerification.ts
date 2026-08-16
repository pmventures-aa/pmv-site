import { Hono } from 'hono'
import type { AppEnv } from '../types'

export const documentVerificationRoutes = new Hono<AppEnv>()

function safeId(value: string) {
  return /^[A-Z0-9-]{8,40}$/.test(value)
}

documentVerificationRoutes.get('/public/verify/:publicId', async (c) => {
  const publicId = c.req.param('publicId').trim().toUpperCase()
  if (!safeId(publicId)) return c.json({ found: false }, 404)

  const row = await c.env.DB.prepare(`
    SELECT public_id, verification_status, document_label, issuer_name,
           completed_date, signer_count, final_pdf_sha256_prefix, sealed_at
    FROM verification_records
    WHERE public_id = ?
    LIMIT 1
  `).bind(publicId).first<{
    public_id:string
    verification_status:'valid'|'voided'|'revoked'|'unknown'
    document_label:string|null
    issuer_name:string
    completed_date:string|null
    signer_count:number
    final_pdf_sha256_prefix:string|null
    sealed_at:string|null
  }>()

  // Deliberately disclose only the verification record. Signer evidence,
  // client association, IP/device metadata and document contents stay private.
  if (!row) return c.json({ found: false }, 404)

  return c.json({
    found: true,
    status: row.verification_status,
    public_id: row.public_id,
    issuer_name: row.issuer_name,
    document_label: row.document_label,
    completed_date: row.completed_date,
    signer_count: row.signer_count,
    final_pdf_sha256_prefix: row.final_pdf_sha256_prefix,
    sealed_at: row.sealed_at,
  })
})

// Full-artifact hash verification (spec §8): the verifier computes SHA-256 of
// the downloaded file locally and submits it here. The server discloses the
// sealed full hash and chain head — never the document itself.
documentVerificationRoutes.post('/public/verify/hash', async (c) => {
  const body = await c.req.json<{ publicId?: string; sha256?: string }>().catch((): { publicId?: string; sha256?: string } => ({}))
  const publicId = String(body.publicId || '').trim().toUpperCase()
  const sha256 = String(body.sha256 || '').trim().toLowerCase()
  if (!safeId(publicId)) return c.json({ found: false }, 404)
  if (!/^[0-9a-f]{64}$/.test(sha256)) return c.json({ error: 'sha256 must be a 64-character hex digest' }, 400)

  const row = await c.env.DB.prepare(`
    SELECT vr.public_id, vr.verification_status, es.final_pdf_sha256, es.audit_pdf_sha256,
           es.manifest_sha256, es.event_chain_head_hash, es.signature_algorithm, es.public_key_id, es.sealed_at
    FROM verification_records vr
    JOIN envelope_seals es ON es.envelope_id = vr.envelope_id
    WHERE vr.public_id = ?
    LIMIT 1
  `).bind(publicId).first<{
    public_id: string
    verification_status: string
    final_pdf_sha256: string
    audit_pdf_sha256: string
    manifest_sha256: string
    event_chain_head_hash: string
    signature_algorithm: string
    public_key_id: string | null
    sealed_at: string
  }>()

  if (!row) return c.json({ found: false }, 404)
  if (row.verification_status !== 'valid') {
    return c.json({ found: true, status: row.verification_status, match: false, note: 'Verification record is not in a valid state.' })
  }

  const match = sha256 === row.final_pdf_sha256
  return c.json({
    found: true,
    status: row.verification_status,
    public_id: row.public_id,
    match,
    artifact: 'final_signed_pdf',
    expected_sha256: row.final_pdf_sha256,
    submitted_sha256: sha256,
    audit_certificate_sha256: row.audit_pdf_sha256,
    manifest_sha256: row.manifest_sha256,
    event_chain_head_hash: row.event_chain_head_hash,
    signature_algorithm: row.signature_algorithm,
    public_key_id: row.public_key_id,
    sealed_at: row.sealed_at,
  })
})
