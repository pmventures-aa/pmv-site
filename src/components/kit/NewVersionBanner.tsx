import { useEffect, useState } from 'react'

const POLL_MS = 90_000

async function fetchSha(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { sha?: string }
    return typeof data.sha === 'string' && data.sha ? data.sha : null
  } catch {
    return null
  }
}

export function NewVersionBanner() {
  const [bootSha, setBootSha] = useState<string | null>(null)
  const [latestSha, setLatestSha] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchSha().then((sha) => { if (!cancelled) setBootSha(sha) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!bootSha) return
    let cancelled = false
    async function check() {
      const sha = await fetchSha()
      if (!cancelled && sha && sha !== bootSha) setLatestSha(sha)
    }
    const timer = window.setInterval(() => { void check() }, POLL_MS)
    function onVisible() { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [bootSha])

  if (!latestSha) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-3"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-gold/30 bg-navy-900/95 px-4 py-3 shadow-xl backdrop-blur">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">A newer version of Pinnacle is ready</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Refresh to load the latest updates.</p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-lg bg-gold px-3 py-2 text-xs font-bold text-navy-950 hover:bg-gold-300"
        >
          Refresh
        </button>
      </div>
    </div>
  )
}
