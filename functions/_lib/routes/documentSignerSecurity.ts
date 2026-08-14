import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { uuid } from '../crypto'
import { sealEnvelope, sha256Hex } from '../documentSealing'
import { escapeHtml, sendEmail } from '../email'
import { appendEnvelopeEventFromContext } from '../envelopeEvents'

export const documentSignerSecurityRoutes = new Hono<AppEnv>()
const now = () => new Date().toISOString()
const token = () => {
  const a = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function signerSession(c: any) {
  const raw = c.req.header('x-signing-session') || ''
  const v = await c.env.SESSIONS.get(`sign:${raw}`)
  return v ? JSON.parse(v) : null
}

async function invite(env: any, envelope: any, r: any) {
  const raw = token()
  const hash = await sha256Hex(raw)
  const exp = new Date(Date.now() + 7 * 86400000).toISOString()
  await env.DB.prepare(`UPDATE envelope_recipients SET invitation_token_hash=?,invitation_expires_at=?,last_invited_at=?,status='invited',updated_at=? WHERE id=?`).bind(hash, exp, now(), now(), r.id).run()
  await sendEmail(env, {
    to: r.email,
    subject: `Signature requested: ${envelope.title}`,
    html: `<p>${escapeHtml(r.name)},</p><p>Your turn in the signing order is ready.</p><p><a href="https://www.pinnaclemanagementventures.com/sign/${encodeURIComponent(raw)}">Review and sign securely</a></p>`,
  })
}

documentSignerSecurityRoutes.post('/sign/:token/consent', async (c) => {
  const ses = await signerSession(c)
  if (!ses) return c.json({ error: 'authentication required' }, 401)
  const recipient = await c.env.DB.prepare('SELECT * FROM envelope_recipients WHERE id = ? AND envelope_id = ?')
    .bind(ses.recipient_id, ses.envelope_id).first<any>()
  if (!recipient) return c.json({ error: 'recipient not found' }, 404)
  const body = await c.req.json<{ accepted?: boolean }>().catch(() => ({ accepted: false }))
  if (!body.accepted) return c.json({ error: 'electronic signature consent is required' }, 400)

  await appendEnvelopeEventFromContext(c, {
    envelopeId: ses.envelope_id,
    eventType: 'consent.esign_accepted',
    actorType: 'signer',
    actorId: ses.recipient_id,
    recipientId: ses.recipient_id,
    metadata: { method: 'esign_disclosure' },
  })
  await appendEnvelopeEventFromContext(c, {
    envelopeId: ses.envelope_id,
    eventType: 'location.reported',
    actorType: 'signer',
    actorId: ses.recipient_id,
    recipientId: ses.recipient_id,
    metadata: { source: 'request_headers' },
  })
  return c.json({ ok: true })
})

documentSignerSecurityRoutes.post('/sign/:token/complete', async (c) => {
  const ses = await signerSession(c)
  if (!ses) return c.json({ error: 'authentication required' }, 401)
  const recipient = await c.env.DB.prepare('SELECT * FROM envelope_recipients WHERE id=? AND envelope_id=?').bind(ses.recipient_id, ses.envelope_id).first() as any
  if (!recipient) return c.json({ error: 'recipient not found' }, 404)
  if (recipient.access_revoked_at || recipient.status === 'expired') return c.json({ error: 'access revoked' }, 410)
  if (recipient.status === 'completed') return c.json({ ok: true, already_completed: true })

  const consent = await c.env.DB.prepare(`SELECT id FROM envelope_events WHERE envelope_id = ? AND recipient_id = ? AND event_type = 'consent.esign_accepted' LIMIT 1`)
    .bind(ses.envelope_id, ses.recipient_id).first()
  if (!consent) return c.json({ error: 'electronic signature consent is required before submitting' }, 400)

  const env = await c.env.DB.prepare('SELECT * FROM envelopes WHERE id=?').bind(ses.envelope_id).first() as any
  if (!env) return c.json({ error: 'envelope not found' }, 404)
  if (['voided', 'expired', 'declined'].includes(env.status)) return c.json({ error: `envelope ${env.status}` }, 410)
  if (env.expires_at && env.expires_at < now()) return c.json({ error: 'envelope expired' }, 410)

  const fields = await c.env.DB.prepare('SELECT id,required,completed_at,condition_json FROM document_fields WHERE recipient_id=?').bind(ses.recipient_id).all() as any
  const values = await c.env.DB.prepare('SELECT id,value_text FROM document_fields WHERE envelope_id=?').bind(ses.envelope_id).all() as any
  const map = new Map((values.results || []).map((f: any) => [String(f.id), String(f.value_text || '')]))
  for (const f of fields.results || []) {
    let active = true
    try {
      const condition = f.condition_json ? JSON.parse(f.condition_json) : null
      if (condition?.field_id && condition.equals !== undefined) active = map.get(String(condition.field_id)) === String(condition.equals)
    } catch { /* ignore */ }
    if (active && Number(f.required) === 1 && !f.completed_at) return c.json({ error: 'Complete all active required fields before submitting.' }, 400)
  }

  const stamp = now()
  await c.env.DB.prepare(`UPDATE envelope_recipients SET status='completed',completed_at=?,invitation_token_hash=NULL,invitation_expires_at=NULL,updated_at=? WHERE id=?`).bind(stamp, stamp, ses.recipient_id).run()
  await appendEnvelopeEventFromContext(c, {
    envelopeId: ses.envelope_id,
    eventType: 'recipient.completed',
    actorType: 'signer',
    actorId: ses.recipient_id,
    recipientId: ses.recipient_id,
    metadata: { secure_completion_gate: true, conditional_validation: true },
  })

  const remaining = await c.env.DB.prepare(`SELECT * FROM envelope_recipients WHERE envelope_id=? AND role IN ('signer','approver','witness','notary') AND access_revoked_at IS NULL AND status NOT IN ('completed','declined','expired') ORDER BY routing_order,created_at`).bind(ses.envelope_id).all() as any
  if ((remaining.results || []).length && env.signing_order_mode === 'sequential') {
    const nextOrder = Math.min(...remaining.results.map((r: any) => Number(r.routing_order || 1)))
    const targets = remaining.results.filter((r: any) => Number(r.routing_order || 1) === nextOrder && r.status === 'pending')
    for (const r of targets) await invite(c.env, env, r)
    if (targets.length) {
      await appendEnvelopeEventFromContext(c, {
        envelopeId: ses.envelope_id,
        eventType: 'routing.next_recipient_invited',
        actorType: 'system',
        metadata: { routing_order: nextOrder, recipient_count: targets.length },
      })
    }
    return c.json({ ok: true, envelope_completed: false, next_routing_order: nextOrder })
  }
  if ((remaining.results || []).length) return c.json({ ok: true, envelope_completed: false })

  const completedAt = now()
  await c.env.DB.prepare(`UPDATE envelopes SET status='completed',completed_at=?,updated_at=? WHERE id=?`).bind(completedAt, completedAt, ses.envelope_id).run()
  await appendEnvelopeEventFromContext(c, {
    envelopeId: ses.envelope_id,
    eventType: 'envelope.completed',
    actorType: 'signer',
    actorId: ses.recipient_id,
    recipientId: ses.recipient_id,
    metadata: { secure_completion_gate: true },
  })

  try {
    const result = await sealEnvelope(c.env, ses.envelope_id)
    await appendEnvelopeEventFromContext(c, {
      envelopeId: ses.envelope_id,
      eventType: 'envelope.sealed',
      actorType: 'system',
      metadata: {
        algorithm: result.algorithm,
        key_id: result.keyId,
        final_pdf_sha256: result.signedPdfHash,
        audit_pdf_sha256: result.auditPdfHash,
        manifest_sha256: result.manifestHash,
        verified_snapshot: result.signedPdfHash.slice(0, 8),
      },
    })
    const e = await c.env.DB.prepare('SELECT public_id,title,completed_at FROM envelopes WHERE id=?').bind(ses.envelope_id).first() as any
    const signers = await c.env.DB.prepare(`SELECT COUNT(*) n FROM envelope_recipients WHERE envelope_id=? AND role='signer' AND access_revoked_at IS NULL`).bind(ses.envelope_id).first() as any
    await c.env.DB.prepare(`INSERT OR REPLACE INTO verification_records(id,envelope_id,public_id,verification_status,document_label,issuer_name,completed_date,signer_count,final_pdf_sha256_prefix,sealed_at,updated_at) VALUES (?,?,?,?,?,'Pinnacle Management Ventures',?,?,?,?,?)`).bind(uuid(), ses.envelope_id, e.public_id, 'valid', e.title, e.completed_at, Number(signers?.n || 0), result.signedPdfHash.slice(0, 16), result.sealedAt, now()).run()
  } catch (err) {
    await appendEnvelopeEventFromContext(c, {
      envelopeId: ses.envelope_id,
      eventType: 'envelope.seal_failed',
      actorType: 'system',
      metadata: { error: err instanceof Error ? err.message : 'unknown sealing error' },
    })
  }
  return c.json({ ok: true, envelope_completed: true })
})

documentSignerSecurityRoutes.post('/sign/:token/decline', async (c) => {
  const h = await sha256Hex(c.req.param('token'))
  const r = await c.env.DB.prepare('SELECT * FROM envelope_recipients WHERE invitation_token_hash=?').bind(h).first() as any
  if (!r) return c.json({ error: 'invalid or revoked link' }, 404)
  if (r.access_revoked_at) return c.json({ error: 'access revoked' }, 410)
  const b = await c.req.json<any>().catch(() => ({}))
  const reason = String(b.reason || '').slice(0, 500)
  const stamp = now()
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE envelope_recipients SET status='declined',declined_at=?,invitation_token_hash=NULL,invitation_expires_at=NULL,updated_at=? WHERE id=?`).bind(stamp, stamp, r.id),
    c.env.DB.prepare(`UPDATE envelopes SET status='declined',declined_at=?,updated_at=? WHERE id=?`).bind(stamp, stamp, r.envelope_id),
  ])
  await appendEnvelopeEventFromContext(c, {
    envelopeId: r.envelope_id,
    eventType: 'recipient.declined',
    actorType: 'signer',
    actorId: r.id,
    recipientId: r.id,
    metadata: { reason },
  })
  return c.json({ ok: true })
})
