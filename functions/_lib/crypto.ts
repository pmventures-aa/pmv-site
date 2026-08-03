// WebCrypto helpers (Cloudflare Workers runtime)

export function uuid(): string {
  return crypto.randomUUID()
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

// Cloudflare Workers' WebCrypto implementation caps PBKDF2 at 100,000
// iterations (crypto.subtle.deriveBits throws NotSupportedError above that,
// even though browsers/Node allow more) — this was the actual root cause of
// the bootstrap/signup 500s. 100,000 is below current OWASP guidance
// (~600,000) for PBKDF2-SHA256 alone, so passwords are additionally peppered
// with an HMAC-SHA256 of SESSION_SECRET before PBKDF2 runs (see hmacPepper
// below). SESSION_SECRET lives only in the Cloudflare secret store, never in
// the D1 database, so a stolen users table alone isn't enough to attempt an
// offline crack — the attacker also needs the secret.
const PBKDF2_ITERATIONS = 100_000

// Stored form: `pbkdf2$<iterations>$<saltB64>$<hashB64>` (legacy, unpeppered)
// or `pbkdf2p$<iterations>$<saltB64>$<hashB64>` (current, HMAC-peppered).
// verifyPassword supports both so existing hashes keep working; hashPassword
// only ever writes the peppered form when a secret is available.
export async function hashPassword(password: string, pepperSecret?: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const material = pepperSecret ? await hmacPepper(password, pepperSecret) : password
  const hash = await pbkdf2(material, salt, PBKDF2_ITERATIONS)
  const scheme = pepperSecret ? 'pbkdf2p' : 'pbkdf2'
  return `${scheme}$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`
}

export async function verifyPassword(password: string, stored: string, pepperSecret?: string): Promise<boolean> {
  try {
    const [scheme, iterStr, saltB64, hashB64] = stored.split('$')
    if (scheme !== 'pbkdf2' && scheme !== 'pbkdf2p') return false
    const iterations = parseInt(iterStr, 10)
    const salt = unb64(saltB64)
    const expected = unb64(hashB64)
    const material = scheme === 'pbkdf2p' && pepperSecret ? await hmacPepper(password, pepperSecret) : password
    const actual = await pbkdf2(material, salt, iterations, expected.length)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

async function hmacPepper(password: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret) as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(password) as unknown as BufferSource)
  return b64(new Uint8Array(sig))
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number, length = 32): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password) as unknown as BufferSource, 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i]
  return out === 0
}
