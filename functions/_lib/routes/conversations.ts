import { Hono } from 'hono'
import type { AppEnv, Env, SessionUser } from '../types'
import { requireUser } from '../mid'
import { uuid } from '../crypto'
import { logActivity } from '../activity'
import { pushNotification } from '../notificationFeed'

export const conversationRoutes = new Hono<AppEnv>()
conversationRoutes.use('*', requireUser)

const clean = (v: unknown, n: number) => typeof v === 'string' ? v.trim().slice(0, n) : ''
const isStaffLike = (role: string) => role === 'staff' || role === 'admin' || role === 'owner'

// Every endpoint below trusts this one function for participant scope.
// A user can see a conversation only if:
//   - they are an active participant, OR
//   - they are admin/owner (full read), OR
//   - they are staff AND the conversation's scope_client is in their assignment scope
async function loadConversation(env: Env, user: SessionUser, id: string) {
  const row = await env.DB.prepare(
    `SELECT c.*, cp.role_in_conv me_role_in_conv
     FROM conversations c
     LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ? AND cp.removed_at IS NULL
     WHERE c.id = ?`
  ).bind(user.id, id).first() as any
  if (!row) return { ok: false as const, status: 404, error: 'not found' }
  const isParticipant = !!row.me_role_in_conv
  if (isParticipant) return { ok: true as const, conversation: row, isParticipant, canSeeInternalNotes: isStaffLike(user.role) }
  if (user.role === 'admin') return { ok: true as const, conversation: row, isParticipant: false, canSeeInternalNotes: true }
  if (isStaffLike(user.role) && row.scope_client_user_id) {
    const assigned = await env.DB.prepare('SELECT 1 FROM staff_assignments WHERE staff_user_id=? AND client_user_id=?').bind(user.id, row.scope_client_user_id).first()
    if (assigned) return { ok: true as const, conversation: row, isParticipant: false, canSeeInternalNotes: true }
  }
  return { ok: false as const, status: 403, error: 'forbidden' }
}

// Simple markdown -> html renderer. Kept intentionally minimal because
// full markdown is out of scope for this PR and the frontend will render
// a WYSIWYG-lite that emits the same subset. Escapes HTML aggressively.
function renderBody(md: string): string {
  const esc = md.replace(/[&<>]/g, (c) => c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;')
  const withLinks = esc.replace(/\bhttps?:\/\/[^\s<]+/g, (m) => `<a href="${m}" target="_blank" rel="noopener">${m}</a>`)
  const withMentions = withLinks.replace(/@([a-z0-9._-]+)/gi, (_m, u) => `<span class="pmv-mention">@${u}</span>`)
  const withBold = withMentions.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return withBold.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('')
}

async function resolveMentions(env: Env, body: string): Promise<string[]> {
  const usernames = new Set<string>()
  for (const m of body.matchAll(/@([a-z0-9._-]+)/gi)) usernames.add(m[1].toLowerCase())
  if (!usernames.size) return []
  const placeholders = [...usernames].map(() => '?').join(',')
  const res = await env.DB.prepare(`SELECT id FROM users WHERE LOWER(email) IN (${placeholders}) OR LOWER(email) LIKE ? || '@%'`).bind(...usernames, [...usernames][0]).all()
  const ids = new Set<string>()
  for (const row of (res.results as any[]) || []) ids.add(row.id)
  // Simple email-local-part match: for each mention, try LOWER(SUBSTR(email, 1, INSTR(email,'@')-1))
  if (ids.size < usernames.size) {
    const remaining = [...usernames]
    const localMatch = await env.DB.prepare(`SELECT id, LOWER(SUBSTR(email,1,INSTR(email,'@')-1)) local FROM users`).all()
    for (const row of (localMatch.results as any[]) || []) {
      if (remaining.includes(String(row.local))) ids.add(row.id)
    }
  }
  return [...ids]
}

// GET /admin/conversations OR /portal/conversations
// Returns the calling user's conversation list, unread badge included.
conversationRoutes.get('/conversations', async (c) => {
  const user = c.get('user')
  const kindFilter = c.req.query('kind')
  const statusFilter = c.req.query('status') || 'open'
  const scopeClient = c.req.query('client_user_id')
  const search = clean(c.req.query('q'), 120)

  const clauses: string[] = ['1=1']
  const params: any[] = []

  if (isStaffLike(user.role)) {
    // Staff: any conversation they participate in OR any conversation where
    // the client is in their assignment scope (admin/owner sees all).
    if (user.role !== 'admin') {
      clauses.push(`(c.id IN (SELECT conversation_id FROM conversation_participants WHERE user_id=? AND removed_at IS NULL)
        OR c.scope_client_user_id IN (SELECT client_user_id FROM staff_assignments WHERE staff_user_id=?))`)
      params.push(user.id, user.id)
    }
  } else {
    // Client / vendor: strictly what they participate in.
    clauses.push(`c.id IN (SELECT conversation_id FROM conversation_participants WHERE user_id=? AND removed_at IS NULL)`)
    params.push(user.id)
  }
  // Staff DMs is internal chat only. Email threads belong to the dedicated
  // Email workspace even though both features share conversation metadata.
  if (kindFilter === 'staff') clauses.push("c.kind IN ('dm','group_dm')")
  else if (kindFilter) { clauses.push('c.kind = ?'); params.push(kindFilter) }
  if (statusFilter && statusFilter !== 'all') { clauses.push('c.status = ?'); params.push(statusFilter) }
  if (scopeClient) { clauses.push('c.scope_client_user_id = ?'); params.push(scopeClient) }
  if (search) { clauses.push('c.subject LIKE ?'); params.push(`%${search}%`) }

  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.kind, c.subject, c.scope_client_user_id, c.assignee_user_id,
            c.priority, c.status, c.last_message_at, c.created_at,
            (SELECT MAX(cm.created_at) FROM conversation_messages cm WHERE cm.conversation_id=c.id AND cm.deleted_at IS NULL) latest_message_at,
            (SELECT COUNT(*) FROM conversation_messages cm
              WHERE cm.conversation_id = c.id
                AND cm.deleted_at IS NULL
                AND cm.sender_user_id != ?
                AND cm.created_at > COALESCE((SELECT last_read_at FROM conversation_reads WHERE conversation_id=c.id AND user_id=?), '1970-01-01')
                AND (? = 1 OR cm.is_internal_note = 0)) unread_count,
            (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id=c.id AND removed_at IS NULL) participant_count,
            (SELECT full_name FROM users WHERE id=c.assignee_user_id) assignee_name,
            (SELECT full_name FROM users WHERE id=c.scope_client_user_id) client_name
     FROM conversations c
     WHERE ${clauses.join(' AND ')}
     ORDER BY c.last_message_at DESC
     LIMIT 200`
  ).bind(user.id, user.id, isStaffLike(user.role) ? 1 : 0, ...params).all()

  return c.json({ conversations: (rows.results as any[]) || [] })
})

// GET /admin/conversations/unread-count OR /portal/conversations/unread-count
conversationRoutes.get('/conversations/unread-count', async (c) => {
  const user = c.get('user')
  const staff = isStaffLike(user.role) ? 1 : 0
  const scope = user.role === 'admin'
    ? '1=1'
    : isStaffLike(user.role)
      ? `(c.id IN (SELECT conversation_id FROM conversation_participants WHERE user_id=? AND removed_at IS NULL)
         OR c.scope_client_user_id IN (SELECT client_user_id FROM staff_assignments WHERE staff_user_id=?))`
      : `c.id IN (SELECT conversation_id FROM conversation_participants WHERE user_id=? AND removed_at IS NULL)`
  const params: any[] = user.role === 'admin' ? [] : isStaffLike(user.role) ? [user.id, user.id] : [user.id]
  const row = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT c.id) n FROM conversations c
     JOIN conversation_messages cm ON cm.conversation_id = c.id AND cm.deleted_at IS NULL AND cm.sender_user_id != ?
     LEFT JOIN conversation_reads cr ON cr.conversation_id = c.id AND cr.user_id = ?
     WHERE ${scope}
       AND cm.created_at > COALESCE(cr.last_read_at, '1970-01-01')
       AND (? = 1 OR cm.is_internal_note = 0)`
  ).bind(user.id, user.id, ...params, staff).first<{ n: number }>()
  return c.json({ count: Number(row?.n ?? 0) })
})

// GET /admin/conversations/:id or /portal/conversations/:id
conversationRoutes.get('/conversations/:id', async (c) => {
  const user = c.get('user')
  const gate = await loadConversation(c.env, user, c.req.param('id'))
  if (!gate.ok) return c.json({ error: gate.error }, gate.status as any)
  const { conversation, canSeeInternalNotes } = gate

  const messagesQ = c.env.DB.prepare(
    `SELECT cm.id, cm.conversation_id, cm.sender_user_id, cm.body_md, cm.body_html,
            cm.is_internal_note, cm.in_reply_to_message_id, cm.edited_at, cm.deleted_at, cm.created_at,
            u.full_name sender_name, u.email sender_email, u.role sender_role
     FROM conversation_messages cm
     LEFT JOIN users u ON u.id = cm.sender_user_id
     WHERE cm.conversation_id = ?
       AND cm.deleted_at IS NULL
       AND (? = 1 OR cm.is_internal_note = 0)
     ORDER BY cm.created_at ASC`
  ).bind(conversation.id, canSeeInternalNotes ? 1 : 0).all()

  const [participantsRes, messagesRes, attachmentsRes, mentionsRes, pinsRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT cp.user_id, cp.role_in_conv, cp.added_at, u.full_name, u.email, u.role user_role, u.last_seen_at
       FROM conversation_participants cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.conversation_id = ? AND cp.removed_at IS NULL`
    ).bind(conversation.id).all(),
    messagesQ,
    c.env.DB.prepare(
      `SELECT ca.id, ca.message_id, ca.file_name, ca.content_type, ca.size_bytes
       FROM conversation_attachments ca
       JOIN conversation_messages cm ON cm.id = ca.message_id
       WHERE cm.conversation_id = ? AND cm.deleted_at IS NULL`
    ).bind(conversation.id).all(),
    c.env.DB.prepare(
      `SELECT mm.message_id, mm.mentioned_user_id, u.full_name FROM message_mentions mm
       JOIN users u ON u.id = mm.mentioned_user_id
       JOIN conversation_messages cm ON cm.id = mm.message_id
       WHERE cm.conversation_id = ?`
    ).bind(conversation.id).all(),
    c.env.DB.prepare(
      `SELECT cp.message_id, cp.pinned_at, u.full_name pinned_by FROM conversation_pins cp
       LEFT JOIN users u ON u.id = cp.pinned_by_user_id WHERE cp.conversation_id = ?`
    ).bind(conversation.id).all(),
  ])

  // Update last-read for the caller.
  const messages = (messagesRes.results as any[]) || []
  const latest = messages.at(-1)
  if (latest) {
    await c.env.DB.prepare(
      `INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id, last_read_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_message_id=excluded.last_read_message_id, last_read_at=excluded.last_read_at`
    ).bind(conversation.id, user.id, latest.id).run()
  }

  return c.json({
    conversation,
    participants: (participantsRes.results as any[]) || [],
    messages,
    attachments: (attachmentsRes.results as any[]) || [],
    mentions: (mentionsRes.results as any[]) || [],
    pins: (pinsRes.results as any[]) || [],
    can_see_internal_notes: canSeeInternalNotes,
  })
})

// POST /admin/conversations - staff-created conversation.
// Body: { kind, subject, participant_user_ids[], scope_client_user_id?, initial_body? }
conversationRoutes.post('/conversations', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<any>().catch(() => null)
  if (!body) return c.json({ error: 'invalid body' }, 400)
  const kind = clean(body.kind, 20) || 'dm'
  if (!['dm', 'group_dm'].includes(kind)) return c.json({ error: 'invalid kind' }, 400)
  const subject = clean(body.subject, 200)
  if (!subject) return c.json({ error: 'subject required' }, 400)
  const scopeClientId = clean(body.scope_client_user_id, 40) || null
  const rawIds = Array.isArray(body.participant_user_ids) ? body.participant_user_ids.map((v: unknown) => clean(v, 40)).filter(Boolean) : []
  const participantIds = new Set<string>(rawIds)
  participantIds.add(user.id)
  if (scopeClientId) participantIds.add(scopeClientId)

  if (participantIds.size < 2) return c.json({ error: 'at least one other participant required' }, 400)
  if (kind === 'dm' && participantIds.size !== 2) return c.json({ error: 'a dm has exactly two participants; use group_dm for more' }, 400)

  const validRes = await c.env.DB.prepare(
    `SELECT id, role FROM users WHERE id IN (${[...participantIds].map(() => '?').join(',')}) AND status = 'active'`
  ).bind(...participantIds).all()
  const validIds = new Set((validRes.results as any[])?.map((r) => r.id) || [])
  for (const id of participantIds) if (!validIds.has(id)) return c.json({ error: `unknown or inactive user: ${id}` }, 400)

  const conversationId = uuid()
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const initialBody = clean(body.initial_body, 8000)
  const requestedPriority = typeof body.priority === 'string' ? body.priority.toLowerCase() : 'normal'
  const priority = ['low', 'normal', 'high', 'urgent'].includes(requestedPriority) ? requestedPriority : 'normal'

  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO conversations (id, kind, subject, scope_client_user_id, priority, created_by_user_id, last_message_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(conversationId, kind, subject, scopeClientId, priority, user.id, now, now),
    ...[...participantIds].map((pid) =>
      c.env.DB.prepare(
        `INSERT INTO conversation_participants (conversation_id, user_id, role_in_conv, added_by_user_id) VALUES (?, ?, 'participant', ?)`
      ).bind(conversationId, pid, user.id)
    ),
  ]
  await c.env.DB.batch(stmts)

  let firstMessageId: string | null = null
  if (initialBody) {
    firstMessageId = uuid()
    const html = renderBody(initialBody)
    await c.env.DB.prepare(
      `INSERT INTO conversation_messages (id, conversation_id, sender_user_id, body_md, body_html) VALUES (?, ?, ?, ?, ?)`
    ).bind(firstMessageId, conversationId, user.id, initialBody, html).run()
    await c.env.DB.prepare(`UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?`).bind(conversationId).run()
  }

  try {
    await logActivity(c.env, {
      actorUserId: user.id, clientUserId: scopeClientId,
      kind: 'conversation.created',
      detail: { conversation_id: conversationId, kind, subject, participant_count: participantIds.size },
    })
  } catch {}

  return c.json({ ok: true, id: conversationId, first_message_id: firstMessageId }, 201)
})

// POST /admin/conversations/:id/messages
// Body: { body_md, is_internal_note?, in_reply_to_message_id? }
conversationRoutes.post('/conversations/:id/messages', async (c) => {
  const user = c.get('user')
  const gate = await loadConversation(c.env, user, c.req.param('id'))
  if (!gate.ok) return c.json({ error: gate.error }, gate.status as any)
  if (!gate.isParticipant && !isStaffLike(user.role)) return c.json({ error: 'forbidden' }, 403)
  const body = await c.req.json<any>().catch(() => null)
  const bodyMd = clean(body?.body_md, 8000)
  if (!bodyMd) return c.json({ error: 'body required' }, 400)
  const isInternalNote = !!body?.is_internal_note && isStaffLike(user.role)
  const inReplyTo = clean(body?.in_reply_to_message_id, 40) || null

  const messageId = uuid()
  const bodyHtml = renderBody(bodyMd)
  const mentionedIds = isStaffLike(user.role) ? await resolveMentions(c.env, bodyMd) : []

  const stmts: any[] = [
    c.env.DB.prepare(
      `INSERT INTO conversation_messages (id, conversation_id, sender_user_id, body_md, body_html, is_internal_note, in_reply_to_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(messageId, gate.conversation.id, user.id, bodyMd, bodyHtml, isInternalNote ? 1 : 0, inReplyTo),
    c.env.DB.prepare(`UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?`).bind(gate.conversation.id),
    c.env.DB.prepare(
      `INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id, last_read_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_message_id=excluded.last_read_message_id, last_read_at=excluded.last_read_at`
    ).bind(gate.conversation.id, user.id, messageId),
  ]
  for (const uid of mentionedIds) stmts.push(c.env.DB.prepare(`INSERT OR IGNORE INTO message_mentions (message_id, mentioned_user_id) VALUES (?, ?)`).bind(messageId, uid))
  await c.env.DB.batch(stmts)

  // Notify @mentioned users + every other active participant (except the
  // sender). Mentions dedupe against themselves so a burst of replies
  // to the same person on the same conversation only pings once/60s.
  c.executionCtx.waitUntil((async () => {
    const participants = await c.env.DB.prepare(
      `SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND removed_at IS NULL AND user_id != ?`
    ).bind(gate.conversation.id, user.id).all()
    const participantIds = new Set(((participants.results as any[]) || []).map((r) => r.user_id))
    const deepLink = `/messages?tab=staff&conv=${gate.conversation.id}`
    const senderName = user.full_name || user.email
    // Skip mentioned-user notifications for clients/vendors on internal notes.
    for (const uid of mentionedIds) {
      if (isInternalNote && !participantIds.has(uid)) continue
      await pushNotification(c.env, {
        userId: uid, kind: 'conversation.mention',
        subjectType: 'conversation', subjectId: gate.conversation.id,
        title: `${senderName} mentioned you`,
        body: `${gate.conversation.subject}: ${bodyMd.slice(0, 180)}`,
        deepLinkPath: deepLink, actorUserId: user.id, dedupeWindowSeconds: 60,
      })
      participantIds.delete(uid)
    }
    for (const uid of participantIds) {
      await pushNotification(c.env, {
        userId: uid, kind: isInternalNote ? 'conversation.internal_note' : 'conversation.message',
        subjectType: 'conversation', subjectId: gate.conversation.id,
        title: `${senderName} in ${gate.conversation.subject}`,
        body: bodyMd.slice(0, 200),
        deepLinkPath: deepLink, actorUserId: user.id, dedupeWindowSeconds: 60,
      })
    }
  })())

  try {
    await logActivity(c.env, {
      actorUserId: user.id,
      clientUserId: gate.conversation.scope_client_user_id || null,
      kind: isInternalNote ? 'conversation.internal_note' : 'conversation.message',
      detail: { conversation_id: gate.conversation.id, subject: gate.conversation.subject },
    })
  } catch {}

  return c.json({ ok: true, id: messageId }, 201)
})

// PATCH /admin/conversations/:id - update assignee / status / priority / subject
conversationRoutes.patch('/conversations/:id', async (c) => {
  const user = c.get('user')
  if (!isStaffLike(user.role)) return c.json({ error: 'forbidden' }, 403)
  const gate = await loadConversation(c.env, user, c.req.param('id'))
  if (!gate.ok) return c.json({ error: gate.error }, gate.status as any)
  const body = await c.req.json<any>().catch(() => null)
  const updates: string[] = []
  const params: any[] = []
  if (typeof body?.subject === 'string') { updates.push('subject = ?'); params.push(clean(body.subject, 200)) }
  if (body?.assignee_user_id !== undefined) { updates.push('assignee_user_id = ?'); params.push(body.assignee_user_id || null) }
  if (typeof body?.priority === 'string' && ['low','normal','high','urgent'].includes(body.priority)) { updates.push('priority = ?'); params.push(body.priority) }
  if (typeof body?.status === 'string' && ['open','snoozed','closed'].includes(body.status)) { updates.push('status = ?'); params.push(body.status) }
  if (!updates.length) return c.json({ ok: true })
  await c.env.DB.prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`).bind(...params, gate.conversation.id).run()
  return c.json({ ok: true })
})

// POST /admin/conversations/:id/participants { user_id }
conversationRoutes.post('/conversations/:id/participants', async (c) => {
  const user = c.get('user')
  if (!isStaffLike(user.role)) return c.json({ error: 'forbidden' }, 403)
  const gate = await loadConversation(c.env, user, c.req.param('id'))
  if (!gate.ok) return c.json({ error: gate.error }, gate.status as any)
  const body = await c.req.json<any>().catch(() => null)
  const uid = clean(body?.user_id, 40)
  if (!uid) return c.json({ error: 'user_id required' }, 400)
  const exists = await c.env.DB.prepare(`SELECT 1 FROM users WHERE id=? AND status='active'`).bind(uid).first()
  if (!exists) return c.json({ error: 'unknown user' }, 400)
  await c.env.DB.prepare(
    `INSERT INTO conversation_participants (conversation_id, user_id, role_in_conv, added_by_user_id, removed_at)
     VALUES (?, ?, 'participant', ?, NULL)
     ON CONFLICT(conversation_id, user_id) DO UPDATE SET removed_at=NULL, added_by_user_id=excluded.added_by_user_id`
  ).bind(gate.conversation.id, uid, user.id).run()
  return c.json({ ok: true })
})

conversationRoutes.delete('/conversations/:id/participants/:uid', async (c) => {
  const user = c.get('user')
  if (!isStaffLike(user.role)) return c.json({ error: 'forbidden' }, 403)
  const gate = await loadConversation(c.env, user, c.req.param('id'))
  if (!gate.ok) return c.json({ error: gate.error }, gate.status as any)
  await c.env.DB.prepare(`UPDATE conversation_participants SET removed_at = datetime('now') WHERE conversation_id=? AND user_id=?`).bind(gate.conversation.id, c.req.param('uid')).run()
  return c.json({ ok: true })
})

// POST /admin/conversations/:id/pins { message_id }
conversationRoutes.post('/conversations/:id/pins', async (c) => {
  const user = c.get('user')
  if (!isStaffLike(user.role)) return c.json({ error: 'forbidden' }, 403)
  const gate = await loadConversation(c.env, user, c.req.param('id'))
  if (!gate.ok) return c.json({ error: gate.error }, gate.status as any)
  const body = await c.req.json<any>().catch(() => null)
  const messageId = clean(body?.message_id, 40)
  if (!messageId) return c.json({ error: 'message_id required' }, 400)
  await c.env.DB.prepare(`INSERT OR IGNORE INTO conversation_pins (conversation_id, message_id, pinned_by_user_id) VALUES (?, ?, ?)`).bind(gate.conversation.id, messageId, user.id).run()
  return c.json({ ok: true })
})

conversationRoutes.delete('/conversations/:id/pins/:messageId', async (c) => {
  const user = c.get('user')
  if (!isStaffLike(user.role)) return c.json({ error: 'forbidden' }, 403)
  const gate = await loadConversation(c.env, user, c.req.param('id'))
  if (!gate.ok) return c.json({ error: gate.error }, gate.status as any)
  await c.env.DB.prepare(`DELETE FROM conversation_pins WHERE conversation_id=? AND message_id=?`).bind(gate.conversation.id, c.req.param('messageId')).run()
  return c.json({ ok: true })
})

// GET /admin/mentionable-users?q=... - typeahead for @mentions in the composer
conversationRoutes.get('/mentionable-users', async (c) => {
  const user = c.get('user')
  if (!isStaffLike(user.role)) return c.json({ users: [] })
  const q = clean(c.req.query('q'), 60)
  const like = `%${q}%`
  const res = await c.env.DB.prepare(
    `SELECT id, full_name, email, role FROM users
     WHERE status = 'active' AND (LOWER(email) LIKE LOWER(?) OR LOWER(COALESCE(full_name,'')) LIKE LOWER(?))
     ORDER BY (LOWER(email) LIKE LOWER(? || '%')) DESC, full_name LIMIT 20`
  ).bind(like, like, q).all()
  return c.json({ users: (res.results as any[]) || [] })
})
