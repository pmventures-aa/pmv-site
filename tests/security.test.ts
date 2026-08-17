import { describe, it, expect, beforeEach } from 'vitest'
import {
  issueStepUp,
  checkStepUp,
  recordSecurityEvent,
} from '../functions/_lib/security'
import type { Env, SessionUser } from '../functions/_lib/types'

// Minimal in-memory D1 stub covering just the SQL security.ts issues.
// We match on the first meaningful keyword and the target table name;
// everything else falls through with an explicit error so a regression
// in security.ts (new query shape, wrong table) is caught immediately.
function makeDB() {
  const stepUp: Array<Record<string, unknown>> = []
  const events: Array<Record<string, unknown>> = []

  const preparer = (sql: string) => {
    const trimmed = sql.trim().toLowerCase()
    let bound: unknown[] = []
    const api = {
      bind(...args: unknown[]) {
        bound = args
        return api
      },
      async run() {
        if (trimmed.startsWith('insert into step_up_verifications')) {
          const [id, user_id, action_key, method, reason, expires_at, actor_ip, actor_city, actor_region, actor_country] = bound
          stepUp.push({
            id, user_id, action_key, method, reason, expires_at,
            actor_ip, actor_city, actor_region, actor_country,
            verified_at: new Date().toISOString(),
            consumed_at: null,
          })
          return { success: true }
        }
        if (trimmed.startsWith('insert into security_events')) {
          const [id, audit_log_id, actor_user_id, impersonator_id, event_key, severity, resource_type, resource_id, reason, metadata_json] = bound
          events.push({
            id, audit_log_id, actor_user_id, impersonator_id, event_key, severity,
            resource_type, resource_id, reason, metadata_json,
            created_at: new Date().toISOString(),
          })
          return { success: true }
        }
        if (trimmed.startsWith('update step_up_verifications')) {
          const [consumed_at, id] = bound
          const row = stepUp.find((r) => r.id === id && r.consumed_at == null)
          if (row) row.consumed_at = consumed_at
          return { success: true }
        }
        throw new Error(`unhandled SQL: ${sql}`)
      },
      async first<T>(): Promise<T | null> {
        if (trimmed.startsWith('select id, expires_at')) {
          const [user_id, action_key, now] = bound as [string, string, string]
          const matches = stepUp
            .filter((r) => r.user_id === user_id && r.action_key === action_key && r.consumed_at == null && String(r.expires_at) > now)
            .sort((a, b) => String(b.verified_at).localeCompare(String(a.verified_at)))
          return (matches[0] as unknown as T) ?? null
        }
        throw new Error(`unhandled SQL: ${sql}`)
      },
    }
    return api
  }

  return {
    db: { prepare: preparer } as unknown as Env['DB'],
    stepUpRows: stepUp,
    eventRows: events,
  }
}

function makeEnv() {
  const { db, stepUpRows, eventRows } = makeDB()
  return {
    env: { DB: db } as unknown as Env,
    stepUpRows,
    eventRows,
  }
}

const alice: SessionUser = {
  id: 'user_alice',
  email: 'alice@example.com',
  role: 'admin',
  full_name: 'Alice Admin',
}

describe('issueStepUp / checkStepUp', () => {
  let ctx: ReturnType<typeof makeEnv>
  beforeEach(() => { ctx = makeEnv() })

  it('records a verification row and marks a security event', async () => {
    const v = await issueStepUp(ctx.env, {
      user: alice,
      action: 'banking.reveal',
      method: 'password',
      reason: 'RECONCILIATION',
    })
    expect(v.id).toMatch(/^step_/)
    expect(v.action).toBe('banking.reveal')
    expect(ctx.stepUpRows).toHaveLength(1)
    expect(ctx.eventRows.some((e) => e.event_key === 'STEP_UP_VERIFIED')).toBe(true)
  })

  it('checkStepUp returns true immediately after issueStepUp for the same action', async () => {
    await issueStepUp(ctx.env, { user: alice, action: 'banking.reveal', method: 'password' })
    const ok = await checkStepUp(ctx.env, alice, 'banking.reveal')
    expect(ok).toBe(true)
  })

  it('checkStepUp consumes the token by default (second check fails)', async () => {
    await issueStepUp(ctx.env, { user: alice, action: 'banking.reveal', method: 'password' })
    expect(await checkStepUp(ctx.env, alice, 'banking.reveal')).toBe(true)
    expect(await checkStepUp(ctx.env, alice, 'banking.reveal')).toBe(false)
  })

  it('checkStepUp with singleUse:false leaves the token reusable inside its window', async () => {
    await issueStepUp(ctx.env, { user: alice, action: 'banking.reveal', method: 'password' })
    expect(await checkStepUp(ctx.env, alice, 'banking.reveal', { singleUse: false })).toBe(true)
    expect(await checkStepUp(ctx.env, alice, 'banking.reveal', { singleUse: false })).toBe(true)
  })

  it('checkStepUp does not accept a token issued for a different action', async () => {
    await issueStepUp(ctx.env, { user: alice, action: 'banking.reveal', method: 'password' })
    expect(await checkStepUp(ctx.env, alice, 'billing.process_refund')).toBe(false)
  })

  it('checkStepUp returns false when the token is past its expiry', async () => {
    await issueStepUp(ctx.env, { user: alice, action: 'banking.reveal', method: 'password', ttlMs: -1000 })
    expect(await checkStepUp(ctx.env, alice, 'banking.reveal')).toBe(false)
  })

  it('checkStepUp short-circuits true for actions that do not require step-up', async () => {
    // documents.view is a normal action with stepUp:false in the catalog.
    expect(await checkStepUp(ctx.env, alice, 'documents.view')).toBe(true)
    expect(ctx.stepUpRows).toHaveLength(0)
  })
})

describe('recordSecurityEvent', () => {
  let ctx: ReturnType<typeof makeEnv>
  beforeEach(() => { ctx = makeEnv() })

  it('writes an event row with the actor and event key', async () => {
    const id = await recordSecurityEvent(ctx.env, {
      actor: alice,
      event: 'PERMISSION_CHANGED',
      resourceType: 'user',
      resourceId: 'user_bob',
      reason: 'Promoted to billing_specialist',
    })
    expect(id).toMatch(/^sev_/)
    expect(ctx.eventRows).toHaveLength(1)
    expect(ctx.eventRows[0].event_key).toBe('PERMISSION_CHANGED')
    expect(ctx.eventRows[0].actor_user_id).toBe('user_alice')
    expect(ctx.eventRows[0].resource_id).toBe('user_bob')
  })

  it('defaults BANKING_REVEALED to warning severity', async () => {
    await recordSecurityEvent(ctx.env, {
      actor: alice,
      event: 'BANKING_REVEALED',
      resourceType: 'bank_account',
      resourceId: 'ba_123',
    })
    expect(ctx.eventRows[0].severity).toBe('warning')
  })

  it('captures the impersonator id when the actor is being impersonated', async () => {
    const impersonated: SessionUser = { ...alice, impersonated_by_user_id: 'user_owner' }
    await recordSecurityEvent(ctx.env, {
      actor: impersonated,
      event: 'BANKING_REVEALED',
      resourceType: 'bank_account',
      resourceId: 'ba_123',
    })
    expect(ctx.eventRows[0].impersonator_id).toBe('user_owner')
  })

  it('serializes metadata as JSON without sensitive keys enforced by the caller', async () => {
    await recordSecurityEvent(ctx.env, {
      actor: alice,
      event: 'ROLE_ASSIGNED',
      metadata: { role: 'billing_specialist', scope: 'CLIENT_PORTFOLIO' },
    })
    expect(JSON.parse(String(ctx.eventRows[0].metadata_json))).toEqual({
      role: 'billing_specialist',
      scope: 'CLIENT_PORTFOLIO',
    })
  })
})
