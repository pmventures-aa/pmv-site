import type { Env } from './types'
import type { Auth0ConnectionId } from './auth0Config'

export type Auth0FlowMode = 'login' | 'link'

export interface Auth0Transaction {
  codeVerifier: string
  nonce: string
  returnTo: string
  mode: Auth0FlowMode
  connection: Auth0ConnectionId
  linkUserId?: string | null
  createdAt: number
}

const TTL_SECONDS = 10 * 60
const PREFIX = 'auth0tx:'
const USED_PREFIX = 'auth0used:'

function randomUrlToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes))
  let s = ''
  for (const b of buf) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function newAuth0State(): string {
  return randomUrlToken(24)
}

export function newAuth0Nonce(): string {
  return randomUrlToken(24)
}

export async function saveAuth0Transaction(
  env: Env,
  state: string,
  tx: Auth0Transaction,
): Promise<void> {
  await env.SESSIONS.put(`${PREFIX}${state}`, JSON.stringify(tx), { expirationTtl: TTL_SECONDS })
}

export async function consumeAuth0Transaction(
  env: Env,
  state: string,
): Promise<Auth0Transaction | null> {
  if (!state) return null
  const usedKey = `${USED_PREFIX}${state}`
  const already = await env.SESSIONS.get(usedKey)
  if (already) return null

  const key = `${PREFIX}${state}`
  const raw = await env.SESSIONS.get(key)
  if (!raw) return null

  // Mark replayed before delete so concurrent callbacks cannot both succeed.
  await env.SESSIONS.put(usedKey, '1', { expirationTtl: TTL_SECONDS })
  await env.SESSIONS.delete(key)

  try {
    const parsed = JSON.parse(raw) as Auth0Transaction
    if (!parsed?.codeVerifier || !parsed?.nonce || !parsed?.connection) return null
    if (Date.now() - (parsed.createdAt || 0) > TTL_SECONDS * 1000) return null
    return parsed
  } catch {
    return null
  }
}

/** Visible for tests — build a transaction payload. */
export function buildAuth0Transaction(input: Omit<Auth0Transaction, 'createdAt'> & { createdAt?: number }): Auth0Transaction {
  return { ...input, createdAt: input.createdAt ?? Date.now() }
}
