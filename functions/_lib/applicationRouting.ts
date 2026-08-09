export interface AssignedStaff {
  staff_user_id: string
  is_primary: number
  full_name?: string | null
  email?: string | null
}

export interface ApplicationRouting {
  assignments: AssignedStaff[]
  primary: AssignedStaff | null
  staffUserIds: string[]
  unassigned: boolean
}

// Routing rule used by service applications:
// - no assignments -> firm fallback / unassigned
// - explicit primary -> notify primary
// - one assignment -> that person is implicitly primary
// - multiple without primary -> notify assigned team, do not invent a primary
export function resolveApplicationRouting(assignments: AssignedStaff[]): ApplicationRouting {
  const ordered = [...assignments].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
  const explicitPrimary = ordered.find((assignment) => assignment.is_primary === 1)
  const primary = explicitPrimary ?? (ordered.length === 1 ? ordered[0] : null)
  return {
    assignments: ordered,
    primary,
    staffUserIds: primary ? [primary.staff_user_id] : ordered.map((assignment) => assignment.staff_user_id),
    unassigned: ordered.length === 0,
  }
}
