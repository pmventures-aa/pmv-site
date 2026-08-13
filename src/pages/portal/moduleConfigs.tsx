import type { ModuleConfig } from './ModulePage'
import { AddToCalendarButton } from '../../components/kit/AddToCalendar'

const dt = (v: string) => (v ? new Date(v).toLocaleDateString() : 'Not provided')

export const callsConfig: ModuleConfig = {
  title: 'Planned Calls',
  eyebrow: 'Talk to your team',
  subtitle: 'Request a call with your Pinnacle representative and we’ll confirm a time.',
  apiPath: '/portal/calls',
  listKey: 'calls',
  emptyLabel: 'No calls requested yet.',
  createLabel: '+ Request a call',
  createFields: [{ key: 'topic', label: 'What would you like to discuss?', type: 'textarea', required: true }],
  columns: [
    { key: 'topic', label: 'Topic' },
    { key: 'scheduled_at', label: 'Scheduled', render: (r) => (r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : 'Not yet scheduled') },
    { key: 'created_at', label: 'Requested', render: (r) => dt(r.created_at) },
  ],
  statusField: 'status',
  statusOptions: ['requested', 'scheduled', 'completed', 'cancelled'],
  clientCancelValue: 'cancelled',
}

export const mattersConfig: ModuleConfig = {
  title: 'Matters',
  eyebrow: 'Active work',
  subtitle: 'Open matters your Pinnacle team is working on.',
  apiPath: '/portal/matters',
  listKey: 'matters',
  emptyLabel: 'No matters yet.',
  columns: [
    { key: 'title', label: 'Title' },
    { key: 'type', label: 'Type', render: (r) => r.type ?? 'Not provided' },
    { key: 'due_date', label: 'Due', render: (r) => (r.due_date ? dt(r.due_date) : 'Not provided') },
    { key: 'created_at', label: 'Opened', render: (r) => dt(r.created_at) },
  ],
  statusField: 'status',
  statusOptions: ['open', 'in_progress', 'blocked', 'closed'],
}

export const tasksConfig: ModuleConfig = {
  title: 'Tasks',
  eyebrow: 'To-do',
  subtitle: 'Action items for you and your Pinnacle team.',
  apiPath: '/portal/tasks',
  listKey: 'tasks',
  emptyLabel: 'No tasks yet.',
  createLabel: '+ Add task',
  createFields: [
    { key: 'title', label: 'Task', type: 'text', required: true },
    { key: 'due_date', label: 'Due date', type: 'date' },
  ],
  columns: [
    { key: 'title', label: 'Task' },
    { key: 'due_date', label: 'Due', render: (r) => (r.due_date ? dt(r.due_date) : 'Not provided') },
  ],
  statusField: 'status',
  statusOptions: ['pending', 'in_progress', 'done'],
  clientCanSetStatus: true,
}

export const calendarConfig: ModuleConfig = {
  title: 'Calendar',
  eyebrow: 'Appointments',
  subtitle: 'Upcoming and past appointments with your Pinnacle team.',
  apiPath: '/portal/calendar',
  listKey: 'appointments',
  emptyLabel: 'No appointments scheduled.',
  createLabel: '+ Request appointment',
  createFields: [
    { key: 'title', label: 'What is this appointment for?', type: 'text', required: true },
    { key: 'starts_at', label: 'Preferred date & time', type: 'datetime-local', required: true },
  ],
  columns: [
    { key: 'title', label: 'Title' },
    { key: 'starts_at', label: 'When', render: (r) => new Date(r.starts_at).toLocaleString() },
  ],
  statusField: 'status',
  statusOptions: ['proposed', 'confirmed', 'completed', 'cancelled'],
  clientCancelValue: 'cancelled',
  rowActions: (row) => (
    <AddToCalendarButton
      event={{
        id: row.id,
        title: row.title || 'Pinnacle appointment',
        startsAt: row.starts_at,
        description: 'Pinnacle appointment',
      }}
    />
  ),
}

export const fundingConfig: ModuleConfig = {
  title: 'Funding',
  eyebrow: 'Capital access',
  subtitle: 'Track your funding applications.',
  apiPath: '/portal/funding',
  listKey: 'applications',
  emptyLabel: 'No funding applications yet.',
  createLabel: '+ New application',
  createFields: [
    { key: 'amount_requested', label: 'Amount requested (USD)', type: 'number', required: true },
    { key: 'use_of_funds', label: 'Use of funds', type: 'textarea', required: true },
  ],
  transformBeforeSubmit: (form) => ({
    amount_requested_cents: Math.round(parseFloat(form.amount_requested || '0') * 100),
    use_of_funds: form.use_of_funds,
  }),
  columns: [
    { key: 'amount_requested_cents', label: 'Amount', render: (r) => (r.amount_requested_cents ? `$${(r.amount_requested_cents / 100).toLocaleString()}` : 'Not provided') },
    { key: 'use_of_funds', label: 'Use of funds', render: (r) => <span className="line-clamp-1 max-w-xs">{r.use_of_funds}</span> },
    { key: 'created_at', label: 'Submitted', render: (r) => dt(r.created_at) },
  ],
  statusField: 'status',
  statusOptions: ['draft', 'submitted', 'under_review', 'approved', 'declined'],
}

export const propertyConfig: ModuleConfig = {
  title: 'Property',
  eyebrow: 'Property support',
  subtitle: 'Properties Pinnacle is helping you manage.',
  apiPath: '/portal/property',
  listKey: 'properties',
  emptyLabel: 'No properties on file.',
  createLabel: '+ Add property',
  createFields: [
    { key: 'address', label: 'Address', type: 'text', required: true },
    { key: 'property_type', label: 'Type (residential, commercial, etc.)', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { key: 'address', label: 'Address' },
    { key: 'property_type', label: 'Type', render: (r) => r.property_type ?? 'Not provided' },
  ],
  statusField: 'status',
  statusOptions: ['active', 'under_contract', 'sold', 'inactive'],
}

export const taxConfig: ModuleConfig = {
  title: 'Tax',
  eyebrow: 'Filings',
  subtitle: 'Tax filings Pinnacle is preparing or tracking for you.',
  apiPath: '/portal/tax',
  listKey: 'filings',
  emptyLabel: 'No tax filings yet.',
  createLabel: '+ Request filing',
  createFields: [
    { key: 'tax_year', label: 'Tax year', type: 'number', required: true },
    { key: 'filing_type', label: 'Filing type (federal, state, etc.)', type: 'text' },
    { key: 'due_date', label: 'Due date', type: 'date' },
  ],
  columns: [
    { key: 'tax_year', label: 'Year' },
    { key: 'filing_type', label: 'Type', render: (r) => r.filing_type ?? 'Not provided' },
    { key: 'due_date', label: 'Due', render: (r) => (r.due_date ? dt(r.due_date) : 'Not provided') },
  ],
  statusField: 'status',
  statusOptions: ['not_started', 'in_progress', 'filed', 'extended'],
}
