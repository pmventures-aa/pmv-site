// Authorization gates for the provider-review scope.
//
// The security property under test: an under-review provider
// (access_scope 'provider_review') is closed by default — requireUser,
// requireStaff, requireAdmin, requireOwner and requireClient all reject it —
// while requireProvider is the single gate that admits it. Already-approved
// vendors (full scope) and staff keep their existing access unchanged.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionUser } from '../functions/_lib/types'

// getUser is the only session dependency the gates have; mock it so we can
// assert each gate's decision for a given session shape without a DB.
const getUser = vi.fn<[], Promise<SessionUser | null>>()
vi.mock('../functions/_lib/session', () => ({
  getUser: (..._args: unknown[]) => getUser(),
}))

import {
  requireUser,
  requireStaff,
  requireAdmin,
  requireOwner,
  requireClient,
  requireProvider,
} from '../functions/_lib/mid'

type GateResult = { status: number; nexted: boolean }

// Minimal Hono-context stand-in. requireOwner also reads is_owner from DB, so
// the fake exposes a DB whose first() returns is_owner=1 (owner) so that gate
// reaches its restricted-scope check rather than failing on ownership first.
function runGate(
  gate: (c: any, next: any) => Promise<unknown>,
): Promise<GateResult> {
  let nexted = false
  let status = 200
  const c = {
    env: {
      DB: {
        prepare: () => ({ bind: () => ({ first: async () => ({ is_owner: 1 }) }) }),
      },
    },
    req: { raw: new Request('https://x/') },
    json: (_body: unknown, s = 200) => {
      status = s
      return new Response(null, { status: s })
    },
    set: () => {},
    get: () => undefined,
  }
  const next = async () => {
    nexted = true
  }
  return gate(c, next).then(() => ({ status, nexted }))
}

function session(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: 'u1',
    email: 'u1@example.com',
    role: 'staff',
    full_name: 'U One',
    access_scope: 'full',
    ...overrides,
  }
}

const staff = () => session({ role: 'staff', party_type: 'employee' })
const admin = () => session({ role: 'admin', party_type: 'employee' })
const client = () => session({ role: 'client', party_type: null, access_scope: 'full' })
const activeVendor = () => session({ role: 'staff', party_type: 'vendor', network_status: 'vetting', access_scope: 'full' })
const reviewVendor = () => session({ role: 'staff', party_type: 'vendor', network_status: 'vetting', review_stage: 'submitted', access_scope: 'provider_review' })

beforeEach(() => getUser.mockReset())

describe('restricted provider is closed by default', () => {
  const closedGates: Array<[string, (c: any, n: any) => Promise<unknown>]> = [
    ['requireUser', requireUser],
    ['requireStaff', requireStaff],
    ['requireAdmin', requireAdmin],
    ['requireOwner', requireOwner],
    ['requireClient', requireClient],
  ]
  for (const [name, gate] of closedGates) {
    it(`${name} rejects an under-review provider with 403`, async () => {
      getUser.mockResolvedValue(reviewVendor())
      const r = await runGate(gate)
      expect(r.nexted).toBe(false)
      expect(r.status).toBe(403)
    })
  }
})

describe('requireProvider admits vendors only', () => {
  it('admits an under-review provider', async () => {
    getUser.mockResolvedValue(reviewVendor())
    const r = await runGate(requireProvider)
    expect(r.nexted).toBe(true)
  })
  it('admits an already-approved vendor', async () => {
    getUser.mockResolvedValue(activeVendor())
    const r = await runGate(requireProvider)
    expect(r.nexted).toBe(true)
  })
  it('rejects a staff (non-vendor) account', async () => {
    getUser.mockResolvedValue(staff())
    const r = await runGate(requireProvider)
    expect(r.nexted).toBe(false)
    expect(r.status).toBe(403)
  })
  it('rejects an unauthenticated caller with 401', async () => {
    getUser.mockResolvedValue(null)
    const r = await runGate(requireProvider)
    expect(r.nexted).toBe(false)
    expect(r.status).toBe(401)
  })
})

describe('existing access is unchanged for full-scope accounts', () => {
  it('requireStaff still admits staff', async () => {
    getUser.mockResolvedValue(staff())
    expect((await runGate(requireStaff)).nexted).toBe(true)
  })
  it('requireStaff still admits an already-approved vendor (full scope)', async () => {
    getUser.mockResolvedValue(activeVendor())
    expect((await runGate(requireStaff)).nexted).toBe(true)
  })
  it('requireAdmin still admits admin', async () => {
    getUser.mockResolvedValue(admin())
    expect((await runGate(requireAdmin)).nexted).toBe(true)
  })
  it('requireClient still admits a client', async () => {
    getUser.mockResolvedValue(client())
    expect((await runGate(requireClient)).nexted).toBe(true)
  })
  it('requireUser still admits a client', async () => {
    getUser.mockResolvedValue(client())
    expect((await runGate(requireUser)).nexted).toBe(true)
  })
})
