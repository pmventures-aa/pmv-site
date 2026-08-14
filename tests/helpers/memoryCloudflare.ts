import type { Env } from '../../functions/_lib/types'

type Row = Record<string, unknown>

function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function normalize(sql: string) {
  return sql.replace(/\s+/g, ' ').trim()
}

function splitCsv(value: string) {
  return value.split(',').map((part) => part.trim()).filter(Boolean)
}

export class MemoryKV {
  store = new Map<string, { value: string; exp?: number }>()

  async get(key: string) {
    const row = this.store.get(key)
    if (!row) return null
    if (row.exp && row.exp < Date.now()) {
      this.store.delete(key)
      return null
    }
    return row.value
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }) {
    this.store.set(key, {
      value,
      exp: options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined,
    })
  }

  async delete(key: string) {
    this.store.delete(key)
  }

  async list({ prefix }: { prefix: string }) {
    return { keys: [...this.store.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name })) }
  }
}

class MemoryStatement {
  constructor(private db: MemoryD1, private sql: string, private params: unknown[] = []) {}

  bind(...params: unknown[]) {
    return new MemoryStatement(this.db, this.sql, params)
  }

  async first<T = Row>() {
    const rows = this.db.select(this.sql, this.params)
    return (rows[0] as T) || null
  }

  async all<T = Row>() {
    return { results: this.db.select(this.sql, this.params) as T[] }
  }

  async run() {
    this.db.exec(this.sql, this.params)
    return { success: true }
  }
}

export class MemoryD1 {
  tables: Record<string, Row[]> = {
    users: [],
    external_identities: [],
    client_profiles: [],
    relationship_parties: [],
    relationship_people: [],
    account_parties: [],
    relationship_businesses: [],
    party_relationships: [],
    audit_log: [],
    auth_sessions: [],
    activity_events: [],
    contact_inquiries: [],
    access_invites: [],
    trusted_contacts: [],
    matters: [],
    staff_assignments: [],
    app_settings: [],
  }

  prepare(sql: string) {
    return new MemoryStatement(this, sql)
  }

  async batch(statements: MemoryStatement[]) {
    for (const statement of statements) await statement.run()
    return statements.map(() => ({ success: true }))
  }

  insert(table: string, row: Row) {
    this.assertUnique(table, row)
    const defaults: Row = { created_at: now() }
    this.tables[table] = this.tables[table] || []
    this.tables[table].push({ ...defaults, ...row })
  }

  private assertUnique(table: string, row: Row, except?: Row) {
    const rows = this.tables[table] || []
    const keys: string[][] = table === 'users' ? [['id'], ['email']] : table === 'external_identities' ? [['id'], ['issuer', 'subject']] : [['id']]
    for (const cols of keys) {
      if (cols.some((col) => row[col] === undefined)) continue
      const clash = rows.find((existing) => existing !== except && cols.every((col) => existing[col] === row[col]))
      if (clash) throw new Error(`UNIQUE constraint failed: ${table}.${cols.join(', ')}`)
    }
  }

  select(sql: string, params: unknown[]): Row[] {
    const text = normalize(sql)
    const from = text.match(/FROM (\w+)/i)
    if (!from) return []
    const table = from[1]
    let rows = [...(this.tables[table] || [])]
    const where = text.match(/WHERE (.+?)(?: ORDER BY| LIMIT|$)/i)
    if (where) rows = rows.filter((row) => this.matches(where[1], row, params))
    const order = text.match(/ORDER BY (\w+)/i)
    if (order) {
      const col = order[1]
      rows.sort((a, b) => String(a[col] || '').localeCompare(String(b[col] || '')))
    }
    const selectList = text.slice(7, text.toUpperCase().indexOf(' FROM')).trim()
    if (selectList === '*' || selectList === '1') return rows
    return rows.map((row) => {
      const out: Row = {}
      for (const part of splitCsv(selectList)) {
        const alias = part.match(/(.+?)\s+AS\s+(\w+)/i)
        if (alias) {
          const source = alias[1].trim()
          out[alias[2]] = source === '1' ? 1 : row[source]
        } else if (part.includes('.')) {
          const col = part.split('.')[1]
          out[col] = row[col]
        } else if (part !== '1') {
          out[part] = row[part]
        } else {
          out['1'] = 1
        }
      }
      return Object.keys(out).length ? { ...row, ...out } : row
    })
  }

  exec(sql: string, params: unknown[]) {
    const text = normalize(sql)
    if (/^INSERT INTO/i.test(text)) {
      const match = text.match(/INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\((.+)\)/i)
      if (!match) return
      const table = match[1]
      const cols = splitCsv(match[2])
      const row: Row = {}
      let paramIdx = 0
      for (const col of cols) {
        const token = splitCsv(match[3])[cols.indexOf(col)]
        if (token === '?') row[col] = params[paramIdx++]
        else if (/datetime\('now'\)/i.test(token)) row[col] = now()
        else if (token === 'NULL') row[col] = null
        else row[col] = token.replace(/^['"]|['"]$/g, '')
      }
      this.insert(table, row)
      return
    }
    if (/^UPDATE/i.test(text)) {
      const match = text.match(/UPDATE (\w+) SET (.+?)(?: WHERE (.+))?$/i)
      if (!match) return
      const table = match[1]
      const assignments = splitCsv(match[2])
      const setCount = assignments.filter((part) => part.endsWith('?')).length
      const whereParams = match[3] ? params.slice(setCount) : []
      const setParams = params.slice(0, setCount)
      for (const row of this.tables[table] || []) {
        if (match[3] && !this.matches(match[3], row, whereParams)) continue
        let idx = 0
        for (const assignment of assignments) {
          const [col, expr] = assignment.split('=').map((part) => part.trim())
          if (expr === '?') row[col] = setParams[idx++]
          else if (/datetime\('now'\)/i.test(expr)) row[col] = now()
          else if (/^COALESCE\(/i.test(expr)) {
            // leave existing unless we bound a replacement; tests don't rely on inquiry coalesce
          }
        }
      }
      return
    }
    if (/^DELETE FROM/i.test(text)) {
      const match = text.match(/DELETE FROM (\w+) WHERE (.+)$/i)
      if (!match) return
      const table = match[1]
      this.tables[table] = (this.tables[table] || []).filter((row) => !this.matches(match[2], row, params))
    }
  }

  private matches(where: string, row: Row, params: unknown[]) {
    const clauses = where.split(/ AND /i).map((part) => part.trim())
    let idx = 0
    return clauses.every((clause) => {
      const eq = clause.match(/^(\w+)\s*=\s*\?$/)
      if (eq) return String(row[eq[1]] ?? '') === String(params[idx++] ?? '')
      const lower = clause.match(/^lower\((\w+)\)\s*=\s*lower\(\?\)$/i)
      if (lower) return String(row[lower[1]] || '').toLowerCase() === String(params[idx++] || '').toLowerCase()
      const isNull = clause.match(/^(\w+)\s+IS NULL$/i)
      if (isNull) return row[isNull[1]] == null
      if (/datetime\('now'\)/i.test(clause)) return true
      return true
    })
  }
}

export function createTestEnv(overrides: Partial<Env> = {}): Env & { DB: MemoryD1; SESSIONS: MemoryKV } {
  const DB = new MemoryD1()
  const SESSIONS = new MemoryKV()
  return {
    DB: DB as unknown as D1Database & MemoryD1,
    SESSIONS: SESSIONS as unknown as KVNamespace & MemoryKV,
    SESSION_SECRET: 'local-dev-testing-secret-not-real-auth0',
    PAYMENT_ENCRYPTION_KEY: 'local-dev-payment-key-not-real-either',
    AUTH0_DOMAIN: 'tenant.auth0.com',
    AUTH0_CLIENT_ID: 'auth0-client-id',
    AUTH0_CLIENT_SECRET: 'auth0-client-secret',
    AUTH0_CALLBACK_URL: 'https://www.pinnaclemanagementventures.com/api/auth/auth0/callback',
    AUTH0_LOGOUT_URL: 'https://www.pinnaclemanagementventures.com/portal/login',
    AUTH0_ENABLED_CONNECTIONS: 'google-oauth2,windowslive',
    ...overrides,
  } as Env & { DB: MemoryD1; SESSIONS: MemoryKV }
}
