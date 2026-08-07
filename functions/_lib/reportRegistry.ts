import type { Env } from './types'

export interface ReportColumn {
  key: string
  label: string
  type?: 'number' | 'money' | 'percent' | 'text' | 'date'
}
export interface ReportResult {
  columns: ReportColumn[]
  rows: Record<string, unknown>[]
}
export interface ReportCtx {
  env: Env
  from: string
  to: string
  // null = firm-wide (admin/owner), string[] = restricted to these
  // client_user_ids (possibly empty), matching visibleClientIds() in access.ts.
  clientIds: string[] | null
}
export type ReportCategory = 'business' | 'employee' | 'client' | 'operations'
export interface ReportDef {
  key: string
  label: string
  category: ReportCategory
  description: string
  run: (ctx: ReportCtx) => Promise<ReportResult>
}

function scope(ctx: ReportCtx, column = 'client_user_id'): { where: string; params: unknown[] } {
  if (ctx.clientIds === null) return { where: '1=1', params: [] }
  if (ctx.clientIds.length === 0) return { where: '1=0', params: [] }
  return { where: `${column} IN (${ctx.clientIds.map(() => '?').join(',')})`, params: ctx.clientIds }
}

async function single(env: Env, sql: string, params: unknown[], key: string, label: string, type: ReportColumn['type'] = 'number'): Promise<ReportResult> {
  const row = await env.DB.prepare(sql).bind(...params).first<Record<string, unknown>>()
  return { columns: [{ key, label, type }], rows: [row ?? { [key]: 0 }] }
}

// ---------------- Business ----------------

const totalLeads: ReportDef = {
  key: 'total_leads',
  label: 'Total Leads',
  category: 'business',
  description: 'All leads ever submitted, all-time.',
  run: (ctx) => single(ctx.env, 'SELECT COUNT(*) AS total_leads FROM contact_inquiries', [], 'total_leads', 'Total Leads'),
}
const newLeads: ReportDef = {
  key: 'new_leads',
  label: 'New Leads (period)',
  category: 'business',
  description: 'Leads submitted within the selected date range.',
  run: (ctx) => single(ctx.env, 'SELECT COUNT(*) AS new_leads FROM contact_inquiries WHERE created_at BETWEEN ? AND ?', [ctx.from, ctx.to], 'new_leads', 'New Leads'),
}
const convertedLeads: ReportDef = {
  key: 'converted_leads',
  label: 'Converted Leads (period)',
  category: 'business',
  description: 'Leads converted to clients within the selected date range.',
  run: (ctx) => single(ctx.env, 'SELECT COUNT(*) AS converted_leads FROM lead_conversions WHERE created_at BETWEEN ? AND ?', [ctx.from, ctx.to], 'converted_leads', 'Converted Leads'),
}
const conversionRate: ReportDef = {
  key: 'conversion_rate',
  label: 'Conversion Rate (period)',
  category: 'business',
  description: 'Converted leads as a percentage of leads created in the selected date range.',
  run: async (ctx) => {
    const [leads, conversions] = await Promise.all([
      ctx.env.DB.prepare('SELECT COUNT(*) n FROM contact_inquiries WHERE created_at BETWEEN ? AND ?').bind(ctx.from, ctx.to).first<{ n: number }>(),
      ctx.env.DB.prepare(
        `SELECT COUNT(*) n FROM lead_conversions lc JOIN contact_inquiries ci ON ci.id = lc.inquiry_id WHERE ci.created_at BETWEEN ? AND ?`,
      ).bind(ctx.from, ctx.to).first<{ n: number }>(),
    ])
    const total = leads?.n ?? 0
    const converted = conversions?.n ?? 0
    const rate = total > 0 ? Math.round((converted / total) * 1000) / 10 : 0
    return { columns: [{ key: 'conversion_rate', label: 'Conversion Rate', type: 'percent' }], rows: [{ conversion_rate: rate }] }
  },
}
const lostOpportunities: ReportDef = {
  key: 'lost_opportunities',
  label: 'Lost Opportunities (period)',
  category: 'business',
  description: 'Leads marked lost within the selected date range.',
  run: (ctx) =>
    single(ctx.env, "SELECT COUNT(*) AS lost_opportunities FROM contact_inquiries WHERE status = 'lost' AND created_at BETWEEN ? AND ?", [ctx.from, ctx.to], 'lost_opportunities', 'Lost Opportunities'),
}
const activeClients: ReportDef = {
  key: 'active_clients',
  label: 'Active Clients',
  category: 'business',
  description: 'Client accounts currently active, as of now.',
  run: async (ctx) => {
    const s = scope(ctx, 'id')
    return single(ctx.env, `SELECT COUNT(*) AS active_clients FROM users WHERE role = 'client' AND status = 'active' AND ${s.where}`, s.params, 'active_clients', 'Active Clients')
  },
}
const inactiveClients: ReportDef = {
  key: 'inactive_clients',
  label: 'Inactive Clients',
  category: 'business',
  description: 'Client accounts currently suspended, as of now.',
  run: async (ctx) => {
    const s = scope(ctx, 'id')
    return single(ctx.env, `SELECT COUNT(*) AS inactive_clients FROM users WHERE role = 'client' AND status = 'suspended' AND ${s.where}`, s.params, 'inactive_clients', 'Inactive Clients')
  },
}
const revenueByClient: ReportDef = {
  key: 'revenue_by_client',
  label: 'Revenue by Client',
  category: 'business',
  description: 'Paid invoice totals within the selected date range, by client.',
  run: async (ctx) => {
    const s = scope(ctx, 'i.client_user_id')
    const res = await ctx.env.DB.prepare(
      `SELECT u.full_name AS client, u.email, SUM(i.amount_cents) AS revenue_cents
       FROM invoices i JOIN users u ON u.id = i.client_user_id
       WHERE i.status = 'paid' AND i.created_at BETWEEN ? AND ? AND ${s.where}
       GROUP BY i.client_user_id ORDER BY revenue_cents DESC LIMIT 100`,
    ).bind(ctx.from, ctx.to, ...s.params).all()
    return {
      columns: [{ key: 'client', label: 'Client' }, { key: 'email', label: 'Email' }, { key: 'revenue_cents', label: 'Revenue', type: 'money' }],
      rows: res.results ?? [],
    }
  },
}
const revenueByService: ReportDef = {
  key: 'revenue_by_service',
  label: 'Revenue by Service',
  category: 'business',
  description: 'Paid invoice totals within the selected date range, by attributed service.',
  run: async (ctx) => {
    const s = scope(ctx, 'i.client_user_id')
    const res = await ctx.env.DB.prepare(
      `SELECT COALESCE(sv.name, 'Unattributed') AS service, SUM(i.amount_cents) AS revenue_cents
       FROM invoices i LEFT JOIN services sv ON sv.key = i.service_key
       WHERE i.status = 'paid' AND i.created_at BETWEEN ? AND ? AND ${s.where}
       GROUP BY i.service_key ORDER BY revenue_cents DESC`,
    ).bind(ctx.from, ctx.to, ...s.params).all()
    return { columns: [{ key: 'service', label: 'Service' }, { key: 'revenue_cents', label: 'Revenue', type: 'money' }], rows: res.results ?? [] }
  },
}
const revenueByMonth: ReportDef = {
  key: 'revenue_by_month',
  label: 'Revenue by Month',
  category: 'business',
  description: 'Paid invoice totals within the selected date range, grouped by month.',
  run: async (ctx) => {
    const s = scope(ctx, 'client_user_id')
    const res = await ctx.env.DB.prepare(
      `SELECT strftime('%Y-%m', created_at) AS month, SUM(amount_cents) AS revenue_cents
       FROM invoices WHERE status = 'paid' AND created_at BETWEEN ? AND ? AND ${s.where}
       GROUP BY month ORDER BY month`,
    ).bind(ctx.from, ctx.to, ...s.params).all()
    return { columns: [{ key: 'month', label: 'Month' }, { key: 'revenue_cents', label: 'Revenue', type: 'money' }], rows: res.results ?? [] }
  },
}
const revenueByEmployee: ReportDef = {
  key: 'revenue_by_employee',
  label: 'Revenue by Employee',
  category: 'business',
  description: 'Paid invoice totals within the selected date range, by the staff member attributed on the invoice.',
  run: async (ctx) => {
    const s = scope(ctx, 'i.client_user_id')
    const res = await ctx.env.DB.prepare(
      `SELECT COALESCE(u.full_name, u.email, 'Unattributed') AS employee, SUM(i.amount_cents) AS revenue_cents
       FROM invoices i LEFT JOIN users u ON u.id = i.assigned_staff_user_id
       WHERE i.status = 'paid' AND i.created_at BETWEEN ? AND ? AND ${s.where}
       GROUP BY i.assigned_staff_user_id ORDER BY revenue_cents DESC`,
    ).bind(ctx.from, ctx.to, ...s.params).all()
    return { columns: [{ key: 'employee', label: 'Employee' }, { key: 'revenue_cents', label: 'Revenue', type: 'money' }], rows: res.results ?? [] }
  },
}
const outstandingInvoices: ReportDef = {
  key: 'outstanding_invoices',
  label: 'Outstanding Invoices',
  category: 'business',
  description: 'Open (unpaid) invoices, as of now.',
  run: async (ctx) => {
    const s = scope(ctx)
    return single(
      ctx.env,
      `SELECT COALESCE(SUM(amount_cents), 0) AS outstanding_cents FROM invoices WHERE status = 'open' AND ${s.where}`,
      s.params,
      'outstanding_cents',
      'Outstanding',
      'money',
    )
  },
}
const collectionsSummary: ReportDef = {
  key: 'collections_summary',
  label: 'Collections Summary',
  category: 'business',
  description: 'Invoice totals within the selected date range, by status.',
  run: async (ctx) => {
    const s = scope(ctx)
    const res = await ctx.env.DB.prepare(
      `SELECT status, COUNT(*) AS count, SUM(amount_cents) AS amount_cents
       FROM invoices WHERE created_at BETWEEN ? AND ? AND ${s.where}
       GROUP BY status ORDER BY status`,
    ).bind(ctx.from, ctx.to, ...s.params).all()
    return { columns: [{ key: 'status', label: 'Status' }, { key: 'count', label: 'Count' }, { key: 'amount_cents', label: 'Amount', type: 'money' }], rows: res.results ?? [] }
  },
}

// ---------------- Employee ----------------
// Firm-wide by design (headcount/workload reports aren't meaningfully
// "scoped to my clients") — visible only to admin/owner via the route's
// capability check, same restriction as the Employees page itself.

const tasksAssigned: ReportDef = {
  key: 'tasks_assigned',
  label: 'Tasks Assigned',
  category: 'employee',
  description: 'Tasks created in the selected date range, by assignee.',
  run: async (ctx) => {
    const res = await ctx.env.DB.prepare(
      `SELECT COALESCE(u.full_name, u.email, 'Unassigned') AS employee, COUNT(*) AS tasks
       FROM client_tasks t LEFT JOIN users u ON u.id = t.assigned_staff_user_id
       WHERE t.created_at BETWEEN ? AND ? GROUP BY t.assigned_staff_user_id ORDER BY tasks DESC`,
    ).bind(ctx.from, ctx.to).all()
    return { columns: [{ key: 'employee', label: 'Employee' }, { key: 'tasks', label: 'Tasks' }], rows: res.results ?? [] }
  },
}
const tasksCompleted: ReportDef = {
  key: 'tasks_completed',
  label: 'Tasks Completed',
  category: 'employee',
  description: 'Tasks currently marked done that were created in the selected date range, by assignee.',
  run: async (ctx) => {
    const res = await ctx.env.DB.prepare(
      `SELECT COALESCE(u.full_name, u.email, 'Unassigned') AS employee, COUNT(*) AS completed
       FROM client_tasks t LEFT JOIN users u ON u.id = t.assigned_staff_user_id
       WHERE t.status = 'done' AND t.created_at BETWEEN ? AND ? GROUP BY t.assigned_staff_user_id ORDER BY completed DESC`,
    ).bind(ctx.from, ctx.to).all()
    return { columns: [{ key: 'employee', label: 'Employee' }, { key: 'completed', label: 'Completed' }], rows: res.results ?? [] }
  },
}
const tasksOverdue: ReportDef = {
  key: 'tasks_overdue',
  label: 'Tasks Overdue',
  category: 'employee',
  description: 'Open tasks past their due date, as of now, by assignee.',
  run: async (ctx) => {
    const res = await ctx.env.DB.prepare(
      `SELECT COALESCE(u.full_name, u.email, 'Unassigned') AS employee, COUNT(*) AS overdue
       FROM client_tasks t LEFT JOIN users u ON u.id = t.assigned_staff_user_id
       WHERE t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < date('now')
       GROUP BY t.assigned_staff_user_id ORDER BY overdue DESC`,
    ).bind().all()
    return { columns: [{ key: 'employee', label: 'Employee' }, { key: 'overdue', label: 'Overdue' }], rows: res.results ?? [] }
  },
}
const clientInteractions: ReportDef = {
  key: 'client_interactions',
  label: 'Client Interactions',
  category: 'employee',
  description: 'Activity events logged in the selected date range, by staff member.',
  run: async (ctx) => {
    const res = await ctx.env.DB.prepare(
      `SELECT COALESCE(u.full_name, u.email) AS employee, COUNT(*) AS interactions
       FROM activity_events a JOIN users u ON u.id = a.actor_user_id
       WHERE u.role IN ('staff', 'admin') AND a.created_at BETWEEN ? AND ?
       GROUP BY a.actor_user_id ORDER BY interactions DESC`,
    ).bind(ctx.from, ctx.to).all()
    return { columns: [{ key: 'employee', label: 'Employee' }, { key: 'interactions', label: 'Interactions' }], rows: res.results ?? [] }
  },
}
const emailsSent: ReportDef = {
  key: 'emails_sent',
  label: 'Emails Sent',
  category: 'employee',
  description: 'Outbound emails logged in the selected date range, by sender.',
  run: async (ctx) => {
    const res = await ctx.env.DB.prepare(
      `SELECT COALESCE(u.full_name, u.email, 'System') AS employee, COUNT(*) AS emails
       FROM email_log e LEFT JOIN users u ON u.id = e.sent_by_user_id
       WHERE e.created_at BETWEEN ? AND ? GROUP BY e.sent_by_user_id ORDER BY emails DESC`,
    ).bind(ctx.from, ctx.to).all()
    return { columns: [{ key: 'employee', label: 'Employee' }, { key: 'emails', label: 'Emails' }], rows: res.results ?? [] }
  },
}
const notesAdded: ReportDef = {
  key: 'notes_added',
  label: 'Notes Added',
  category: 'employee',
  description: 'Internal notes posted in the selected date range, by author.',
  run: async (ctx) => {
    const res = await ctx.env.DB.prepare(
      `SELECT COALESCE(u.full_name, u.email) AS employee, COUNT(*) AS notes
       FROM internal_notes n JOIN users u ON u.id = n.author_user_id
       WHERE n.created_at BETWEEN ? AND ? GROUP BY n.author_user_id ORDER BY notes DESC`,
    ).bind(ctx.from, ctx.to).all()
    return { columns: [{ key: 'employee', label: 'Employee' }, { key: 'notes', label: 'Notes' }], rows: res.results ?? [] }
  },
}
const avgResponseTimeByEmployee: ReportDef = {
  key: 'average_response_time',
  label: 'Average Response Time',
  category: 'employee',
  description: 'Average hours from ticket creation to first staff response, by assignee, for tickets created in range.',
  run: async (ctx) => {
    const res = await ctx.env.DB.prepare(
      `SELECT COALESCE(u.full_name, u.email, 'Unassigned') AS employee,
              ROUND(AVG((julianday(t.first_response_at) - julianday(t.created_at)) * 24), 1) AS avg_hours
       FROM support_tickets t LEFT JOIN users u ON u.id = t.assigned_staff_user_id
       WHERE t.first_response_at IS NOT NULL AND t.created_at BETWEEN ? AND ?
       GROUP BY t.assigned_staff_user_id ORDER BY avg_hours ASC`,
    ).bind(ctx.from, ctx.to).all()
    return { columns: [{ key: 'employee', label: 'Employee' }, { key: 'avg_hours', label: 'Avg. hours to respond' }], rows: res.results ?? [] }
  },
}
const employeeActivityRankings: ReportDef = {
  key: 'employee_activity_rankings',
  label: 'Employee Activity Rankings',
  category: 'employee',
  description: 'Combined activity score (tasks completed + notes + emails + logged interactions) in the selected date range.',
  run: async (ctx) => {
    const res = await ctx.env.DB.prepare(
      `SELECT u.id, COALESCE(u.full_name, u.email) AS employee,
              (SELECT COUNT(*) FROM client_tasks WHERE assigned_staff_user_id = u.id AND status = 'done' AND created_at BETWEEN ?1 AND ?2) AS tasks_completed,
              (SELECT COUNT(*) FROM internal_notes WHERE author_user_id = u.id AND created_at BETWEEN ?1 AND ?2) AS notes,
              (SELECT COUNT(*) FROM email_log WHERE sent_by_user_id = u.id AND created_at BETWEEN ?1 AND ?2) AS emails,
              (SELECT COUNT(*) FROM activity_events WHERE actor_user_id = u.id AND created_at BETWEEN ?1 AND ?2) AS interactions
       FROM users u WHERE u.role IN ('staff', 'admin')`,
    ).bind(ctx.from, ctx.to).all<any>()
    const rows = (res.results ?? [])
      .map((r) => ({ ...r, score: (r.tasks_completed ?? 0) + (r.notes ?? 0) + (r.emails ?? 0) + (r.interactions ?? 0) }))
      .sort((a, b) => b.score - a.score)
    return {
      columns: [
        { key: 'employee', label: 'Employee' },
        { key: 'tasks_completed', label: 'Tasks completed' },
        { key: 'notes', label: 'Notes' },
        { key: 'emails', label: 'Emails' },
        { key: 'interactions', label: 'Interactions' },
        { key: 'score', label: 'Score' },
      ],
      rows,
    }
  },
}

// ---------------- Client ----------------

const newClients: ReportDef = {
  key: 'new_clients',
  label: 'New Clients',
  category: 'client',
  description: 'Client accounts created within the selected date range.',
  run: async (ctx) => {
    const s = scope(ctx, 'id')
    return single(
      ctx.env,
      `SELECT COUNT(*) AS new_clients FROM users WHERE role = 'client' AND created_at BETWEEN ? AND ? AND ${s.where}`,
      [ctx.from, ctx.to, ...s.params],
      'new_clients',
      'New Clients',
    )
  },
}
const atRiskClients: ReportDef = {
  key: 'at_risk_clients',
  label: 'At-Risk Clients',
  category: 'client',
  description: 'Active clients with no logged activity in the last 30 days.',
  run: async (ctx) => {
    const s = scope(ctx, 'u.id')
    const res = await ctx.env.DB.prepare(
      `SELECT u.full_name AS client, u.email
       FROM users u
       WHERE u.role = 'client' AND u.status = 'active' AND ${s.where}
         AND NOT EXISTS (
           SELECT 1 FROM activity_events a WHERE a.client_user_id = u.id AND a.created_at >= datetime('now', '-30 days')
         )
       ORDER BY u.full_name LIMIT 200`,
    ).bind(...s.params).all()
    return { columns: [{ key: 'client', label: 'Client' }, { key: 'email', label: 'Email' }], rows: res.results ?? [] }
  },
}
const clientRetention: ReportDef = {
  key: 'client_retention',
  label: 'Client Retention',
  category: 'client',
  description: 'Of clients who joined before the selected range started, the percentage still active today.',
  run: async (ctx) => {
    const s = scope(ctx, 'id')
    const [cohort, stillActive] = await Promise.all([
      ctx.env.DB.prepare(`SELECT COUNT(*) n FROM users WHERE role = 'client' AND created_at < ? AND ${s.where}`).bind(ctx.from, ...s.params).first<{ n: number }>(),
      ctx.env.DB.prepare(`SELECT COUNT(*) n FROM users WHERE role = 'client' AND created_at < ? AND status = 'active' AND ${s.where}`).bind(ctx.from, ...s.params).first<{ n: number }>(),
    ])
    const total = cohort?.n ?? 0
    const active = stillActive?.n ?? 0
    const rate = total > 0 ? Math.round((active / total) * 1000) / 10 : 0
    return { columns: [{ key: 'retention_rate', label: 'Retention Rate', type: 'percent' }], rows: [{ retention_rate: rate }] }
  },
}
const clientEngagement: ReportDef = {
  key: 'client_engagement',
  label: 'Client Engagement Metrics',
  category: 'client',
  description: 'Average number of logged activity events per active client in the selected date range.',
  run: async (ctx) => {
    const s = scope(ctx, 'u.id')
    const res = await ctx.env.DB.prepare(
      `SELECT ROUND(AVG(ec.n), 1) AS avg_events_per_client
       FROM users u
       LEFT JOIN (
         SELECT client_user_id, COUNT(*) n FROM activity_events WHERE created_at BETWEEN ? AND ? GROUP BY client_user_id
       ) ec ON ec.client_user_id = u.id
       WHERE u.role = 'client' AND u.status = 'active' AND ${s.where}`,
    ).bind(ctx.from, ctx.to, ...s.params).first()
    return { columns: [{ key: 'avg_events_per_client', label: 'Avg. events / client' }], rows: [res ?? { avg_events_per_client: 0 }] }
  },
}

// ---------------- Operations ----------------

const openSupportRequests: ReportDef = {
  key: 'open_support_requests',
  label: 'Open Support Requests',
  category: 'operations',
  description: 'Tickets currently open, as of now.',
  run: async (ctx) => {
    const s = scope(ctx)
    return single(ctx.env, `SELECT COUNT(*) AS open_tickets FROM support_tickets WHERE status = 'open' AND ${s.where}`, s.params, 'open_tickets', 'Open Tickets')
  },
}
const avgResolutionTime: ReportDef = {
  key: 'average_resolution_time',
  label: 'Average Resolution Time',
  category: 'operations',
  description: 'Average hours from ticket creation to close, for tickets closed and created within the selected date range.',
  run: async (ctx) => {
    const s = scope(ctx)
    return single(
      ctx.env,
      `SELECT ROUND(AVG((julianday(resolved_at) - julianday(created_at)) * 24), 1) AS avg_hours
       FROM support_tickets WHERE resolved_at IS NOT NULL AND created_at BETWEEN ? AND ? AND ${s.where}`,
      [ctx.from, ctx.to, ...s.params],
      'avg_hours',
      'Avg. hours to resolve',
    )
  },
}
const openProjects: ReportDef = {
  key: 'open_projects',
  label: 'Open Projects',
  category: 'operations',
  description: 'Matters not yet closed, as of now.',
  run: async (ctx) => {
    const s = scope(ctx)
    return single(ctx.env, `SELECT COUNT(*) AS open_matters FROM matters WHERE status != 'closed' AND ${s.where}`, s.params, 'open_matters', 'Open Matters')
  },
}
const projectCompletionRate: ReportDef = {
  key: 'project_completion_rate',
  label: 'Project Completion Rate',
  category: 'operations',
  description: 'Of matters created in the selected date range, the percentage now closed.',
  run: async (ctx) => {
    const s = scope(ctx)
    const [total, closed] = await Promise.all([
      ctx.env.DB.prepare(`SELECT COUNT(*) n FROM matters WHERE created_at BETWEEN ? AND ? AND ${s.where}`).bind(ctx.from, ctx.to, ...s.params).first<{ n: number }>(),
      ctx.env.DB.prepare(`SELECT COUNT(*) n FROM matters WHERE status = 'closed' AND created_at BETWEEN ? AND ? AND ${s.where}`).bind(ctx.from, ctx.to, ...s.params).first<{ n: number }>(),
    ])
    const t = total?.n ?? 0
    const c = closed?.n ?? 0
    const rate = t > 0 ? Math.round((c / t) * 1000) / 10 : 0
    return { columns: [{ key: 'completion_rate', label: 'Completion Rate', type: 'percent' }], rows: [{ completion_rate: rate }] }
  },
}
const departmentPerformance: ReportDef = {
  key: 'department_performance',
  label: 'Department Performance',
  category: 'operations',
  description: 'Tasks completed and tickets resolved in the selected date range, grouped by staff role.',
  run: async (ctx) => {
    const res = await ctx.env.DB.prepare(
      `SELECT COALESCE(tm.staff_role, 'unassigned') AS department,
              (SELECT COUNT(*) FROM client_tasks WHERE assigned_staff_user_id = u.id AND status = 'done' AND created_at BETWEEN ?1 AND ?2) AS tasks_completed,
              (SELECT COUNT(*) FROM support_tickets WHERE assigned_staff_user_id = u.id AND resolved_at IS NOT NULL AND created_at BETWEEN ?1 AND ?2) AS tickets_resolved
       FROM users u LEFT JOIN team_members tm ON tm.user_id = u.id
       WHERE u.role IN ('staff', 'admin')`,
    ).bind(ctx.from, ctx.to).all<any>()
    const byDept = new Map<string, { department: string; tasks_completed: number; tickets_resolved: number }>()
    for (const r of res.results ?? []) {
      const key = r.department.replace(/_/g, ' ')
      const cur = byDept.get(key) ?? { department: key, tasks_completed: 0, tickets_resolved: 0 }
      cur.tasks_completed += r.tasks_completed ?? 0
      cur.tickets_resolved += r.tickets_resolved ?? 0
      byDept.set(key, cur)
    }
    return {
      columns: [{ key: 'department', label: 'Department' }, { key: 'tasks_completed', label: 'Tasks completed' }, { key: 'tickets_resolved', label: 'Tickets resolved' }],
      rows: Array.from(byDept.values()).sort((a, b) => b.tasks_completed - a.tasks_completed),
    }
  },
}

export const REPORTS: ReportDef[] = [
  totalLeads,
  newLeads,
  convertedLeads,
  conversionRate,
  lostOpportunities,
  activeClients,
  inactiveClients,
  revenueByClient,
  revenueByService,
  revenueByMonth,
  revenueByEmployee,
  outstandingInvoices,
  collectionsSummary,
  tasksAssigned,
  tasksCompleted,
  tasksOverdue,
  clientInteractions,
  emailsSent,
  notesAdded,
  avgResponseTimeByEmployee,
  employeeActivityRankings,
  newClients,
  atRiskClients,
  clientRetention,
  clientEngagement,
  openSupportRequests,
  avgResolutionTime,
  openProjects,
  projectCompletionRate,
  departmentPerformance,
]

export const REPORTS_BY_KEY: Record<string, ReportDef> = Object.fromEntries(REPORTS.map((r) => [r.key, r]))
