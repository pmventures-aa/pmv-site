import type { Env } from './types'

// Outbound notification emails interpolate user-supplied text (contact-form
// fields, a client's display name) directly into an HTML body — escape it
// first so a submitter can't inject markup/links into what staff see.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Thin wrapper over the Resend REST API.
// No-ops (logs, doesn't throw) when RESEND_API_KEY isn't set — dev/preview
// environments and any deploy before the secret is provisioned keep working.
export async function sendEmail(env: Env, opts: { to: string; subject: string; html: string }): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log('[email] RESEND_API_KEY not set — skipping send', { to: opts.to, subject: opts.subject })
    return
  }
  const from = env.RESEND_FROM_EMAIL || 'Pinnacle Management Ventures <notifications@pinnaclemanagementventures.com>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
    })
    if (!res.ok) console.error('[email] Resend send failed', res.status, await res.text().catch(() => ''))
  } catch (err) {
    console.error('[email] Resend send threw', err)
  }
}

export type NotificationFallbackMode = 'no_recipients' | 'no_staff'

// Best-effort notify. Individual staff notification preferences remain the
// source of truth. `no_staff` is used for service applications: an assigned
// rep who has email disabled must stay disabled; only a genuinely unassigned
// client routes to the firm fallback address.
export async function notifyStaff(
  env: Env,
  opts: {
    staffUserIds: string[]
    kind: string
    subject: string
    html: string
    fallbackMode?: NotificationFallbackMode
  },
): Promise<{ recipients: string[]; usedFallback: boolean }> {
  const { staffUserIds, kind, subject, html } = opts
  const fallbackMode = opts.fallbackMode ?? 'no_recipients'
  let recipients: string[] = []
  let usedFallback = false

  if (staffUserIds.length > 0) {
    const placeholders = staffUserIds.map(() => '?').join(',')
    const res = await env.DB.prepare(
      `SELECT u.email, np.muted_kinds, np.email_enabled
       FROM users u LEFT JOIN notification_prefs np ON np.user_id = u.id
       WHERE u.id IN (${placeholders})`,
    ).bind(...staffUserIds).all<{ email: string; muted_kinds: string | null; email_enabled: number | null }>()
    recipients = (res.results ?? [])
      .filter((r) => {
        let muted: string[] = []
        try { muted = JSON.parse(r.muted_kinds || '[]') as string[] } catch { muted = [] }
        return r.email_enabled === 1 && !muted.includes(kind)
      })
      .map((r) => r.email)
  }

  const shouldFallback = fallbackMode === 'no_staff' ? staffUserIds.length === 0 : recipients.length === 0
  if (shouldFallback) {
    const setting = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'firm_notify_email'").first<{ value: string }>()
    if (setting?.value) {
      recipients = [setting.value]
      usedFallback = true
    }
  }

  await Promise.all(recipients.map((to) => sendEmail(env, { to, subject, html })))
  return { recipients, usedFallback }
}
