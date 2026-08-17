import type { Env, SessionUser } from './types'
import type { GranularPermission } from '../../shared/authorization'
import { permissionSpec } from '../../shared/authorization'

// Server-verified step-up and security-event helpers.
//
// The granular authorization core in shared/authorization.ts marks
// sensitive actions (banking.reveal, billing.process_refund,
// users.assign_roles, security.manage, firm_settings.manage,
// vendor.payment_change) with stepUp = true and denies them with
// reason 'step_up_required' unless context.stepUp is truthy at the
// authorize() call. That flag must never come from client input alone -
// this module is what backs it. issueStepUp() records a fresh
// verification against a specific action key; checkStepUp() consumes
// it (single-use by default) and short-circuits when expired.
//
// recordSecurityEvent() writes a curated projection over audit_log so
// the auditor console can filter by event vocabulary
// (BANKING_REVEALED, PERMISSION_CHANGED, ...) without scanning the
// full audit_log table on every load.

export type StepUpMethod = 'password' | 'totp' | 'webauthn' | 'sso_reauth'

// Default TTLs by action family. Reveal-class actions are the shortest
// because a five-minute window covers a reconciliation lookup without
// leaving a wide replay window; administrative changes get 15 minutes
// so an operator can complete a small role edit without re-authing.
const DEFAULT_TTL_MS: Record<string, number> = {
  'banking.reveal': 5 * 60_000,
  'billing.process_refund': 10 * 60_000,
  'users.assign_roles': 15 * 60_000,
  'firm_settings.manage': 15 * 60_000,
  'security.manage': 15 * 60_000,
}
const FALLBACK_TTL_MS = 10 * 60_000

function ttlFor(action: GranularPermission): number {
  return DEFAULT_TTL_MS[action] ?? FALLBACK_TTL_MS
}

function nowIso(): string {
  return new Date().toISOString()
}

function isoAfter(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}

function randomId(prefix: string): string {
  const uuid = crypto.randomUUID()
  return `${prefix}_${uuid.replace(/-/g, '')}`
}

export interface IssueStepUpInput {
  user: SessionUser
  action: GranularPermission
  method: StepUpMethod
  reason?: string
  ttlMs?: number
  request?: Request
}

export interface StepUpVerification {
  id: string
  action: GranularPermission
  expiresAt: string
}

// Record a successful re-authentication for a specific action key. The
// caller is responsible for having actually verified the user via
// password/OTP/webauthn - this function only stores the outcome. Returns
// the row id (opaque) and expiry so an API can echo them to the client
// UI (never as a bearer token; the row is looked up by user_id + action
// in checkStepUp()).
export async function issueStepUp(env: Env, input: IssueStepUpInput): Promise<StepUpVerification> {
  const id = randomId('step')
  const expiresAt = isoAfter(input.ttlMs ?? ttlFor(input.action))
  const geo = geoFromRequest(input.request)
  await env.DB.prepare(
    `INSERT INTO step_up_verifications
       (id, user_id, action_key, method, reason, expires_at,
        actor_ip, actor_city, actor_region, actor_country)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    input.user.id,
    input.action,
    input.method,
    input.reason ?? null,
    expiresAt,
    geo.ip,
    geo.city,
    geo.region,
    geo.country,
  ).run()

  await recordSecurityEvent(env, {
    actor: input.user,
    event: 'STEP_UP_VERIFIED',
    severity: 'notice',
    reason: input.reason,
    metadata: { action: input.action, method: input.method },
    request: input.request,
  })

  return { id, action: input.action, expiresAt }
}

export interface CheckStepUpOptions {
  singleUse?: boolean
}

// Server-side gate for context.stepUp. Returns true if the user has a
// non-expired, non-consumed step-up row for this exact action. Single-
// use by default (marks consumed_at on success) so a token cannot be
// replayed across multiple sensitive requests. Pass singleUse:false for
// batch flows that legitimately want to re-verify inside the window
// (e.g. reconciling many transactions inside one operator session).
export async function checkStepUp(
  env: Env,
  user: SessionUser,
  action: GranularPermission,
  options: CheckStepUpOptions = {},
): Promise<boolean> {
  const spec = permissionSpec(action)
  if (!spec?.stepUp) return true // action doesn't require step-up at all

  const row = await env.DB.prepare(
    `SELECT id, expires_at
       FROM step_up_verifications
       WHERE user_id = ?
         AND action_key = ?
         AND consumed_at IS NULL
         AND expires_at > ?
       ORDER BY verified_at DESC
       LIMIT 1`,
  ).bind(user.id, action, nowIso()).first<{ id: string; expires_at: string }>()

  if (!row) return false

  const singleUse = options.singleUse !== false
  if (singleUse) {
    await env.DB.prepare(
      `UPDATE step_up_verifications SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`,
    ).bind(nowIso(), row.id).run()
  }
  return true
}

// Curated security-event vocabulary from the spec (section 41). The
// storage column is TEXT so new event keys don't require a migration;
// this union is the source of truth at call sites.
export type SecurityEventKey =
  | 'BANKING_REVEALED'
  | 'BANK_ACCOUNT_UPDATED'
  | 'ROLE_ASSIGNED'
  | 'ROLE_REMOVED'
  | 'PERMISSION_CHANGED'
  | 'USER_CREATED'
  | 'USER_SUSPENDED'
  | 'MFA_CHANGED'
  | 'LOGIN_FAILED'
  | 'SENSITIVE_EXPORT'
  | 'DOCUMENT_EXPORTED'
  | 'DOCUMENT_VOIDED'
  | 'VENDOR_APPROVED'
  | 'VENDOR_SUSPENDED'
  | 'REFUND_PROCESSED'
  | 'FIRM_SETTING_CHANGED'
  | 'IMPERSONATION_STARTED'
  | 'IMPERSONATION_ENDED'
  | 'STEP_UP_VERIFIED'
  | 'STEP_UP_FAILED'
  // Field-work location tracking lifecycle. Raw GPS points live in
  // field_location_points (migration 0080) and never touch the audit
  // log - only meaningful lifecycle transitions and sensitive-history
  // access are recorded here.
  | 'FIELD_LOCATION_PERMISSION_GRANTED'
  | 'FIELD_LOCATION_PERMISSION_DENIED'
  | 'FIELD_LOCATION_SESSION_STARTED'
  | 'FIELD_LOCATION_ARRIVAL_CONFIRMED'
  | 'FIELD_LOCATION_SESSION_ENDED'
  | 'FIELD_LOCATION_HISTORY_VIEWED'
  | 'FIELD_LOCATION_HISTORY_EXPORTED'

export type SecuritySeverity = 'info' | 'notice' | 'warning' | 'critical'

export interface RecordSecurityEventInput {
  actor: SessionUser | { id: string; impersonated_by_user_id?: string | null }
  event: SecurityEventKey
  severity?: SecuritySeverity
  resourceType?: string
  resourceId?: string
  reason?: string
  metadata?: Record<string, unknown>
  auditLogId?: string
  request?: Request
}

// Write one security_events row. Callers that already insert an
// audit_log row for the same action should pass auditLogId so the two
// stay linked (audit_log remains the system of record; security_events
// is the projection). Never pass sensitive material (raw bank numbers,
// tokens, government IDs, OTPs) in reason or metadata - the audit
// pipeline treats those columns as human-readable.
export async function recordSecurityEvent(env: Env, input: RecordSecurityEventInput): Promise<string> {
  const id = randomId('sev')
  const impersonator = 'impersonated_by_user_id' in input.actor
    ? (input.actor.impersonated_by_user_id ?? null)
    : null
  const geo = geoFromRequest(input.request)
  const severity: SecuritySeverity = input.severity ?? defaultSeverityFor(input.event)
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null

  await env.DB.prepare(
    `INSERT INTO security_events
       (id, audit_log_id, actor_user_id, impersonator_id, event_key, severity,
        resource_type, resource_id, reason, metadata_json,
        actor_ip, actor_city, actor_region, actor_country)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    input.auditLogId ?? null,
    input.actor.id,
    impersonator,
    input.event,
    severity,
    input.resourceType ?? null,
    input.resourceId ?? null,
    input.reason ?? null,
    metadataJson,
    geo.ip,
    geo.city,
    geo.region,
    geo.country,
  ).run()
  return id
}

function defaultSeverityFor(event: SecurityEventKey): SecuritySeverity {
  switch (event) {
    case 'BANKING_REVEALED':
    case 'REFUND_PROCESSED':
    case 'IMPERSONATION_STARTED':
    case 'STEP_UP_FAILED':
    case 'FIELD_LOCATION_HISTORY_EXPORTED':
      return 'warning'
    case 'USER_SUSPENDED':
    case 'VENDOR_SUSPENDED':
    case 'LOGIN_FAILED':
    case 'FIELD_LOCATION_HISTORY_VIEWED':
      return 'notice'
    case 'PERMISSION_CHANGED':
    case 'ROLE_ASSIGNED':
    case 'ROLE_REMOVED':
    case 'FIRM_SETTING_CHANGED':
    case 'BANK_ACCOUNT_UPDATED':
      return 'notice'
    default:
      return 'info'
  }
}

interface Geo {
  ip: string | null
  city: string | null
  region: string | null
  country: string | null
}

function geoFromRequest(req?: Request): Geo {
  if (!req) return { ip: null, city: null, region: null, country: null }
  const cf = (req as unknown as { cf?: Record<string, unknown> }).cf
  const headers = req.headers
  const ip = headers.get('cf-connecting-ip') || headers.get('x-forwarded-for') || null
  const city = (cf?.city as string | undefined) ?? null
  const region = (cf?.region as string | undefined) ?? null
  const country = (cf?.country as string | undefined) ?? null
  return { ip, city, region, country }
}
