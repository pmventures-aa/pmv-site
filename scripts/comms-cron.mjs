#!/usr/bin/env node
// Flushes due Communications Center sends (functions/_lib/routes/comms.ts).
//
// Cloudflare Pages Functions have no cron/scheduled handler (only plain
// Workers do), so scheduled/recurring campaigns are driven from here
// instead — a GitHub Actions `schedule:` trigger runs this on a timer
// (.github/workflows/comms-cron.yml). It talks to D1 over Cloudflare's
// REST API (not a binding, since this runs as a plain Node script outside
// the Workers runtime) and to Resend directly, mirroring — deliberately
// duplicating, since the two runtimes can't share a module — the audience
// resolution and send logic in comms.ts.
//
// Env required: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID,
// CLOUDFLARE_D1_DATABASE_ID, RESEND_API_KEY, RESEND_FROM_EMAIL.

const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, RESEND_API_KEY, RESEND_FROM_EMAIL } = process.env

for (const [name, value] of Object.entries({ CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, RESEND_API_KEY, RESEND_FROM_EMAIL })) {
  if (!value) {
    console.error(`missing required env var: ${name}`)
    process.exit(1)
  }
}

async function d1(sql, params = []) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${CLOUDFLARE_D1_DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    },
  )
  const json = await res.json()
  if (!json.success) throw new Error(`D1 query failed: ${JSON.stringify(json.errors)}`)
  return json.result?.[0]?.results ?? []
}

function uuid() {
  return crypto.randomUUID()
}

async function resolveAudience(audience) {
  const byId = new Map()
  for (const segment of audience.segments ?? []) {
    let where = ''
    const params = []
    if (segment === 'all_employees') {
      where = "u.role IN ('staff','admin') AND u.status = 'active' AND (tm.party_type IS NULL OR tm.party_type = 'employee')"
    } else if (segment === 'all_vendors') {
      where = "u.role = 'staff' AND u.status = 'active' AND tm.party_type = 'vendor'"
    } else if (segment.startsWith('vendor_category:')) {
      where = "u.role = 'staff' AND u.status = 'active' AND tm.party_type = 'vendor' AND tm.vendor_category = ?"
      params.push(segment.slice('vendor_category:'.length))
    } else {
      continue
    }
    const rows = await d1(`SELECT u.id, u.email, u.full_name FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id WHERE ${where}`, params)
    for (const row of rows) byId.set(row.id, row)
  }
  const explicitIds = (audience.user_ids ?? []).filter((id) => !byId.has(id))
  if (explicitIds.length > 0) {
    const placeholders = explicitIds.map(() => '?').join(',')
    const rows = await d1(`SELECT id, email, full_name FROM users WHERE id IN (${placeholders}) AND status = 'active'`, explicitIds)
    for (const row of rows) byId.set(row.id, row)
  }
  return [...byId.values()]
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

function nextOccurrence(fromIso, recurrence) {
  const d = new Date(fromIso)
  if (recurrence === 'daily') d.setUTCDate(d.getUTCDate() + 1)
  else if (recurrence === 'weekly') d.setUTCDate(d.getUTCDate() + 7)
  else if (recurrence === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString()
}

async function main() {
  const due = await d1("SELECT * FROM comms_messages WHERE status = 'queued' AND next_run_at IS NOT NULL AND next_run_at <= datetime('now')")
  if (due.length === 0) {
    console.log('no due comms messages')
    return
  }
  console.log(`${due.length} due message(s)`)

  for (const message of due) {
    const audience = JSON.parse(message.audience_json || '{}')
    const recipients = await resolveAudience(audience)
    console.log(`message ${message.id} (${message.subject}) — ${recipients.length} recipient(s)`)

    if (recipients.length > 0) {
      for (const r of recipients) {
        await d1(
          'INSERT INTO comms_recipients (id, message_id, user_id, email, full_name) VALUES (?, ?, ?, ?, ?)',
          [uuid(), message.id, r.id, r.email, r.full_name],
        )
      }
      for (const r of recipients) {
        try {
          const providerMessageId = await sendViaResend(r.email, message.subject, message.body_html)
          await d1(
            "UPDATE comms_recipients SET status = 'sent', provider_message_id = ?, sent_at = datetime('now') WHERE message_id = ? AND user_id = ?",
            [providerMessageId, message.id, r.id],
          )
        } catch (err) {
          console.error(`send failed for ${r.email}:`, err.message)
          await d1(
            "UPDATE comms_recipients SET status = 'failed', error = ? WHERE message_id = ? AND user_id = ?",
            [String(err.message).slice(0, 500), message.id, r.id],
          )
        }
      }
    }

    if (message.recurrence) {
      const next = nextOccurrence(message.next_run_at, message.recurrence)
      await d1("UPDATE comms_messages SET next_run_at = ?, last_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [next, message.id])
      console.log(`  recurring (${message.recurrence}) — next run ${next}`)
    } else {
      await d1("UPDATE comms_messages SET status = 'sent', sent_at = datetime('now'), last_sent_at = datetime('now'), next_run_at = NULL, updated_at = datetime('now') WHERE id = ?", [message.id])
      console.log('  one-time — marked sent')
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
