#!/usr/bin/env node
// Flushes due Communications Center sends. Scheduled/recurring delivery runs
// outside the Pages Functions runtime, so this mirrors the same CRM audience
// and suppression rules used by functions/_lib/routes/comms.ts.

const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, RESEND_API_KEY, RESEND_FROM_EMAIL } = process.env

for (const [name, value] of Object.entries({ CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, RESEND_API_KEY, RESEND_FROM_EMAIL })) {
  if (!value) {
    console.error(`missing required env var: ${name}`)
    process.exit(1)
  }
}

async function d1(sql, params = []) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${CLOUDFLARE_D1_DATABASE_ID}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(`D1 query failed: ${JSON.stringify(json.errors)}`)
  return json.result?.[0]?.results ?? []
}

function uuid() { return crypto.randomUUID() }

function messageType(value) {
  return value === 'operational' || value === 'internal' ? value : 'marketing'
}

function userEligible(row, type) {
  if (row.status !== 'active') return false
  if (type === 'internal') return row.role === 'staff' || row.role === 'admin'
  const status = row.marketing_email_status || 'emailable'
  if (type === 'marketing') return status === 'emailable'
  return !['bounced', 'suppressed'].includes(status)
}

function leadEligible(row, type) {
  if (type === 'internal' || row.client_user_id || row.archived_at) return false
  const status = row.email_status || 'emailable'
  if (type === 'marketing') return status === 'emailable'
  return !['bounced', 'suppressed'].includes(status)
}

function addUser(byEmail, row, type) {
  if (!row?.email || !userEligible(row, type)) return
  const email = String(row.email).trim().toLowerCase()
  byEmail.set(email, { recipient_kind: 'user', user_id: row.id, inquiry_id: null, email, full_name: row.full_name ?? null, role: row.role ?? null })
}

function addLead(byEmail, row, type) {
  if (!row?.email || !leadEligible(row, type)) return
  const email = String(row.email).trim().toLowerCase()
  if (byEmail.get(email)?.recipient_kind === 'user') return
  byEmail.set(email, { recipient_kind: 'lead', user_id: null, inquiry_id: row.id, email, full_name: row.name ?? row.company_name ?? null, role: null })
}

async function resolveDynamicList(list) {
  let filter = {}
  try { filter = list.filter_json ? JSON.parse(list.filter_json) : {} } catch { filter = {} }
  const clauses = ['ci.client_user_id IS NULL', 'ci.archived_at IS NULL']
  const params = []
  const fields = {
    record_type: 'ci.record_type', lifecycle_stage: 'ci.lifecycle_stage', status: 'ci.status', source: 'ci.source', service_key: 'ci.service_key', owner_staff_user_id: 'ci.owner_staff_user_id', email_status: 'ci.email_status',
  }
  for (const [key, column] of Object.entries(fields)) {
    if (filter[key]) { clauses.push(`${column} = ?`); params.push(filter[key]) }
  }
  if (filter.search) {
    const q = `%${String(filter.search).slice(0, 120)}%`
    clauses.push('(ci.name LIKE ? OR ci.email LIKE ? OR ci.company_name LIKE ? OR ci.phone LIKE ?)')
    params.push(q, q, q, q)
  }
  return d1(`SELECT ci.* FROM contact_inquiries ci WHERE ${clauses.join(' AND ')} LIMIT 10000`, params)
}

async function resolveAudience(audience, type) {
  const byEmail = new Map()
  for (const segment of audience.segments ?? []) {
    if (segment === 'all_employees' || segment === 'all_vendors' || segment.startsWith('vendor_category:')) {
      let where = ''
      const params = []
      if (segment === 'all_employees') where = "u.role IN ('staff','admin') AND (tm.party_type IS NULL OR tm.party_type = 'employee')"
      else if (segment === 'all_vendors') where = "u.role = 'staff' AND tm.party_type = 'vendor'"
      else { where = "u.role = 'staff' AND tm.party_type = 'vendor' AND tm.vendor_category = ?"; params.push(segment.slice('vendor_category:'.length)) }
      const rows = await d1(`SELECT u.id, u.email, u.full_name, u.role, u.status, u.marketing_email_status FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id WHERE ${where}`, params)
      for (const row of rows) addUser(byEmail, row, type)
      continue
    }

    if (segment === 'all_clients') {
      const rows = await d1("SELECT id, email, full_name, role, status, marketing_email_status FROM users WHERE role = 'client'")
      for (const row of rows) addUser(byEmail, row, type)
      continue
    }

    let leadWhere = null
    const params = []
    if (segment === 'all_leads') leadWhere = 'client_user_id IS NULL AND archived_at IS NULL'
    else if (segment.startsWith('lifecycle:')) { leadWhere = 'client_user_id IS NULL AND archived_at IS NULL AND lifecycle_stage = ?'; params.push(segment.slice('lifecycle:'.length)) }
    else if (segment.startsWith('lead_status:')) { leadWhere = 'client_user_id IS NULL AND archived_at IS NULL AND status = ?'; params.push(segment.slice('lead_status:'.length)) }
    else if (segment.startsWith('record_type:')) { leadWhere = 'client_user_id IS NULL AND archived_at IS NULL AND record_type = ?'; params.push(segment.slice('record_type:'.length)) }
    if (leadWhere) {
      const rows = await d1(`SELECT * FROM contact_inquiries WHERE ${leadWhere}`, params)
      for (const row of rows) addLead(byEmail, row, type)
    }
  }

  const listIds = [...new Set(audience.list_ids ?? [])].slice(0, 5000)
  if (listIds.length) {
    const placeholders = listIds.map(() => '?').join(',')
    const lists = await d1(`SELECT * FROM crm_lists WHERE id IN (${placeholders}) AND archived_at IS NULL`, listIds)
    for (const list of lists) {
      const rows = list.list_type === 'dynamic'
        ? await resolveDynamicList(list)
        : await d1('SELECT ci.* FROM crm_list_members lm JOIN contact_inquiries ci ON ci.id = lm.inquiry_id WHERE lm.list_id = ? AND ci.archived_at IS NULL', [list.id])
      for (const row of rows) addLead(byEmail, row, type)
    }
  }

  const userIds = [...new Set(audience.user_ids ?? [])].slice(0, 5000)
  if (userIds.length) {
    const placeholders = userIds.map(() => '?').join(',')
    const rows = await d1(`SELECT id, email, full_name, role, status, marketing_email_status FROM users WHERE id IN (${placeholders})`, userIds)
    for (const row of rows) addUser(byEmail, row, type)
  }

  const inquiryIds = [...new Set(audience.inquiry_ids ?? [])].slice(0, 5000)
  if (inquiryIds.length) {
    const placeholders = inquiryIds.map(() => '?').join(',')
    const rows = await d1(`SELECT * FROM contact_inquiries WHERE id IN (${placeholders})`, inquiryIds)
    for (const row of rows) addLead(byEmail, row, type)
  }

  return [...byEmail.values()]
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

async function getMarketingConfig() {
  const rows = await d1("SELECT key, value FROM app_settings WHERE key IN ('business_address', 'marketing_public_base_url')")
  const values = new Map(rows.map((row) => [row.key, String(row.value || '').trim()]))
  const businessAddress = values.get('business_address') || ''
  if (!businessAddress) throw new Error('Marketing email blocked: HQ Settings → General → Business address is empty.')
  const publicBaseUrl = (values.get('marketing_public_base_url') || 'https://www.pinnaclemanagementventures.com').replace(/\/$/, '')
  return { businessAddress, publicBaseUrl }
}

async function marketingHtml(html, email, config) {
  const token = uuid()
  await d1('INSERT INTO email_unsubscribe_tokens (token, email) VALUES (?, ?)', [token, String(email).trim().toLowerCase()])
  const url = `${config.publicBaseUrl}/api/unsubscribe/${encodeURIComponent(token)}`
  return `${html}
<hr style="margin:32px 0 18px;border:0;border-top:1px solid #d9d9d9">
<p style="font-size:12px;line-height:1.6;color:#666;margin:0">Business/marketing communication from Pinnacle Management Ventures.<br>${escapeHtml(config.businessAddress)}<br><a href="${escapeHtml(url)}" style="color:#666;text-decoration:underline">Unsubscribe from future marketing emails</a></p>`
}

async function sendViaResend(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to, subject, html }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.id) throw new Error(json.message || `resend send failed (${res.status})`)
  return json.id
}

function toSqliteDateTime(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
}

function nextOccurrence(fromIso, recurrence) {
  const d = new Date(String(fromIso).includes('T') ? fromIso : `${fromIso}Z`)
  if (recurrence === 'daily') d.setUTCDate(d.getUTCDate() + 1)
  else if (recurrence === 'weekly') d.setUTCDate(d.getUTCDate() + 7)
  else if (recurrence === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1)
  return toSqliteDateTime(d)
}

async function main() {
  // Normalize ISO and SQLite datetime forms so legacy rows with a "T"/"Z"
  // timestamp still become due when compared against datetime('now').
  const due = await d1(
    `SELECT * FROM comms_messages
     WHERE status = 'queued'
       AND next_run_at IS NOT NULL
       AND datetime(replace(replace(substr(next_run_at, 1, 19), 'T', ' '), 'Z', '')) <= datetime('now')`,
  )
  if (!due.length) { console.log('no due comms messages'); return }
  console.log(`${due.length} due message(s)`)

  for (const message of due) {
    const audience = JSON.parse(message.audience_json || '{}')
    const type = messageType(message.message_type)
    let compliance = null
    if (type === 'marketing') {
      try { compliance = await getMarketingConfig() }
      catch (err) {
        console.error(`message ${message.id} blocked:`, err.message)
        await d1("UPDATE comms_messages SET status = 'failed', next_run_at = NULL, updated_at = datetime('now') WHERE id = ?", [message.id])
        continue
      }
    }
    const recipients = await resolveAudience(audience, type)
    console.log(`message ${message.id} (${message.subject}) — ${recipients.length} eligible recipient(s)`)

    let sent = 0
    let failed = 0
    for (const recipient of recipients) {
      const recipientId = uuid()
      await d1(
        'INSERT INTO comms_recipients (id, message_id, user_id, inquiry_id, recipient_kind, email, full_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [recipientId, message.id, recipient.user_id, recipient.inquiry_id, recipient.recipient_kind, recipient.email, recipient.full_name],
      )
      try {
        const deliveryHtml = compliance ? await marketingHtml(message.body_html, recipient.email, compliance) : message.body_html
        const providerMessageId = await sendViaResend(recipient.email, message.subject, deliveryHtml)
        await d1("UPDATE comms_recipients SET status = 'sent', provider_message_id = ?, sent_at = datetime('now') WHERE id = ?", [providerMessageId, recipientId])
        sent += 1
        if (recipient.recipient_kind === 'lead' && recipient.inquiry_id) {
          await d1('INSERT INTO email_log (id, inquiry_id, sent_by_user_id, to_address, subject, body) VALUES (?, ?, ?, ?, ?, ?)', [uuid(), recipient.inquiry_id, message.created_by_user_id, recipient.email, message.subject, deliveryHtml])
          await d1("UPDATE contact_inquiries SET last_contacted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [recipient.inquiry_id])
        } else if (recipient.user_id && recipient.role === 'client') {
          await d1('INSERT INTO email_log (id, client_user_id, sent_by_user_id, to_address, subject, body) VALUES (?, ?, ?, ?, ?, ?)', [uuid(), recipient.user_id, message.created_by_user_id, recipient.email, message.subject, deliveryHtml])
        }
      } catch (err) {
        failed += 1
        console.error(`send failed for ${recipient.email}:`, err.message)
        await d1("UPDATE comms_recipients SET status = 'failed', error = ? WHERE id = ?", [String(err.message).slice(0, 500), recipientId])
      }
    }

    if (message.recurrence) {
      const next = nextOccurrence(message.next_run_at, message.recurrence)
      await d1("UPDATE comms_messages SET next_run_at = ?, last_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [next, message.id])
      console.log(`  recurring (${message.recurrence}) — next run ${next}`)
    } else {
      const status = failed > 0 && sent > 0 ? 'partial' : failed > 0 || recipients.length === 0 ? 'failed' : 'sent'
      await d1("UPDATE comms_messages SET status = ?, sent_at = datetime('now'), last_sent_at = datetime('now'), next_run_at = NULL, updated_at = datetime('now') WHERE id = ?", [status, message.id])
      console.log(`  one-time — marked ${status} (sent=${sent}, failed=${failed})`)
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
