import type { Env } from '../types'
import { uuid } from '../crypto'
import type { Auth0Db, Auth0UserRow, ExternalIdentityRow, PendingInviteRow } from './identity'

export function d1Auth0Db(env: Env): Auth0Db {
  return {
    async findIdentity(issuer, subject) {
      return env.DB.prepare(
        'SELECT id, user_id, provider, issuer, subject, email, email_verified, created_at, last_login_at FROM external_identities WHERE issuer = ? AND subject = ?',
      ).bind(issuer, subject).first<ExternalIdentityRow>()
    },
    async insertIdentity(row) {
      try {
        await env.DB.prepare(
          `INSERT INTO external_identities (id, user_id, provider, issuer, subject, email, email_verified, last_login_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
        ).bind(row.id, row.user_id, row.provider, row.issuer, row.subject, row.email, row.email_verified, row.last_login_at ?? null).run()
        return 'ok'
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/unique|constraint/i.test(message)) return 'conflict'
        throw error
      }
    },
    async updateIdentityLogin(id) {
      await env.DB.prepare("UPDATE external_identities SET last_login_at = datetime('now') WHERE id = ?").bind(id).run()
    },
    async listIdentities(userId) {
      const res = await env.DB.prepare(
        'SELECT id, user_id, provider, issuer, subject, email, email_verified, created_at, last_login_at FROM external_identities WHERE user_id = ? ORDER BY created_at',
      ).bind(userId).all<ExternalIdentityRow>()
      return res.results ?? []
    },
    async deleteIdentity(id, userId) {
      const result = await env.DB.prepare('DELETE FROM external_identities WHERE id = ? AND user_id = ?').bind(id, userId).run()
      return (result.meta?.changes ?? 0) > 0
    },
    async findUserById(id) {
      return env.DB.prepare(
        'SELECT id, email, role, status, full_name, first_name, last_name, password_hash FROM users WHERE id = ?',
      ).bind(id).first<Auth0UserRow>()
    },
    async findUserByEmail(email) {
      return env.DB.prepare(
        'SELECT id, email, role, status, full_name, first_name, last_name, password_hash FROM users WHERE lower(email) = lower(?)',
      ).bind(email).first<Auth0UserRow>()
    },
    async insertUser(row) {
      const tos = 'tos_accepted' in row && row.tos_accepted ? "datetime('now')" : 'NULL'
      const personPartyId = uuid()
      const profileId = uuid()
      try {
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO users (id, email, password_hash, role, full_name, first_name, last_name, two_factor_enabled, status, tos_accepted_at)
             VALUES (?, ?, NULL, ?, ?, ?, ?, 0, ?, ${tos})`,
          ).bind(row.id, row.email, row.role, row.full_name, row.first_name, row.last_name, row.status),
          ...(row.role === 'client'
            ? [
              env.DB.prepare('INSERT INTO client_profiles (id, user_id, onboarding_completed) VALUES (?, ?, 0)').bind(profileId, row.id),
              env.DB.prepare("INSERT INTO relationship_parties(id,party_type,display_name,email) VALUES (?,'person',?,?)").bind(personPartyId, row.full_name || row.email, row.email),
              env.DB.prepare('INSERT INTO relationship_people(party_id,first_name,last_name) VALUES (?,?,?)').bind(personPartyId, row.first_name, row.last_name),
              env.DB.prepare("INSERT INTO account_parties(user_id,party_id,access_role,is_primary) VALUES (?,?,'self',1)").bind(row.id, personPartyId),
              env.DB.prepare('UPDATE client_profiles SET primary_party_id=? WHERE user_id=?').bind(personPartyId, row.id),
            ]
            : []),
        ])
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/unique|constraint/i.test(message)) {
          const err = new Error('email_conflict')
          err.name = 'EmailConflictError'
          throw err
        }
        throw error
      }
    },
    async updateUserLogin(id) {
      await env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(id).run()
    },
    async findPendingInvite(email) {
      return env.DB.prepare(
        `SELECT id, invite_type, email, full_name, client_user_id, status
         FROM access_invites
         WHERE lower(email) = lower(?) AND status = 'pending' AND datetime(expires_at) > datetime('now')
         ORDER BY created_at DESC LIMIT 1`,
      ).bind(email).first<PendingInviteRow>()
    },
    async acceptInvite(inviteId, userId) {
      await env.DB.prepare(
        `UPDATE access_invites
         SET status = 'accepted', accepted_by_user_id = ?, accepted_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ? AND status = 'pending'`,
      ).bind(userId, inviteId).run()
    },
    async activateTrustedContact(inviteId, clientUserId, userId, fullName) {
      await env.DB.prepare(
        `UPDATE trusted_contacts
         SET contact_user_id = ?, full_name = ?, status = 'active', accepted_at = datetime('now'), updated_at = datetime('now')
         WHERE invite_id = ? AND client_user_id = ?`,
      ).bind(userId, fullName, inviteId, clientUserId).run()
    },
  }
}
