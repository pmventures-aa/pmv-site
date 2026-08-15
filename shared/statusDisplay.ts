/**
 * Centralized client-facing status translation layer
 * Converts internal enums to readable labels with optional helper text
 */

export interface StatusDisplay {
  label: string
  tone: 'gold' | 'green' | 'red' | 'blue' | 'slate'
  helpText?: string
}

// Document review status translations
export function documentStatusDisplay(status: string): StatusDisplay {
  if (status === 'approved') return { label: 'Approved', tone: 'green', helpText: 'Pinnacle has reviewed and accepted this document.' }
  if (status === 'rejected') return { label: 'Rejected', tone: 'red', helpText: 'Pinnacle could not accept this document. Please contact your team.' }
  return { label: 'Pending review', tone: 'gold', helpText: 'Pinnacle is reviewing this document.' }
}

// Task status translations
export function taskStatusDisplay(status: string): StatusDisplay {
  if (status === 'done') return { label: 'Done', tone: 'green' }
  if (status === 'in_progress') return { label: 'In progress', tone: 'gold' }
  if (status === 'blocked') return { label: 'Blocked', tone: 'red' }
  return { label: status.replace(/_/g, ' '), tone: 'slate' }
}

// Matter status translations (internal status → client-facing)
export function matterStatusDisplay(status: string): StatusDisplay {
  if (status === 'closed') return { label: 'Completed', tone: 'green' }
  if (status === 'in_progress') return { label: 'In progress', tone: 'gold' }
  if (status === 'blocked') return { label: 'On hold', tone: 'red', helpText: 'This work is waiting on something outside our control. Your team will explain.' }
  return { label: 'Open', tone: 'slate' }
}

// Invoice status translations
export function invoiceStatusDisplay(status: string, overdue: boolean = false): StatusDisplay {
  if (status === 'paid') return { label: 'Paid', tone: 'green' }
  if (status === 'void') return { label: 'Voided', tone: 'slate' }
  if (overdue) return { label: 'Overdue', tone: 'red', helpText: 'Payment is past due. Contact your team if you have questions.' }
  if (status === 'open') return { label: 'Open', tone: 'gold', helpText: 'This invoice is awaiting payment.' }
  return { label: status.replace(/_/g, ' '), tone: 'slate' }
}

// Generic responsibility state → client action labels
export function responsibilityDisplay(state: string, status: string): StatusDisplay {
  if (state === 'client') return { label: 'Action needed', tone: 'gold', helpText: 'We\'re waiting on you to move this forward.' }
  if (state === 'third_party') return { label: 'Waiting', tone: 'red', helpText: 'We\'re waiting on someone outside this workspace.' }
  if (state === 'none' || status === 'closed') return { label: 'Complete', tone: 'green' }
  return { label: 'Pinnacle working', tone: 'blue', helpText: 'We\'re handling this. Nothing needed from you right now.' }
}

// Quote status translations
export function quoteStatusDisplay(status: string): StatusDisplay {
  if (status === 'accepted') return { label: 'Accepted', tone: 'green' }
  if (status === 'declined') return { label: 'Declined', tone: 'red' }
  if (status === 'sent' || status === 'viewed') return { label: 'Pending your reply', tone: 'gold', helpText: 'Please accept or decline with optional notes.' }
  return { label: status.replace(/_/g, ' '), tone: 'slate' }
}
