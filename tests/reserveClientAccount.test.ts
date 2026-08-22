import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const helper = read('../functions/_lib/reserveClientAccount.ts')
const booking = read('../functions/_lib/routes/consultationBooking.ts')
const scope = read('../functions/_lib/routes/scopeFunnel.ts')

// Completing a request already reserved a client workspace, but only on the
// scope-request path. Booking a consultation is equally a completed request
// and got nothing, so the same stranger was treated two different ways
// depending on which door they came through.

describe('a completed request reserves a workspace', () => {
  it('creates the account with no password', () => {
    // The account exists; the person is not signed in. That gap is the whole
    // safety argument, because a public form accepts any address.
    expect(helper).toContain('password_hash, role')
    expect(helper).toContain("VALUES (?, ?, NULL, 'client'")
  })

  it('activates only through a link sent to the address', () => {
    expect(helper).toContain('createActivationToken(env')
    expect(helper).toContain('/set-password?token=')
  })

  it('gives them a profile, not just a login row', () => {
    expect(helper).toContain('INSERT INTO client_profiles')
  })
})

describe('it will not create a duplicate or cross a role', () => {
  it('leaves a staff or vendor address completely alone', () => {
    // Attaching a client workspace to a non-client login would blur two roles
    // the authorization model keeps apart on purpose.
    expect(helper).toContain("if (existing && existing.role !== 'client')")
    expect(helper).toContain("return { status: 'none', userId: null, setupUrl: null, statements: [] }")
  })

  it('does not tell a real customer to set a password they already have', () => {
    expect(helper).toContain('if (existing.password_hash)')
    expect(helper).toContain("return { status: 'existing'")
  })

  it('re-issues a link for a client who never finished activating', () => {
    expect(helper).toContain('const setupUrl = await mintSetupUrl(env, existing.id)')
  })
})

describe('the booking path uses it', () => {
  it('reserves before the write so the rows share one transaction', () => {
    const reserveAt = booking.indexOf('await reserveClientAccount(c.env')
    const batchAt = booking.indexOf('await c.env.DB.batch([')
    expect(reserveAt).toBeGreaterThan(-1)
    expect(reserveAt).toBeLessThan(batchAt)
    expect(booking).toContain('...account.statements,')
  })

  it('prefers the reserved account over the unverified email match', () => {
    // matched_user_id was only ever a guess from an unverified address; the
    // reserved account is the one this booking actually created.
    expect(booking).toContain('account.userId ?? matched?.id ?? null')
  })

  it('emails the welcome alongside the confirmation', () => {
    expect(booking).toContain('sendReservedAccountWelcome(c.env, account,')
  })
})

describe('mail cannot undo a booking', () => {
  it('swallows a send failure rather than throwing', () => {
    // The booking is already recorded by the time this runs.
    expect(helper).toContain("console.error('[account-email] reserve failed'")
  })

  it('sends nothing when there is nothing to activate', () => {
    expect(helper).toContain('if (!account.setupUrl || !account.userId) return')
  })
})

describe('the original path still works', () => {
  it('scope requests continue to reserve accounts', () => {
    expect(scope).toContain('createActivationToken')
    expect(scope).toContain('sendAccountWelcome')
  })
})

describe('a token store outage cannot cost someone their booking', () => {
  it('returns no link instead of throwing', () => {
    // createActivationToken writes to KV. Unguarded, a KV outage failed the
    // whole booking with a 500, which is exactly backwards: the booking is the
    // thing worth keeping and the workspace is the bonus.
    expect(helper).toContain("console.error('[account-reserve] activation token failed'")
    expect(helper).toContain('return null')
  })

  it('creates no account when there is no way to activate it', () => {
    // A shell with no link is a row nobody can ever get into.
    expect(helper).toContain("if (!setupUrl) return { status: 'none', userId: null, setupUrl: null, statements: [] }")
  })
})
