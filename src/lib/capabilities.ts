import { useEffect, useState } from 'react'
import { api } from './api'
import { useAuth } from './auth'

export interface Capabilities {
  can_reveal_payment_info: boolean
  can_manage_users: boolean
  can_manage_settings: boolean
}

const NONE: Capabilities = { can_reveal_payment_info: false, can_manage_users: false, can_manage_settings: false }
const ALL: Capabilities = { can_reveal_payment_info: true, can_manage_users: true, can_manage_settings: true }

// Admin implicitly has every capability — no round-trip needed. Staff fetch
// their actual grants from /admin/my-capabilities (set in Settings ->
// Staff & Permissions). Used both to decide what the nav shows and, on the
// gated pages themselves, to render a clear "you don't have access" state
// instead of a blank page when a direct link is hit without the grant.
export function useCapabilities(): Capabilities & { loading: boolean } {
  const { user } = useAuth()
  const [caps, setCaps] = useState<Capabilities>(NONE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    if (user.role === 'admin') {
      setCaps(ALL)
      setLoading(false)
      return
    }
    api
      .get<Capabilities>('/admin/my-capabilities')
      .then(setCaps)
      .finally(() => setLoading(false))
  }, [user])

  return { ...caps, loading }
}
