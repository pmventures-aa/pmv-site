import { useEffect, useState } from 'react'
import { api } from './api'
import { playNotificationSound } from './sound'

const POLL_MS = 4000

type Listener = (count: number) => void
const listeners = new Set<Listener>()
let cached = 0
let prev: number | null = null
let inFlight: Promise<void> | null = null
let subscribers = 0
let timer: number | null = null

async function refresh() {
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const r = await api.get<{ count: number }>('/admin/email-threads/unread-count')
      const next = Number(r.count || 0)
      if (prev !== null && next > prev) playNotificationSound('default')
      prev = next
      cached = next
      for (const listener of listeners) listener(next)
    } catch {
      // Retry on the next poll. Missing the new table during rollout should not crash HQ chrome.
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

function onFocus() { void refresh() }
function onVisibility() { if (document.visibilityState === 'visible') void refresh() }
function onRefresh() { void refresh() }

function start() {
  if (timer != null) return
  void refresh()
  timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void refresh()
  }, POLL_MS)
  window.addEventListener('focus', onFocus)
  window.addEventListener('pmv:refresh', onRefresh)
  window.addEventListener('pmv:activity', onRefresh)
  document.addEventListener('visibilitychange', onVisibility)
}

function stop() {
  if (timer != null) {
    window.clearInterval(timer)
    timer = null
  }
  window.removeEventListener('focus', onFocus)
  window.removeEventListener('pmv:refresh', onRefresh)
  window.removeEventListener('pmv:activity', onRefresh)
  document.removeEventListener('visibilitychange', onVisibility)
}

export function useEmailUnreadCount() {
  const [count, setCount] = useState(cached)

  useEffect(() => {
    listeners.add(setCount)
    subscribers += 1
    start()
    return () => {
      listeners.delete(setCount)
      subscribers -= 1
      if (subscribers <= 0) stop()
    }
  }, [])

  return { count, reload: refresh }
}
