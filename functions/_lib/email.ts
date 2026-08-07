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

// Thin wrapper over the Resend REST API (https://resend.com/docs/api-reference/emails/send-email).
// No-ops (logs, doesn't throw) when RESEND_API_KEY isn't set — dev/preview
// environments and any deploy before the secret is provisioned keep working,
// they just don't send. Call sites should never let an email failure fail
// the request that triggered it.
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
    if (!res.ok) {
      console.error('[email] Resend send failed', res.status, await res.text().catch(() => ''))
    }
  } catch (err) {
    console.error('[email] Resend send threw', err)
  }
}

// Best-effort notify: looks up the given staff user IDs' notification_prefs
// and emails only those with email_enabled=1 and `kind` not muted. Falls
// back to the firm-wide notify address (app_settings.firm_notify_email) if
// no staff qualify — so firm-wide events (e.g. a brand-new inquiry with no
// assignee yet) still reach someone.
export async function notifyStaff(
  env: Env,
  opts: { staffUserIds: string[]; kind: string; subject: string; html: string },
): Promise<void> {
  const { staffUserIds, kind, subject, html } = opts
  let recipients: string[] = []

  if (staffUserIds.length > 0) {
    const placeholders = staffUserIds.map(() => '?').join(',')
    const res = await env.DB.prepare(
      `SELECT u.email, np.muted_kinds, np.email_enabled
       FROM users u LEFT JOIN notification_prefs np ON np.user_id = u.id
       WHERE u.id IN (${placeholders})`,
    ).bind(...staffUserIds).all<{ email: string; muted_kinds: string | null; email_enabled: number | null }>()
    recipients = (res.results ?? [])
      .filter((r) => r.email_enabled === 1 && !(JSON.parse(r.muted_kinds || '[]') as string[]).includes(kind))
      .map((r) => r.email)
  }

  if (recipients.length === 0) {
    const setting = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'firm_notify_email'").first<{ value: string }>()
    if (setting?.value) recipients = [setting.value]
  }

  await Promise.all(recipients.map((to) => sendEmail(env, { to, subject, html })))
}
