import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'

// Unified stats + reporting for the Communications Hub.
// Data sources:
//   - message_threads / thread_messages / thread_reads : two-way conversations
//   - comms_messages / comms_recipients                : outbound email center
//   - activity_events                                   : org-wide activity
export const communicationsHubRoutes = new Hono<AppEnv>()

communicationsHubRoutes.get('/communications/overview', requireStaff, async (c) => {
  const me = c.get('user')
  const now = Date.now()
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString().replace('T', ' ').slice(0, 19)
  const dayAgo = new Date(now - 86_400_000).toISOString().replace('T', ' ').slice(0, 19)

  const [unreadThreads, activeThreads, agingThreads, campaignsThisWeek, sentThisWeek, avgResponse] = await Promise.all([
    // Threads with new messages since I last read them
    c.env.DB.prepare(`
      SELECT COUNT(*) n FROM message_threads t
      LEFT JOIN thread_reads r ON r.thread_id = t.id AND r.user_id = ?
      WHERE t.last_message_at > COALESCE(r.last_read_at, '1970-01-01')
    `).bind(me.id).first() as Promise<{ n: number } | null>,

    // Threads with any activity in the last 7 days
    c.env.DB.prepare(`SELECT COUNT(*) n FROM message_threads WHERE last_message_at > ?`).bind(weekAgo).first() as Promise<{ n: number } | null>,

    // Threads where the last message was FROM a client and it's been >24h with no staff response
    c.env.DB.prepare(`
      SELECT COUNT(DISTINCT t.id) n FROM message_threads t
      JOIN thread_messages m ON m.thread_id = t.id
      WHERE m.created_at = t.last_message_at
        AND m.sender_user_id = t.client_user_id
        AND t.last_message_at < ?
        AND t.last_message_at > ?
    `).bind(dayAgo, weekAgo).first() as Promise<{ n: number } | null>,

    c.env.DB.prepare(`SELECT COUNT(*) n FROM comms_messages WHERE status = 'sent' AND sent_at > ?`).bind(weekAgo).first() as Promise<{ n: number } | null>,

    c.env.DB.prepare(`SELECT COUNT(*) n FROM comms_recipients WHERE status = 'sent' AND sent_at > ?`).bind(weekAgo).first() as Promise<{ n: number } | null>,

    // Rough average staff response time in minutes over the past week:
    // for each client-authored message that got a staff reply within 7 days,
    // take the delta between it and the next message in the thread.
    c.env.DB.prepare(`
      SELECT AVG((julianday(reply.created_at) - julianday(prev.created_at)) * 24 * 60) minutes
      FROM thread_messages prev
      JOIN message_threads t ON t.id = prev.thread_id
      JOIN thread_messages reply ON reply.thread_id = prev.thread_id
        AND reply.created_at > prev.created_at
        AND reply.sender_user_id != t.client_user_id
        AND reply.id = (
          SELECT id FROM thread_messages n
          WHERE n.thread_id = prev.thread_id AND n.created_at > prev.created_at
          ORDER BY n.created_at ASC LIMIT 1
        )
      WHERE prev.sender_user_id = t.client_user_id
        AND prev.created_at > ?
    `).bind(weekAgo).first() as Promise<{ minutes: number | null } | null>,
  ])

  return c.json({
    unread_threads: Number(unreadThreads?.n ?? 0),
    active_threads_7d: Number(activeThreads?.n ?? 0),
    aging_threads: Number(agingThreads?.n ?? 0),
    campaigns_sent_7d: Number(campaignsThisWeek?.n ?? 0),
    emails_sent_7d: Number(sentThisWeek?.n ?? 0),
    avg_response_minutes: avgResponse?.minutes != null ? Math.round(avgResponse.minutes) : null,
    generated_at: new Date().toISOString(),
  })
})

communicationsHubRoutes.get('/communications/reporting', requireStaff, async (c) => {
  const rangeParam = c.req.query('range') || '7d'
  const days = rangeParam === '30d' ? 30 : rangeParam === '14d' ? 14 : 7
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().replace('T', ' ').slice(0, 19)

  const [dailyThreadVolume, dailyEmailVolume, topResponders, agingList] = await Promise.all([
    c.env.DB.prepare(`
      SELECT substr(created_at, 1, 10) day, COUNT(*) n
      FROM thread_messages WHERE created_at > ? GROUP BY day ORDER BY day
    `).bind(cutoff).all(),

    c.env.DB.prepare(`
      SELECT substr(sent_at, 1, 10) day, COUNT(*) n
      FROM comms_recipients WHERE status = 'sent' AND sent_at > ? GROUP BY day ORDER BY day
    `).bind(cutoff).all(),

    c.env.DB.prepare(`
      SELECT u.id, u.full_name, u.email, COUNT(*) reply_count
      FROM thread_messages m
      JOIN users u ON u.id = m.sender_user_id
      JOIN message_threads t ON t.id = m.thread_id
      WHERE m.sender_user_id != t.client_user_id
        AND m.created_at > ?
      GROUP BY u.id ORDER BY reply_count DESC LIMIT 8
    `).bind(cutoff).all(),

    c.env.DB.prepare(`
      SELECT t.id, t.subject, t.client_user_id, u.full_name client_name, u.email client_email, t.last_message_at
      FROM message_threads t
      JOIN thread_messages m ON m.thread_id = t.id AND m.created_at = t.last_message_at
      JOIN users u ON u.id = t.client_user_id
      WHERE m.sender_user_id = t.client_user_id
        AND t.last_message_at < datetime('now', '-1 day')
        AND t.last_message_at > ?
      ORDER BY t.last_message_at ASC LIMIT 25
    `).bind(cutoff).all(),
  ])

  return c.json({
    range_days: days,
    daily_thread_volume: (dailyThreadVolume.results || []) as any[],
    daily_email_volume: (dailyEmailVolume.results || []) as any[],
    top_responders: (topResponders.results || []) as any[],
    aging_threads: (agingList.results || []) as any[],
  })
})
