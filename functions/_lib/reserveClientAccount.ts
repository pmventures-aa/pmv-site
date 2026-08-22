import type { Env } from './types'
import { uuid } from './crypto'
import { createActivationToken } from './session'
import { sendAccountWelcome, CLIENT_PORTAL_URL } from './accountEmails'

// Reserving a client workspace when someone completes a request.
//
// Lifted out of the scope-request route so the consultation booking path can
// do the same thing. It previously only happened on one of the two ways a
// stranger can reach Pinnacle, so booking a consultation left someone with no
// workspace while submitting a request gave them one.
//
// The account is created with password_hash NULL and the person is NOT signed
// in. That distinction is the whole safety argument: a public form accepts any
// address, so the only proof the address belongs to the person typing it is
// that they can open the activation link sent to it. Creating a reserved shell
// costs nothing if they never do; signing them in on an unverified address
// would hand out a session on someone else's identity.

export type ReservedAccountStatus = 'reserved' | 'existing' | 'none'

export interface ReservedAccount {
  status: ReservedAccountStatus
  userId: string | null
  /** Set-password link. Null when there is nothing to activate. */
  setupUrl: string | null
  /** Rows to include in the caller's batch, so this shares its transaction. */
  statements: D1PreparedStatement[]
}

function setupUrlFor(token: string): string {
  return `${CLIENT_PORTAL_URL.replace(/\/$/, '')}/set-password?token=${encodeURIComponent(token)}`
}

/**
 * An activation link, or null if the token store will not cooperate.
 *
 * createActivationToken writes to KV. Left unguarded that made a KV outage
 * fail the entire booking, which is exactly backwards: the booking is the
 * thing worth keeping and the workspace is the bonus. A caller that gets null
 * simply creates no account and sends no mail, and the visitor still has their
 * appointment.
 */
async function mintSetupUrl(env: Env, userId: string): Promise<string | null> {
  try {
    return setupUrlFor(await createActivationToken(env, userId))
  } catch (err) {
    console.error('[account-reserve] activation token failed', err instanceof Error ? err.message : err)
    return null
  }
}

export interface ReserveInput {
  email: string
  fullName: string
  firstName: string
  lastName: string
  phone?: string | null
  serviceKey?: string | null
}

/**
 * Decide what workspace, if any, this request should create.
 *
 * Three outcomes, and the third matters most:
 *   reserved  a shell account exists and an activation link was minted
 *   existing  they already have a usable login; nothing is created or emailed
 *   none      the address belongs to a staff or vendor account, so it is left
 *             alone entirely. Quietly attaching a client workspace to a
 *             non-client login would blur two roles that the authorization
 *             model deliberately keeps apart.
 */
export async function reserveClientAccount(env: Env, input: ReserveInput): Promise<ReservedAccount> {
  const existing = await env.DB.prepare(
    'SELECT id, role, password_hash FROM users WHERE lower(email) = lower(?)',
  ).bind(input.email).first<{ id: string; role: string; password_hash: string | null }>().catch(() => null)

  if (existing && existing.role !== 'client') {
    return { status: 'none', userId: null, setupUrl: null, statements: [] }
  }

  if (existing) {
    // Already a client. Only mint a link if they never set a password, so a
    // real customer does not get told to set one they already have.
    if (existing.password_hash) {
      return { status: 'existing', userId: existing.id, setupUrl: null, statements: [] }
    }
    const setupUrl = await mintSetupUrl(env, existing.id)
    return {
      status: setupUrl ? 'reserved' : 'none',
      userId: existing.id,
      setupUrl,
      statements: [],
    }
  }

  const userId = uuid()
  const setupUrl = await mintSetupUrl(env, userId)
  // No link means no way in, so creating the shell would leave an orphan row
  // nobody can ever activate. Skip it entirely and let the caller carry on.
  if (!setupUrl) return { status: 'none', userId: null, setupUrl: null, statements: [] }

  return {
    status: 'reserved',
    userId,
    setupUrl,
    statements: [
      env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, phone, two_factor_enabled, status)
         VALUES (?, ?, NULL, 'client', ?, ?, ?, ?, 0, 'active')`,
      ).bind(userId, input.email, input.fullName, input.firstName, input.lastName, input.phone || null),
      env.DB.prepare(
        `INSERT INTO client_profiles (id, user_id, services_enrolled, onboarding_completed) VALUES (?, ?, ?, 0)`,
      ).bind(uuid(), userId, input.serviceKey ? JSON.stringify([input.serviceKey]) : null),
    ],
  }
}

/**
 * Send the welcome, best-effort.
 *
 * Never allowed to fail the thing that triggered it: the booking or request is
 * already recorded by the time this runs, and a mail outage must not undo it.
 */
export async function sendReservedAccountWelcome(
  env: Env,
  account: ReservedAccount,
  input: { email: string; firstName: string },
): Promise<void> {
  if (!account.setupUrl || !account.userId) return
  await sendAccountWelcome(env, {
    userId: account.userId,
    role: 'client',
    email: input.email,
    firstName: input.firstName,
    creationType: 'lead_conversion',
    actionLabel: 'Open My Workspace',
    actionUrl: account.setupUrl,
  }).catch((err) => console.error('[account-email] reserve failed', err instanceof Error ? err.message : err))
}
