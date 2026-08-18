import type { Env } from './types'
import { uuid } from './crypto'
import { safeUploadName } from './fileValidation'
import { renderVendorApplicationPdf } from './vendorApplicationPdf'

// The branded provider-application PDF is stored as a vendor_application_documents
// row of this type so it rides the existing profile document list + download route.
export const VENDOR_APPLICATION_SUMMARY_TYPE = 'application_summary'

async function setting(env: Env, key: string, fallback: string): Promise<string> {
  try {
    const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?').bind(key).first<{ value: string | null }>()
    return row?.value || fallback
  } catch { return fallback }
}

async function tryLogo(requestUrl: string | null): Promise<ArrayBuffer | null> {
  if (!requestUrl) return null
  try {
    const url = new URL('/logo-crest.png', requestUrl)
    const res = await fetch(url.toString(), { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit)
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch { return null }
}

interface ProviderRow { id: string; email: string; full_name: string | null; phone: string | null; vendor_category: string | null }

// Generate the branded application PDF for a provider from their persisted
// answers, store it in R2, and (re)attach it to the profile as the single
// application_summary document. Best-effort: returns null instead of throwing
// so it can never block signup/finalize. Returns the new document id on success.
export async function generateVendorApplicationPdf(
  env: Env,
  userId: string,
  requestUrl: string | null,
): Promise<string | null> {
  if (!env.UPLOADS) return null
  try {
    const provider = await env.DB.prepare(
      `SELECT u.id, u.email, u.full_name, u.phone, tm.vendor_category
         FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id
        WHERE u.id = ?`,
    ).bind(userId).first<ProviderRow>()
    if (!provider) return null

    const profile = await env.DB.prepare(
      'SELECT application_json, submitted_at FROM vendor_application_profiles WHERE user_id = ?',
    ).bind(userId).first<{ application_json: string; submitted_at: string }>()
    if (!profile) return null
    let application: Record<string, unknown> = {}
    try { application = JSON.parse(profile.application_json) as Record<string, unknown> } catch { application = {} }

    // Uploaded verification docs, excluding any prior generated summary.
    const docs = await env.DB.prepare(
      `SELECT document_type, file_name FROM vendor_application_documents
        WHERE user_id = ? AND document_type != ? ORDER BY created_at`,
    ).bind(userId, VENDOR_APPLICATION_SUMMARY_TYPE).all<{ document_type: string; file_name: string | null }>()

    const [contactLine, logoBytes] = await Promise.all([
      setting(env, 'service_application_contact_line', 'Pinnacle Management Ventures | pinnaclemanagementventures.com'),
      tryLogo(requestUrl),
    ])

    const pdfBytes = await renderVendorApplicationPdf({
      userId,
      submittedAt: profile.submitted_at,
      provider: {
        name: provider.full_name || provider.email,
        email: provider.email,
        phone: provider.phone,
        companyName: null,
        vendorCategory: provider.vendor_category,
      },
      application,
      documents: docs.results ?? [],
      contactLine,
      logoBytes,
    })

    // Replace any prior generated summary so there is exactly one on file.
    const prior = await env.DB.prepare(
      'SELECT id, object_key FROM vendor_application_documents WHERE user_id = ? AND document_type = ?',
    ).bind(userId, VENDOR_APPLICATION_SUMMARY_TYPE).all<{ id: string; object_key: string }>()
    for (const row of prior.results ?? []) {
      try { await env.UPLOADS.delete(row.object_key) } catch { /* best-effort */ }
      await env.DB.prepare('DELETE FROM vendor_application_documents WHERE id = ?').bind(row.id).run()
    }

    const id = uuid()
    const fileName = `Provider Application - ${safeUploadName(provider.full_name || provider.email, 'provider')}.pdf`
    const objectKey = `vendor-applications/${userId}/${id}-application-summary.pdf`
    await env.UPLOADS.put(objectKey, pdfBytes, { httpMetadata: { contentType: 'application/pdf' }, customMetadata: { generated: 'vendor-application-summary' } })
    await env.DB.prepare(
      `INSERT INTO vendor_application_documents(id,user_id,document_type,object_key,file_name,content_type,size_bytes)
       VALUES (?,?,?,?,?,?,?)`,
    ).bind(id, userId, VENDOR_APPLICATION_SUMMARY_TYPE, objectKey, fileName, 'application/pdf', pdfBytes.byteLength).run()
    return id
  } catch (err) {
    console.error('[vendor-application] summary PDF generation failed', err)
    return null
  }
}
