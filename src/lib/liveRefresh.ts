import { useEffect } from 'react'

/**
 * Subscribe a page or component to the shared HQ background refresh signal.
 * The callback runs in place; it never remounts the route, so local form,
 * selection, drawer, scroll, and draft state are preserved.
 */
export function useLiveRefresh(refresh: () => void | Promise<void>, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onRefresh = () => { void refresh() }
    window.addEventListener('pmv:refresh', onRefresh)
    return () => window.removeEventListener('pmv:refresh', onRefresh)
  }, [refresh, enabled])
}
