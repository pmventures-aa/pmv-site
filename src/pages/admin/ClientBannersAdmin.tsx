import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Info, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag, inputCls, btnPrimary, btnSecondary } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { Dialog, DialogContent } from '../../components/kit/Dialog'

type Notice = {
  id: string; client_user_id: string; client_name: string; client_email: string
  title: string; priority: 'info'|'warning'|'critical'
  force_redirect_path: string | null; expires_at: string | null
  acknowledged_at: string | null; created_at: string; created_by: string | null
}

type ClientOption = { id: string; full_name: string | null; email: string }

const PRIORITY_TONE: Record<Notice['priority'], 'blue'|'gold'|'red'> = {
  info: 'blue', warning: 'gold', critical: 'red',
}

export default function ClientBannersAdmin() {
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setNotices((await api.get<{ notices: Notice[] }>('/admin/client-login-notices')).notices) }
    catch (err) { if (err instanceof ApiError) toast.error(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  async function remove(id: string) {
    if (!confirm('Delete this login banner? Clients who have not seen it yet will no longer receive it.')) return
    try { await api.del(`/admin/client-login-notices/${id}`); toast.success('Banner deleted'); void load() }
    catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not delete') }
  }

  return (
    <div className="space-y-6">
      <PageIntro kicker="Client Login Banners" title="Announcements clients see when they sign in" subtitle="Post per-client banners that appear on the client's next portal login. Optional forced redirect on acknowledge." />

      <div className="flex justify-end">
        <button className={btnPrimary} onClick={() => setCreating(true)}><Plus size={14}/>New banner</button>
      </div>

      <Panel className="!p-0">
        {loading && !notices.length && <p className="p-4 text-xs text-slate-500">Loading banners…</p>}
        {!loading && !notices.length && <p className="p-6 text-center text-sm text-slate-500">No banners yet.</p>}
        {notices.length > 0 && (
          <div className="divide-y divide-white/10">
            {notices.map((n) => {
              const icon = n.priority === 'critical' ? <ShieldAlert size={14}/> : n.priority === 'warning' ? <AlertTriangle size={14}/> : <Info size={14}/>
              return (
                <div key={n.id} className="flex flex-wrap items-center gap-4 p-4">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[.02] ${n.priority==='critical'?'text-rose-300':n.priority==='warning'?'text-amber-300':'text-sky-300'}`}>{icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white">{n.title}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">For: {n.client_name || n.client_email}{n.force_redirect_path && <> · Redirects to <code>{n.force_redirect_path}</code></>}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                      <Tag tone={PRIORITY_TONE[n.priority]}>{n.priority}</Tag>
                      {n.acknowledged_at ? <Tag tone="green">Acknowledged</Tag> : <Tag>Pending</Tag>}
                      {n.expires_at && <span>Expires {new Date(n.expires_at).toLocaleString()}</span>}
                      <span>Created {new Date(n.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <button className="text-slate-500 hover:text-rose-300" onClick={() => void remove(n.id)}><Trash2 size={14}/></button>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      <ComposerDialog open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void load() }}/>
    </div>
  )
}

function ComposerDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [clientQ, setClientQ] = useState('')
  const [results, setResults] = useState<ClientOption[]>([])
  const [client, setClient] = useState<ClientOption | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState<'info'|'warning'|'critical'>('info')
  const [forceRedirect, setForceRedirect] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) { setClientQ(''); setResults([]); setClient(null); setTitle(''); setBody(''); setPriority('info'); setForceRedirect(''); setExpiresAt('') }
  }, [open])

  useEffect(() => {
    if (!clientQ.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      try {
        const r = await api.get<{ users: ClientOption[] }>(`/admin/mentionable-users?q=${encodeURIComponent(clientQ.trim())}`)
        setResults(r.users)
      } catch {}
    }, 200)
    return () => clearTimeout(t)
  }, [clientQ])

  async function create() {
    if (!client || !title.trim() || !body.trim()) return
    setBusy(true)
    try {
      const html = body.trim().split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('')
      await api.post('/admin/client-login-notices', {
        client_user_id: client.id, title: title.trim(), body_html: html, priority,
        force_redirect_path: forceRedirect.trim() || null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString().replace('T', ' ').slice(0, 19) : null,
      })
      toast.success('Banner created')
      onCreated()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not create banner') }
    finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent size="lg" title="New client login banner" description="Shows on the client's next portal sign-in. Choose the priority tone and an optional one-time forced redirect after acknowledge.">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-400">Client</label>
            {client ? (
              <div className="mt-1 flex items-center justify-between rounded-lg border border-gold/30 bg-gold/[.06] px-3 py-2">
                <span className="text-sm text-white">{client.full_name || client.email} <span className="text-slate-500">· {client.email}</span></span>
                <button className="text-gold hover:text-white" onClick={() => setClient(null)}>Change</button>
              </div>
            ) : (
              <>
                <input className={inputCls} value={clientQ} onChange={(e) => setClientQ(e.target.value)} placeholder="Search by client name or email…"/>
                {results.length > 0 && (
                  <div className="mt-1 max-h-40 divide-y divide-white/10 overflow-y-auto rounded-lg border border-white/10 bg-navy-950">
                    {results.slice(0, 8).map((r) => (
                      <button key={r.id} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/[.03]" onClick={() => { setClient(r); setClientQ('') }}>
                        <span><span className="font-semibold text-white">{r.full_name || r.email}</span><span className="ml-2 text-[11px] text-slate-500">{r.email}</span></span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400">Title</label>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Important update"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400">Message (basic HTML supported)</label>
            <textarea className={`${inputCls} min-h-32`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What the client needs to see on next login."/>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-400">Priority</label>
              <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400">Expires (optional)</label>
              <input className={inputCls} type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}/>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400">Force redirect on acknowledge (optional)</label>
            <input className={inputCls} value={forceRedirect} onChange={(e) => setForceRedirect(e.target.value)} placeholder="e.g. /portal/documents"/>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className={btnSecondary} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={!client || !title.trim() || !body.trim() || busy} onClick={() => void create()}>Create banner</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
