import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { playNotificationSound } from './sound'

const POLL_MS = 4000

export function useEmailUnreadCount() {
  const [count, setCount] = useState(0)
  const prev = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ count: number }>('/admin/email-threads/unread-count')
      const next = Number(r.count || 0)
      if (prev.current !== null && next > prev.current) playNotificationSound('default')
      prev.current = next
      setCount(next)
    } catch {
      // Retry on the next poll. Missing the new table during rollout should not crash HQ chrome.
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), POLL_MS)
    const onFocus = () => void load()
    const onVisibility = () => { if (document.visibilityState === 'visible') void load() }
    const onRefresh = () => void load()
    const onActivity = () => void load()
    window.addEventListener('focus', onFocus)
    window.addEventListener('pmv:refresh', onRefresh)
    window.addEventListener('pmv:activity', onActivity)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pmv:refresh', onRefresh)
      window.removeEventListener('pmv:activity', onActivity)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  return { count, reload: load }
}
