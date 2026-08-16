import type { Env } from './types'
import { uuid } from './crypto'
import { sha256Hex } from './documentSealing'

// Versioned consent policies (master spec §9). A generic checkbox is never
// presented as satisfying a federal consumer E-SIGN disclosure scenario; the
// consumer_esign category exists for flows that require 15 U.S.C. §7001(c)
// treatment and must be wired to a policy reviewed for that purpose.

export const DEFAULT_ESIGN_DISCLOSURE = `
<h2>Electronic Records and Signatures Disclosure</h2>
<p>Pinnacle Management Ventures ("Pinnacle") may provide records and disclosures to
you electronically. You agree to receive electronic records and to use an
electronic signature in this transaction, instead of paper documents and
signatures, under the Pinnacle electronic signature policy in effect at the time
you sign.</p>
<ul>
<li>You may request a paper copy of any record at any time by contacting
support@pinnaclemanagementventures.com.</li>
<li>You may withdraw this consent at any time, subject to the terms of the
transaction. Withdrawal may affect your ability to complete the transaction.</li>
<li>To access and retain electronic records you need a device with a current
browser, internet access, and the ability to open PDF files and retain or print
them.</li>
<li>If your contact information changes, update it with Pinnacle so records can
still reach you.</li>
</ul>
<p>By selecting "Continue" you confirm that you can access electronic records in
this format and that you agree to use electronic records and signatures for this
transaction.</p>
`

export async function ensureConsentPolicy(env: Env, category: 'standard' | 'consumer_esign'): Promise<{ policyId: string; versionId: string; version: number; sha256: string; bodyHtml: string }> {
  const name = category === 'consumer_esign' ? 'Consumer E-SIGN Disclosure Consent' : 'Pinnacle Standard E-Sign Consent'
  const body = DEFAULT_ESIGN_DISCLOSURE
  const sha256 = await sha256Hex(body)
  const existing = await env.DB.prepare(`SELECT cp.id, cpv.id version_id, cpv.version FROM consent_policies cp JOIN consent_policy_versions cpv ON cpv.consent_policy_id = cp.id WHERE cp.category = ? AND cp.status = 'active' ORDER BY cpv.version DESC LIMIT 1`).bind(category).first<{ id: string; version_id: string; version: number }>()
  if (existing) {
    if (existing.version >= 1) return { policyId: existing.id, versionId: existing.version_id, version: existing.version, sha256, bodyHtml: body }
    return { policyId: existing.id, versionId: existing.version_id, version: existing.version, sha256, bodyHtml: body }
  }
  const policyId = uuid()
  const versionId = uuid()
  const now = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO consent_policies (id,name,category,status,created_at) VALUES (?,?,?, 'active', ?)`).bind(policyId, name, category, now),
    env.DB.prepare(`INSERT INTO consent_policy_versions (id,consent_policy_id,version,body_html,effective_at,sha256,created_at) VALUES (?,?,1,?,?,?,?)`).bind(versionId, policyId, body, now, sha256, now),
  ])
  return { policyId, versionId, version: 1, sha256, bodyHtml: body }
}

export async function latestConsentPolicyVersion(env: Env, category: 'standard' | 'consumer_esign' = 'standard'): Promise<{ policyId: string; versionId: string; version: number; sha256: string; bodyHtml: string } | null> {
  const row = await env.DB.prepare(`SELECT cp.id policy_id, cpv.id version_id, cpv.version, cpv.body_html, cpv.sha256 FROM consent_policies cp JOIN consent_policy_versions cpv ON cpv.consent_policy_id = cp.id WHERE cp.category = ? AND cp.status = 'active' ORDER BY cpv.version DESC LIMIT 1`).bind(category).first<{ policy_id: string; version_id: string; version: number; body_html: string; sha256: string }>()
  if (!row) return null
  return { policyId: row.policy_id, versionId: row.version_id, version: row.version, sha256: row.sha256, bodyHtml: row.body_html }
}

export async function recordSignerConsent(env: Env, recipientId: string, consentPolicyVersionId: string, sessionId: string | null, ipAddress: string | null): Promise<void> {
  await env.DB.prepare(`INSERT INTO signer_consents (id,recipient_id,consent_policy_version_id,accepted_at,session_id,ip_address) VALUES (?,?,?,?,?,?)
    ON CONFLICT(recipient_id) DO UPDATE SET consent_policy_version_id=excluded.consent_policy_version_id,accepted_at=excluded.accepted_at,session_id=excluded.session_id,ip_address=excluded.ip_address`)
    .bind(uuid(), recipientId, consentPolicyVersionId, new Date().toISOString(), sessionId, ipAddress).run()
}

export async function consentForEnvelope(env: Env, envelopeId: string): Promise<Array<{ recipient_id: string; policy_name: string; category: string; version: number; body_sha256: string; accepted_at: string }>> {
  const rows = await env.DB.prepare(`SELECT sc.recipient_id, cp.name policy_name, cp.category, cpv.version, cpv.sha256 body_sha256, sc.accepted_at
    FROM signer_consents sc
    JOIN consent_policy_versions cpv ON cpv.id = sc.consent_policy_version_id
    JOIN consent_policies cp ON cp.id = cpv.consent_policy_id
    JOIN envelope_recipients r ON r.id = sc.recipient_id
    WHERE r.envelope_id = ? ORDER BY sc.accepted_at`).bind(envelopeId).all() as { results?: Array<{ recipient_id: string; policy_name: string; category: string; version: number; body_sha256: string; accepted_at: string }> }
  return rows.results || []
}