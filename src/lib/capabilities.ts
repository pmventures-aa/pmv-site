import { useEffect, useState } from 'react'
import { api } from './api'
import { useAuth } from './auth'

export interface Capabilities {
  can_reveal_payment_info: boolean
  can_manage_users: boolean
  can_manage_settings: boolean
  can_view_reports: boolean
  can_view_audit_log: boolean
  can_manage_communications: boolean
  // Owner is a superset of admin, not a fourth role — see requireOwner in
  // functions/_lib/mid.ts. Only ever true for an admin account.
  is_owner: boolean
}

const NONE: Capabilities = {
  can_reveal_payment_info: false,
  can_manage_users: false,
  can_manage_settings: false,
  can_view_reports: false,
  can_view_audit_log: false,
  can_manage_communications: false,
  is_owner: false,
}

// Every role fetches from /admin/my-capabilities — admin still needs the
// round-trip because is_owner varies per admin account even though the
// other five capabilities are always true for admin (the backend fills
// those in without a query; only is_owner needs one). Used both to decide
// what the nav shows and, on the gated pages themselves, to render a clear
// "you don't have access" state instead of a blank page when a direct link
// is hit without the grant.
export function useCapabilities(): Capabilities & { loading: boolean } {
  const { user } = useAuth()
  const [caps, setCaps] = useState<Capabilities>(NONE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    api
      .get<Capabilities>('/admin/my-capabilities')
      .then(setCaps)
      .finally(() => setLoading(false))
  }, [user])

  return { ...caps, loading }
}
