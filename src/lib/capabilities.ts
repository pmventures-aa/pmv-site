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
  is_owner: boolean
  role_definition_id?: string | null
  role_name?: string | null
}

const NONE: Capabilities = {
  can_reveal_payment_info: false,
  can_manage_users: false,
  can_manage_settings: false,
  can_view_reports: false,
  can_view_audit_log: false,
  can_manage_communications: false,
  is_owner: false,
  role_definition_id: null,
  role_name: null,
}

// Effective capabilities combine legacy per-person grants with the user's
// database-defined role template. Role names are presentation only; routes
// enforce the actual permission grants returned by the backend.
export function useCapabilities(): Capabilities & { loading: boolean } {
  const { user } = useAuth()
  const [caps, setCaps] = useState<Capabilities>(NONE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || (user.role !== 'staff' && user.role !== 'admin')) {
      setCaps(NONE)
      setLoading(false)
      return
    }
    setLoading(true)
    api
      .get<Capabilities>('/admin/effective-capabilities')
      .then(setCaps)
      .catch(() => setCaps(NONE))
      .finally(() => setLoading(false))
  }, [user])

  return { ...caps, loading }
}
