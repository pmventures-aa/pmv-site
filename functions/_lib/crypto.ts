// WebCrypto helpers (available in the Cloudflare Workers runtime)

export function uuid(): string {
  return crypto.randomUUID()
}

export function randomCode(digits = 6): string {
  const max = 10 ** digits
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % max
  return n.toString().padStart(digits, '0')
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Salted hash for OTP codes and passwords (demo-grade; swap for Argon2/bcrypt
// via a binding or WebCrypto PBKDF2 before production).
export async function hashSecret(secret: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${secret}`)
}

export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}
