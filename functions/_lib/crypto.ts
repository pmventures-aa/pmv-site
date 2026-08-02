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

const PBKDF2_ITERATIONS = 120_000

// Hash a password with PBKDF2-SHA256 (random 16-byte salt, 32-byte derived key).
// Stored form: pbkdf2$<iterations>$<saltB64>$<hashB64>
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, iterStr, saltB64, hashB64] = stored.split('$')
    if (scheme !== 'pbkdf2') return false
    const iterations = parseInt(iterStr, 10)
    const salt = unb64(saltB64)
    const expected = unb64(hashB64)
    const actual = await pbkdf2(password, salt, iterations, expected.length)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
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
