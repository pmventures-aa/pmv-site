export type DocumentRole = 'client' | 'staff' | 'admin'

export interface DocumentAccessInput {
  role: DocumentRole
  userId: string
  clientUserId: string
  visibility: string | null
  staffCanAccessClient?: boolean
}

// Internal documents are never client-visible, even to the client who owns the
// profile. Staff/admin access still depends on the existing client scope check.
export function canReadDocument(input: DocumentAccessInput): boolean {
  if (input.role === 'client') {
    return input.userId === input.clientUserId && input.visibility !== 'internal'
  }
  return input.staffCanAccessClient === true
}
