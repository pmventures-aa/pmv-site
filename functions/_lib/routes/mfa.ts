import { Hono } from 'hono'
import type { AppEnv, SessionUser } from '../types'
import { requireUser } from '../mid'
import { generateTotpSecret, verifyTotp, otpauthUri, hashRecoveryCode } from '../totp'
import { updateSessionUser } from '../session'

export const mfaRoutes = new Hono<AppEnv>()

const ENROLL_TTL = 600
const MFA_OK_WINDOW_MS = 10 * 60 * 1000

// AES-256-GCM secret-at-rest encryption keyed off SESSION_SECRET.
async function deriveAesKey(env: AppEnv['Bindings']): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pmv-mfa:${env.SESSION_SECRET}`) as unknown as BufferSource)
  return crypto.subtle.importKey('raw', raw as unknown as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

function b64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function unb64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function encryptSecret(env: AppEnv['Bindings'], plaintext: string): Promise<string> {
  const key = await deriveAesKey(env)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, new TextEncoder().encode(plaintext) as unknown as BufferSource)
  return `${b64(iv)}.${b64(new Uint8Array(cipher))}`
}

async function decryptSecret(env: AppEnv['Bindings'], stored: string): Promise<string> {
  const [ivB64, cipherB64] = stored.split('.')
  const key = await deriveAesKey(env)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) as unknown as BufferSource }, key, unb64(cipherB64) as unknown as BufferSource)
  return new TextDecoder().decode(plain)
}

function nowIso(): string {
  return new Date().toISOString()
}

function recoveryCode(): string {
  const a = crypto.getRandomValues(new Uint8Array(10))
  return [...a].map((b) => b.toString(36)).join('').toUpperCase().slice(0, 10).replace(/(.{5})/g, '$1-').slice(0, 11)
}

async function credentialFor(env: AppEnv['Bindings'], userId: string) {
  return env.DB.prepare('SELECT id,secret_encrypted,recovery_code_hashes,enabled_at,method FROM mfa_credentials WHERE user_id=? AND revoked_at IS NULL ORDER BY enabled_at DESC LIMIT 1').bind(userId).first<{ id: string; secret_encrypted: string; recovery_code_hashes: string; enabled_at: string; method: string }>()
}

export async function requireFreshMfa(c: any, next: any) {
  return requireUser(c, async () => {
    const user = c.get('user') as SessionUser
    const cred = await credentialFor(c.env, user.id)
    if (cred) {
      const okUntil = user.mfa_ok_until ? new Date(user.mfa_ok_until).getTime() : 0
      if (Date.now() > okUntil) return c.json({ error: 'mfa required', mfa_required: true }, 401)
    }
    return next()
  })
}

mfaRoutes.use('/me/mfa/*', requireUser)

mfaRoutes.get('/me/mfa/status', async (c) => {
  const user = c.get('user') as SessionUser
  const cred = await credentialFor(c.env, user.id)
  return c.json({
    enabled: Boolean(cred),
    method: cred?.method || null,
    enrolled_at: cred?.enabled_at || null,
    mfa_ok_until: user.mfa_ok_until || null,
    mfa_ok: Boolean(user.mfa_ok_until && Date.now() <= new Date(user.mfa_ok_until).getTime()),
  })
})

mfaRoutes.post('/me/mfa/enroll', async (c) => {
  const user = c.get('user') as SessionUser
  const existing = await credentialFor(c.env, user.id)
  if (existing) return c.json({ error: 'MFA is already enabled for this account.' }, 409)
  const { secretBase32 } = generateTotpSecret()
  const recoveryCodes = Array.from({ length: 8 }, () => recoveryCode())
  await c.env.SESSIONS.put(`mfaenroll:${user.id}`, JSON.stringify({ secretBase32, recoveryCodes, createdAt: nowIso() }), { expirationTtl: ENROLL_TTL })
  return c.json({
    secret_base32: secretBase32,
    otpauth_uri: otpauthUri(user.email, 'Pinnacle Management Ventures', secretBase32),
    recovery_codes: recoveryCodes,
    expires_in: ENROLL_TTL,
  })
})

mfaRoutes.post('/me/mfa/confirm', async (c) => {
  const user = c.get('user') as SessionUser
  const body = await c.req.json<{ code?: string }>().catch((): { code?: string } => ({}))
  const code = String(body.code || '').replace(/\D/g, '')
  if (code.length !== 6) return c.json({ error: 'Enter the 6-digit code from your authenticator app.' }, 400)
  const raw = await c.env.SESSIONS.get(`mfaenroll:${user.id}`)
  if (!raw) return c.json({ error: 'Enrollment session expired. Start again.' }, 410)
  const pending = JSON.parse(raw) as { secretBase32: string; recoveryCodes: string[] }
  const ok = await verifyTotp(pending.secretBase32, code, Date.now() / 1000)
  if (!ok) return c.json({ error: 'That code does not match. Check the time on your device.' }, 401)
  const recoveryHashes = await Promise.all(pending.recoveryCodes.map((rc) => hashRecoveryCode(rc)))
  await c.env.DB.prepare('INSERT INTO mfa_credentials (id,user_id,method,secret_encrypted,recovery_code_hashes,enabled_at) VALUES (?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), user.id, 'totp', await encryptSecret(c.env, pending.secretBase32), JSON.stringify(recoveryHashes), nowIso()).run()
  await c.env.SESSIONS.delete(`mfaenroll:${user.id}`)
  await updateSessionUser(c.env, c.req.raw, { mfa_ok_until: new Date(Date.now() + MFA_OK_WINDOW_MS).toISOString() })
  return c.json({ ok: true, mfa_ok_until: new Date(Date.now() + MFA_OK_WINDOW_MS).toISOString() })
})

mfaRoutes.post('/me/mfa/verify', async (c) => {
  const user = c.get('user') as SessionUser
  const body = await c.req.json<{ code?: string }>().catch((): { code?: string } => ({}))
  const rawCode = String(body.code || '').trim()
  const cred = await credentialFor(c.env, user.id)
  if (!cred) return c.json({ error: 'MFA is not enabled for this account.' }, 409)
  let ok = false
  const numeric = rawCode.replace(/\D/g, '')
  if (numeric.length === 6) {
    const secret = await decryptSecret(c.env, cred.secret_encrypted)
    ok = await verifyTotp(secret, numeric, Date.now() / 1000)
  } else {
    const hashes = JSON.parse(cred.recovery_code_hashes || '[]') as string[]
    const candidate = await hashRecoveryCode(rawCode.toUpperCase())
    ok = hashes.includes(candidate)
  }
  if (!ok) return c.json({ error: 'That code is not valid.' }, 401)
  const okUntil = new Date(Date.now() + MFA_OK_WINDOW_MS).toISOString()
  await updateSessionUser(c.env, c.req.raw, { mfa_ok_until: okUntil })
  return c.json({ ok: true, mfa_ok_until: okUntil })
})

mfaRoutes.delete('/me/mfa', requireFreshMfa, async (c) => {
  const user = c.get('user') as SessionUser
  const cred = await credentialFor(c.env, user.id)
  if (!cred) return c.json({ error: 'MFA is not enabled for this account.' }, 409)
  await c.env.DB.prepare('UPDATE mfa_credentials SET revoked_at=? WHERE id=?').bind(nowIso(), cred.id).run()
  await updateSessionUser(c.env, c.req.raw, { mfa_ok_until: null })
  return c.json({ ok: true })
})