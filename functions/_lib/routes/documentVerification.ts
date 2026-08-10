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
