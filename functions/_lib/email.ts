import type { Env } from './types'

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export async function sendEmailStrict(env: Env, opts: { to: string; subject: string; html: string }): Promise<string | null> {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured')
  }
  // Replies can continue landing in the Apple-hosted orders@ inbox. Resend is
  // only the authenticated sender for application-generated mail.
  const from = env.RESEND_FROM_EMAIL || 'Pinnacle Management Ventures <orders@pinnaclemanagementventures.com>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
  })
  const payload = await res.json<any>().catch(() => ({}))
  if (!res.ok || !payload?.id) {
    throw new Error(payload?.message || `Resend send failed (${res.status})`)
  }
  return payload.id as string
}

// Notification emails remain best-effort: a provider outage should never make
// the underlying client/application action fail. The Communications Center uses
// sendEmailStrict instead so campaign history never claims a failed delivery was sent.
export async function sendEmail(env: Env, opts: { to: string; subject: string; html: string }): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log('[email] RESEND_API_KEY not set — skipping send', { to: opts.to, subject: opts.subject })
    return
  }
  try {
    await sendEmailStrict(env, opts)
  } catch (err) {
    console.error('[email] send failed', err)
  }
}

export type NotificationFallbackMode = 'no_recipients' | 'no_staff'

export function shouldUseNotificationFallback(
  staffUserIds: string[],
  recipients: string[],
  mode: NotificationFallbackMode,
): boolean {
  return mode === 'no_staff' ? staffUserIds.length === 0 : recipients.length === 0
}

export async function notifyStaff(
  env: Env,
  opts: { staffUserIds: string[]; kind: string; subject: string; html: string; fallbackMode?: NotificationFallbackMode },
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
    recipients = (res.results ?? []).filter((row) => {
      let muted: string[] = []
      try { muted = JSON.parse(row.muted_kinds || '[]') as string[] } catch { muted = [] }
      return row.email_enabled === 1 && !muted.includes(kind)
    }).map((row) => row.email)
  }

  if (shouldUseNotificationFallback(staffUserIds, recipients, fallbackMode)) {
    const setting = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'firm_notify_email'").first<{ value: string }>()
    if (setting?.value) {
      recipients = [setting.value]
      usedFallback = true
    }
  }

  await Promise.all(recipients.map((to) => sendEmail(env, { to, subject, html })))
  return { recipients, usedFallback }
}
