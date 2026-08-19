import type { Env } from './types'
import { uuid } from './crypto'
import { safeUploadName } from './fileValidation'
import { renderVendorApplicationPdf } from './vendorApplicationPdf'
import { ensureProviderCode } from './providerCode'

// The branded provider-application PDF is stored as a vendor_application_documents
// row of this type so it rides the existing profile document list + download route.
export const VENDOR_APPLICATION_SUMMARY_TYPE = 'application_summary'

async function setting(env: Env, key: string, fallback: string): Promise<string> {
  try {
    const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?').bind(key).first<{ value: string | null }>()
    return row?.value || fallback
  } catch { return fallback }
}

// Load the crest for the PDF letterhead. Tries the request origin first, then
// falls back to the canonical public host, so generation still gets the logo
// even when it runs on a subdomain that doesn't serve the static asset.
async function tryLogo(requestUrl: string | null): Promise<ArrayBuffer | null> {
  const candidates: string[] = []
  if (requestUrl) {
    try { candidates.push(new URL('/logo-crest.png', requestUrl).toString()) } catch { /* ignore */ }
  }
  candidates.push('https://www.pinnaclemanagementventures.com/logo-crest.png')
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit)
      if (res.ok) return await res.arrayBuffer()
    } catch { /* try next candidate */ }
  }
  return null
}

interface ProviderRow { id: string; email: string; full_name: string | null; phone: string | null; vendor_category: string | null; display_name: string | null }

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
      `SELECT u.id, u.email, u.full_name, u.phone, tm.vendor_category, tm.display_name
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
      `SELECT document_type, file_name, object_key, content_type FROM vendor_application_documents
        WHERE user_id = ? AND document_type != ? ORDER BY created_at`,
    ).bind(userId, VENDOR_APPLICATION_SUMMARY_TYPE).all<{ document_type: string; file_name: string | null; object_key: string; content_type: string | null }>()
    const docRows = docs.results ?? []

    const [contactLine, logoBytes, providerCode] = await Promise.all([
      setting(env, 'service_application_contact_line', 'Pinnacle Management Ventures | pinnaclemanagementventures.com'),
      tryLogo(requestUrl),
      ensureProviderCode(env, userId),
    ])

    // Pull the actual file bytes so the renderer can append each upload onto
    // the end of the record. Best-effort per file — a missing object just
    // means that attachment is listed but not embedded.
    const attachments = (await Promise.all(docRows.map(async (d) => {
      try {
        const object = await env.UPLOADS!.get(d.object_key)
        if (!object) return null
        return { fileName: d.file_name, contentType: d.content_type, bytes: await object.arrayBuffer() }
      } catch { return null }
    }))).filter((a): a is { fileName: string | null; contentType: string | null; bytes: ArrayBuffer } => a !== null)

    const pdfBytes = await renderVendorApplicationPdf({
      userId,
      providerCode,
      submittedAt: profile.submitted_at,
      provider: {
        name: provider.full_name || provider.email,
        displayName: provider.display_name,
        email: provider.email,
        phone: provider.phone,
        companyName: null,
        vendorCategory: provider.vendor_category,
      },
      application,
      documents: docRows.map((d) => ({ document_type: d.document_type, file_name: d.file_name })),
      attachments,
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
