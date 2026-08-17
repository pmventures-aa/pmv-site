import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAppPath } from './basePath'
import type { NavItem } from '../components/layout/nav'

// Derives document.title from the active navigation item so every HQ /
// portal page gets a distinct browser-tab title without each page having
// to call usePageMeta individually. "Clients · Pinnacle HQ" beats forty
// identical tabs.
//
// Matching: longest-prefix wins so nested routes (clients/:id/billing)
// still resolve to their section ("Clients"). The home item (to === '')
// only matches the exact workspace root, otherwise it would swallow
// every path.
export function useNavDocumentTitle(nav: NavItem[], suffix: string) {
  const location = useLocation()
  const p = useAppPath()

  useEffect(() => {
    const pathname = location.pathname.replace(/\/+$/, '') || '/'
    let best: { label: string; length: number } | null = null
    for (const item of nav) {
      const target = p(item.to).replace(/\/+$/, '') || '/'
      if (item.to === '') {
        if (pathname === target) best = best && best.length >= target.length ? best : { label: item.label, length: target.length }
        continue
      }
      if (pathname === target || pathname.startsWith(`${target}/`)) {
        if (!best || target.length > best.length) best = { label: item.label, length: target.length }
      }
    }
    document.title = best ? `${best.label} · ${suffix}` : suffix
  }, [location.pathname, nav, p, suffix])
}
