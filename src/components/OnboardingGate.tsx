import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { api } from '../lib/api'
import { LoadingScreen } from './ProtectedRoute'

export function OnboardingGate() {
  const [completed, setCompleted] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .get<{ completed: boolean }>('/portal/onboarding')
      .then((res) => {
        if (!cancelled) setCompleted(res.completed)
      })
      .catch(() => {
        if (!cancelled) setCompleted(true) // fail open to avoid trapping the user
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (completed === null) return <LoadingScreen />
  if (!completed) return <Navigate to="onboarding" replace />
  return <Outlet />
}
