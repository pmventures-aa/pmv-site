import type { Env } from './types'

// Assigns (once) and returns a provider's human-friendly Provider ID —
// PMV-100001, PMV-100002, … — stored on team_members.provider_code. The
// counter lives in app_settings('provider_code_seq'). Assignment is
// best-effort and idempotent: an existing code is returned unchanged, and a
// unique-index collision (two signups racing for the same number) is retried
// with the next value. Returns null only if no code could be assigned.
export async function ensureProviderCode(env: Env, userId: string): Promise<string | null> {
  try {
    const existing = await env.DB.prepare('SELECT provider_code FROM team_members WHERE user_id = ?')
      .bind(userId).first<{ provider_code: string | null }>()
    if (existing?.provider_code) return existing.provider_code
    if (!existing) return null // not a team member / provider row

    for (let attempt = 0; attempt < 6; attempt++) {
      const seqRow = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'provider_code_seq'")
        .first<{ value: string | null }>()
      const next = Number(seqRow?.value || '100000') + 1
      const code = `PMV-${next}`
      await env.DB.prepare(
        "INSERT INTO app_settings(key, value) VALUES('provider_code_seq', ?) ON CONFLICT(key) DO UPDATE SET value = ?",
      ).bind(String(next), String(next)).run()
      try {
        await env.DB.prepare('UPDATE team_members SET provider_code = ? WHERE user_id = ? AND provider_code IS NULL')
          .bind(code, userId).run()
      } catch { /* unique collision — bump the counter and retry */ continue }
      const check = await env.DB.prepare('SELECT provider_code FROM team_members WHERE user_id = ?')
        .bind(userId).first<{ provider_code: string | null }>()
      if (check?.provider_code) return check.provider_code
    }
    return null
  } catch (err) {
    console.error('[provider-code] assignment failed', err)
    return null
  }
}
