import { useEffect } from 'react'

// Inject a JSON-LD structured-data block for the current page and remove it on
// unmount. Search engines read this to understand the service, the business,
// and the area served - which is what earns local rich results. `id` keeps a
// single managed script per logical block so re-renders replace rather than
// stack.
export function useJsonLd(id: string, data: Record<string, unknown> | null) {
  useEffect(() => {
    if (!data) return
    const existing = document.getElementById(id)
    const script = existing instanceof HTMLScriptElement ? existing : document.createElement('script')
    script.type = 'application/ld+json'
    script.id = id
    script.textContent = JSON.stringify(data)
    if (!existing) document.head.appendChild(script)
    return () => { document.getElementById(id)?.remove() }
  }, [id, data])
}
