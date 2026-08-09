import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { uuid } from '../crypto'

const SESSION_TTL = 2 * 60 * 60
const MAX_BYTES = 20 * 1024 * 1024
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_DOCUMENT_TYPES = new Set(['government_id', 'professional_license', 'insurance', 'w9', 'supporting'])

type PendingFile = {
  id: string
  document_type: string
  object_key: string
  file_name: string
  content_type: string
  size_bytes: number
}

type UploadSession = { created_at: string; files: PendingFile[] }

function key(token: string) { return `vendor-upload:${token}` }
function safeName(value: string) { return (value || 'document').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 140) }

export const vendorApplicationUploadRoutes = new Hono<AppEnv>()

vendorApplicationUploadRoutes.post('/vendor-application/session', async (c) => {
  if (!c.env.UPLOADS) return c.json({ error: 'document uploads are temporarily unavailable' }, 503)
  const token = crypto.randomUUID()
  const session: UploadSession = { created_at: new Date().toISOString(), files: [] }
  await c.env.SESSIONS.put(key(token), JSON.stringify(session), { expirationTtl: SESSION_TTL })
  return c.json({ token, expires_in: SESSION_TTL }, 201)
})

vendorApplicationUploadRoutes.post('/vendor-application/session/:token/files/:documentType', async (c) => {
  if (!c.env.UPLOADS) return c.json({ error: 'document uploads are temporarily unavailable' }, 503)
  const token = c.req.param('token')
  const documentType = c.req.param('documentType')
  if (!ALLOWED_DOCUMENT_TYPES.has(documentType)) return c.json({ error: 'unsupported document type' }, 400)
  const raw = await c.env.SESSIONS.get(key(token))
  if (!raw) return c.json({ error: 'this upload session expired — refresh and try again' }, 410)
  const session = JSON.parse(raw) as UploadSession
  const contentType = (c.req.header('Content-Type') || '').split(';')[0].toLowerCase()
  if (!ALLOWED_TYPES.has(contentType)) return c.json({ error: 'upload a PDF, JPG, PNG, or WebP file' }, 415)
  const body = await c.req.arrayBuffer()
  if (!body.byteLength) return c.json({ error: 'empty file' }, 400)
  if (body.byteLength > MAX_BYTES) return c.json({ error: 'files must be 20 MB or smaller' }, 413)
  const fileName = safeName(c.req.header('X-File-Name') || 'document')
  const id = uuid()
  const objectKey = `vendor-applications/pending/${token}/${id}-${fileName}`
  await c.env.UPLOADS.put(objectKey, body, { httpMetadata: { contentType } })
  const file: PendingFile = { id, document_type: documentType, object_key: objectKey, file_name: fileName, content_type: contentType, size_bytes: body.byteLength }
  session.files.push(file)
  await c.env.SESSIONS.put(key(token), JSON.stringify(session), { expirationTtl: SESSION_TTL })
  return c.json({ file }, 201)
})

vendorApplicationUploadRoutes.delete('/vendor-application/session/:token/files/:fileId', async (c) => {
  if (!c.env.UPLOADS) return c.json({ error: 'document uploads are temporarily unavailable' }, 503)
  const token = c.req.param('token')
  const fileId = c.req.param('fileId')
  const raw = await c.env.SESSIONS.get(key(token))
  if (!raw) return c.json({ error: 'upload session expired' }, 410)
  const session = JSON.parse(raw) as UploadSession
  const file = session.files.find((item) => item.id === fileId)
  if (!file) return c.json({ error: 'file not found' }, 404)
  await c.env.UPLOADS.delete(file.object_key)
  session.files = session.files.filter((item) => item.id !== fileId)
  await c.env.SESSIONS.put(key(token), JSON.stringify(session), { expirationTtl: SESSION_TTL })
  return c.json({ ok: true })
})

vendorApplicationUploadRoutes.post('/vendor-application/session/:token/finalize', async (c) => {
  if (!c.env.UPLOADS) return c.json({ error: 'document uploads are temporarily unavailable' }, 503)
  const token = c.req.param('token')
  const raw = await c.env.SESSIONS.get(key(token))
  if (!raw) return c.json({ error: 'upload session expired' }, 410)
  const body = await c.req.json<{ email?: string }>().catch(() => ({}))
  const email = (body.email || '').trim().toLowerCase()
  if (!email) return c.json({ error: 'email required' }, 400)
  const user = await c.env.DB.prepare(`SELECT u.id FROM users u JOIN team_members tm ON tm.user_id = u.id WHERE lower(u.email) = ? AND tm.party_type = 'vendor' AND u.status = 'pending'`).bind(email).first<{ id: string }>()
  if (!user) return c.json({ error: 'pending provider application not found' }, 404)
  const session = JSON.parse(raw) as UploadSession
  for (const file of session.files) {
    const finalKey = `vendor-applications/${user.id}/${file.id}-${safeName(file.file_name)}`
    const object = await c.env.UPLOADS.get(file.object_key)
    if (!object) continue
    await c.env.UPLOADS.put(finalKey, object.body, { httpMetadata: { contentType: file.content_type } })
    await c.env.UPLOADS.delete(file.object_key)
    await c.env.DB.prepare(`INSERT INTO vendor_application_documents (id, user_id, document_type, object_key, file_name, content_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(file.id, user.id, file.document_type, finalKey, file.file_name, file.content_type, file.size_bytes).run()
  }
  await c.env.SESSIONS.delete(key(token))
  return c.json({ ok: true, uploaded: session.files.length })
})
