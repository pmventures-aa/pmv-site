import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { Card } from '../ui'
import { useAppPath } from '../../lib/basePath'

const DISMISS_KEY = 'pmv_dismissed_get_started'

// Nudges new clients toward the guided setup without blocking anything —
// they can explore services on their own first and come back to this later.
export function GetStartedPrompt({ className = '' }: { className?: string }) {
  const p = useAppPath()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return
    api
      .get<{ completed: boolean }>('/portal/onboarding')
      .then((res) => setVisible(!res.completed))
      .catch(() => {})
  }, [])

  if (!visible) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  return (
    <Card className={`flex flex-wrap items-center justify-between gap-4 !py-4 ${className}`}>
      <div>
        <p className="text-sm font-semibold text-white">Tell us what you need</p>
        <p className="mt-1 text-xs text-slate-400">
          Whenever you're ready — a couple minutes of questions helps us route your work to the right team.
        </p>
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
