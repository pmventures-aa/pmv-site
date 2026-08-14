import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Card } from '../ui'
import { useAppPath } from '../../lib/basePath'

// Onboarding is guidance, not a gate. Persist dismissal per signed-in user so
// one person's choice on a shared browser never suppresses another account's
// prompt. Completion still wins over local dismissal and hides it everywhere.
export function GetStartedPrompt({ className = '' }: { className?: string }) {
  const p = useAppPath()
  const { user } = useAuth()
  const dismissKey = useMemo(() => `pmv_dismissed_get_started:${user?.id || 'unknown'}`, [user?.id])
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .get<{ completed: boolean }>('/portal/onboarding')
      .then((res) => {
        if (cancelled) return
        if (res.completed) {
          localStorage.removeItem(dismissKey)
          setVisible(false)
          return
        }
        setVisible(localStorage.getItem(dismissKey) !== '1')
      })
      .catch(() => {
        if (!cancelled) setVisible(false)
      })
    return () => {
      cancelled = true
    }
  }, [dismissKey])

  if (!visible) return null

  function dismiss() {
    localStorage.setItem(dismissKey, '1')
    setVisible(false)
  }

  return (
    <Card className={`flex flex-wrap items-center justify-between gap-3 !py-2.5 ${className}`}>
      <div className="max-w-2xl">
        <p className="text-sm font-semibold text-white">Tell us what you need</p>
        <p className="mt-0.5 text-xs text-slate-400">A few questions route the request to the right team.</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button onClick={dismiss} className="btn-outline !px-3 !py-1.5 text-xs">
          Maybe later
        </button>
        <Link to={p('onboarding')} className="btn-gold !px-4 !py-1.5 text-xs">
          Get started
        </Link>
      </div>
    </Card>
  )
}
