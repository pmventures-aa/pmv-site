import { createContext, useContext, type ReactNode } from 'react'

// AdminApp/PortalApp are mounted two different ways: at the true root on the
// hq./client. subdomains (base ""), or under /admin/*, /portal/* for local
// dev and preview deploys (base "/admin", "/portal"): see main.tsx.
//
// Internal links inside these apps need to know which mode they're in for
// two reasons:
//   1. A hardcoded "/admin/clients/123" link is flat wrong on the hq.
//      subdomain, where the correct path is just "/clients/123": it
//      silently redirects to the dashboard instead of navigating.
//   2. A bare relative `to="clients"` NavLink/Link resolves unreliably once
//      nested under this app's outer splat route (`/admin/*`): React
//      Router v6 resolves it relative to whatever page is CURRENTLY
//      rendered, not this app's own root, so from /admin/pipelines it
//      produces /admin/pipelines/clients instead of /admin/clients.
//
// useAppPath() sidesteps both: build every internal link through it instead
// of a literal string or a bare relative segment.
const BasePathContext = createContext('')

export function BasePathProvider({ base, children }: { base: string; children: ReactNode }) {
  return <BasePathContext.Provider value={base}>{children}</BasePathContext.Provider>
}

export function useAppPath() {
  const base = useContext(BasePathContext)
  return (path: string = '') => {
    const clean = path.replace(/^\/+/, '')
    return clean ? `${base}/${clean}` : base || '/'
  }
}

/** Map a stored portal path (often `/portal/...`) onto the current app base. */
export function resolvePortalDeepLink(path: string, p: (s: string) => string): string {
  const raw = String(path || '').trim()
  if (!raw || /^https?:/i.test(raw)) return raw
  const qIndex = raw.indexOf('?')
  const pathname = qIndex >= 0 ? raw.slice(0, qIndex) : raw
  const search = qIndex >= 0 ? raw.slice(qIndex) : ''
  const stripped = pathname.replace(/^\/portal\/?/i, '').replace(/^\/+/, '')
  return `${p(stripped)}${search}`
}
