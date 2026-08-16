// Pure-JS TOTP (RFC 6238) with HMAC-SHA1/256/512. No external dependencies so
// it runs on Cloudflare Workers. The test suite verifies the RFC 6238
// appendix-B vectors for the shared secret 12345678901234567890.

const enc = new TextEncoder()

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(key: Uint8Array, data: Uint8Array, algo: 'SHA-1' | 'SHA-256' | 'SHA-512'): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key as unknown as BufferSource, { name: 'HMAC', hash: algo }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data as unknown as BufferSource))
}

function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

function base32Encode(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 0x1f]
      bits -= 5
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 0x1f]
  while (out.length % 8 !== 0) out += '='
  return out
}

// RFC 4226 dynamic truncation. digestHex is the hex-encoded HMAC output.
function dynamicTruncate(digestHex: string, digits: number): string {
  const digest = hexToBytes(digestHex)
  const offset = digest[digest.length - 1] & 0x0f
  const binCode =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  const modulus = Math.pow(10, digits)
  const code = binCode % modulus
  return String(code).padStart(digits, '0')
}

export interface TotpOptions {
  algorithm?: 'SHA-1' | 'SHA-256' | 'SHA-512'
  digits?: number
  period?: number
}

// Async TOTP generation used at runtime. secret is the base32 secret.
export async function totpAsync(secretBase32: string, timeSeconds: number, options: TotpOptions = {}): Promise<string> {
  return totpFromKeyBytes(base32Decode(secretBase32), timeSeconds, options)
}

// TOTP with an explicit raw key (hex-encoded). Used by the RFC 6238 vector
// tests, whose SHA-256/512 columns use 32/64-byte ASCII keys.
export async function totpHexKey(secretHex: string, timeSeconds: number, options: TotpOptions = {}): Promise<string> {
  return totpFromKeyBytes(hexToBytes(secretHex), timeSeconds, options)
}

async function totpFromKeyBytes(keyBytes: Uint8Array, timeSeconds: number, options: TotpOptions = {}): Promise<string> {
  const algorithm = options.algorithm || 'SHA-1'
  const digits = options.digits || 6
  const period = options.period || 30
  const counter = Math.floor(timeSeconds / period)
  const counterBuffer = new Uint8Array(8)
  const view = new DataView(counterBuffer.buffer)
  view.setUint32(4, counter >>> 0)
  view.setUint32(0, Math.floor(counter / 0x100000000) >>> 0)
  const digest = await hmac(keyBytes, counterBuffer, algorithm)
  return dynamicTruncate(bytesToHex(digest), digits)
}

export async function verifyTotp(secretBase32: string, code: string, timeSeconds: number, windowSteps = 1, options: TotpOptions = {}): Promise<boolean> {
  const normalized = String(code).replace(/\D/g, '')
  const digits = options.digits || 6
  if (normalized.length !== digits) return false
  for (let i = -windowSteps; i <= windowSteps; i++) {
    const candidate = await totpAsync(secretBase32, timeSeconds + i * (options.period || 30), { ...options })
    if (candidate === normalized) return true
  }
  return false
}

export function generateTotpSecret(): { secretBase32: string; secretHex: string } {
  const raw = crypto.getRandomValues(new Uint8Array(20))
  return { secretBase32: base32Encode(raw), secretHex: bytesToHex(raw) }
}

export function otpauthUri(account: string, issuer: string, secretBase32: string, algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512' = 'SHA-1', digits = 6, period = 30): string {
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm,
    digits: String(digits),
    period: String(period),
  })
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?${params.toString()}`
}

export async function hashRecoveryCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`pmv-recovery:${code}`) as unknown as BufferSource)
  return bytesToHex(new Uint8Array(digest))
}