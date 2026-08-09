import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { Icon } from './Icon'

const POLL_MS = 30_000

export function MailBell() {
  const p = useAppPath()
  const [count, setCount] = useState(0)

  const loadCount = useCallback(async () => {
    try {
      const r = await api.get<{ count: number }>('/portal/message-threads/unread-count')
      setCount(r.count)
    } catch {
      // transient network error — next poll will retry
    }
  }, [])

  useEffect(() => {
    loadCount()
    const t = setInterval(loadCount, POLL_MS)
    return () => clearInterval(t)
  }, [loadCount])

  return (
    <Link
      to={p('messages')}
      className="relative grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-300 transition-all duration-200 hover:-translate-y-px hover:border-gold/40 hover:bg-gold/5 hover:text-gold"
      aria-label="Messages"
    >
      <Icon name="mail" size={17} />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-navy-950">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
