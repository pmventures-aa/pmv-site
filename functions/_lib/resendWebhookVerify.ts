const DEFAULT_TOLERANCE_SECONDS = 5 * 60

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let raw = ''
  for (const b of bytes) raw += String.fromCharCode(b)
  return btoa(raw)
}

function timingSafeEqualString(a: string, b: string): boolean {
  const aa = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)
  if (aa.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i]
  return diff === 0
}

export async function verifyResendWebhookSignature(input: {
  secret: string
  payload: string
  id: string | null
  timestamp: string | null
  signature: string | null
  nowMs?: number
  toleranceSeconds?: number
}): Promise<boolean> {
  if (!input.secret || !input.id || !input.timestamp || !input.signature) return false
  const timestampNumber = Number(input.timestamp)
  if (!Number.isFinite(timestampNumber)) return false

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000)
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
  if (Math.abs(nowSeconds - timestampNumber) > tolerance) return false

  try {
    const encodedSecret = input.secret.startsWith('whsec_') ? input.secret.slice('whsec_'.length) : input.secret
    const secretBytes = base64ToBytes(encodedSecret)
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signedContent = `${input.id}.${input.timestamp}.${input.payload}`
    const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent))
    const expected = bytesToBase64(new Uint8Array(signed))

    const candidates = input.signature
      .split(/\s+/)
      .map((part) => part.trim().split(',', 2))
      .filter(([version, signature]) => version === 'v1' && !!signature)
      .map(([, signature]) => signature)

    return candidates.some((candidate) => timingSafeEqualString(expected, candidate))
  } catch {
    return false
  }
}
