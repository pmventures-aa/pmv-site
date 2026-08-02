import { Navigate, Outlet } from 'react-router-dom'
import { useAuth, type Role } from '../lib/auth'
import { Crest } from './ui'

export function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-navy-radial">
      <div className="flex flex-col items-center gap-4">
        <Crest size={64} className="animate-pulse" />
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    </div>
  )
}

export function ProtectedRoute({ allow }: { allow: Role[] }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="login" replace />
  if (!allow.includes(user.role)) {
    return (
      <div className="grid min-h-screen place-items-center bg-navy-radial px-6 text-center">
        <div>
          <p className="eyebrow">Access restricted</p>
          <h1 className="mt-2 text-2xl font-bold text-white">This area isn't available for your account</h1>
          <p className="mt-3 max-w-md text-slate-300">
            Your account role ({user.role}) doesn't have access to this console. Contact your Pinnacle
            representative if you believe this is a mistake.
          </p>
        </div>
      </div>
    )
  }
  return <Outlet />
}
