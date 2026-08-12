import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Info, ShieldAlert, X } from 'lucide-react'
import { api } from '../../lib/api'

type Notice = {
  id: string
  title: string
  body_html: string
  priority: 'info' | 'warning' | 'critical'
  force_redirect_path: string | null
  expires_at: string | null
  created_at: string
}

// Mounted at the portal root. On the very first render after login the
// portal shell polls /portal/pending-login-notice. If a notice comes
// back it renders as a modal-style banner. If the notice carries a
// force_redirect_path, we navigate there once the client acknowledges.
export function LoginBanner() {
  const [notice, setNotice] = useState<Notice | null>(null)
  const [dismissing, setDismissing] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await api.get<{ notice: Notice | null }>('/portal/pending-login-notice')
        if (!cancelled) setNotice(r.notice)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [])

  if (!notice) return null

  const icon = notice.priority === 'critical' ? <ShieldAlert size={22} className="text-rose-300"/>
    : notice.priority === 'warning' ? <AlertTriangle size={22} className="text-amber-300"/>
    : <Info size={22} className="text-sky-300"/>

  const toneCls = notice.priority === 'critical' ? 'border-rose-400/40 bg-rose-950/70'
    : notice.priority === 'warning' ? 'border-amber-400/35 bg-amber-950/50'
    : 'border-sky-400/30 bg-sky-950/50'

  async function acknowledge() {
    setDismissing(true)
    try { await api.post(`/portal/pending-login-notice/${notice!.id}/acknowledge`) } catch {}
    const redirect = notice!.force_redirect_path
    setNotice(null)
    if (redirect) navigate(redirect)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16 backdrop-blur-sm">
      <div className={`w-full max-w-xl rounded-2xl border p-6 shadow-2xl ${toneCls}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span>{icon}</span>
            <div>
              <p className="text-lg font-extrabold text-white">{notice.title}</p>
              {notice.expires_at && <p className="mt-0.5 text-[10px] uppercase tracking-[.12em] text-slate-400">Expires {new Date(notice.expires_at).toLocaleString()}</p>}
            </div>
          </div>
        </div>
        <div className="prose prose-sm prose-invert mt-4 max-w-none text-sm text-slate-200" dangerouslySetInnerHTML={{ __html: notice.body_html }}/>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-navy-950 hover:bg-gold-300 disabled:opacity-60"
            onClick={() => void acknowledge()}
            disabled={dismissing}
          >
            {notice.force_redirect_path ? 'Continue' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  )
}
