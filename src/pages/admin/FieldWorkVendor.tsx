import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Car,
  MapPin,
  ClipboardCheck,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  Plus,
  Trash2,
  PenLine,
  Type,
} from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { useAppPath } from '../../lib/basePath'
import { useAuth } from '../../lib/auth'
import { Avatar } from '../../components/kit/Avatar'
import { toast } from '../../components/kit/toast'
import { hqWorkspaceCopy } from '../../lib/workspace'
import { formatVendorFee } from '../../../shared/vendorFeeAdjustment'

interface Assignment {
  id: string
  kind: 'field' | 'ron'
  service_key: string
  client_user_id: string
  vendor_user_id: string
  assigned_by_user_id: string | null
  title: string | null
  site_label: string | null
  site_address: string | null
  site_city: string | null
  site_state: string | null
  site_postal_code: string | null
  site_lat: number | null
  site_lng: number | null
  scheduled_at: string | null
  status: string
  departed_at: string | null
  arrived_at: string | null
  arrival_source: string | null
  completed_at: string | null
  vendor_signature_type: string | null
  vendor_signature_name: string | null
  vendor_signed_at: string | null
  audit_email_sent_at: string | null
  notes: string | null
  client_name: string | null
  client_email: string | null
  vendor_name: string | null
  vendor_fee_cents?: number | null
  vendor_fee_base_cents?: number | null
  vendor_fee_adjustment_cents?: number | null
  vendor_fee_reason?: string | null
}

interface DocumentRow {
  id: string
  assignment_id: string
  document_type: string
  signer_names: string
  witness_role: number
  oath_administered: number
  stamps_count: number
  notes: string | null
  created_at: string
}

// Radius in meters within which auto-arrival counts as "yes, we're on site".
// Big enough to survive typical GPS noise, small enough that the vendor is
// clearly at the property and not stuck at a nearby traffic light.
const AUTO_ARRIVE_RADIUS_M = 150

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const toRad = (v: number) => (v * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

function siteLine(a: Assignment): string {
  const address = [a.site_address, a.site_city, a.site_state, a.site_postal_code].filter(Boolean).join(', ')
  return a.site_label && address ? `${a.site_label}: ${address}` : (a.site_label || address || 'Not provided')
}

function statusTone(status: string): { tone: 'gold' | 'blue' | 'green' | 'slate'; label: string } {
  switch (status) {
    case 'assigned': return { tone: 'gold', label: 'Assigned' }
    case 'traveling': return { tone: 'blue', label: 'Traveling' }
    case 'on_site': return { tone: 'blue', label: 'On site' }
    case 'documented': return { tone: 'blue', label: 'Documented' }
    case 'signed': return { tone: 'blue', label: 'Signed' }
    case 'completed': return { tone: 'green', label: 'Completed' }
    case 'cancelled': return { tone: 'slate', label: 'Cancelled' }
    default: return { tone: 'slate', label: status }
  }
}

async function getPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 8000 },
    )
  })
}

// -------------------------------------------------------------
// List page: vendor's queue of active field / RON assignments.
// -------------------------------------------------------------

export function FieldWorkList() {
  const p = useAppPath()
  const navigate = useNavigate()
  const { user, workspace } = useAuth()
  const copy = hqWorkspaceCopy(workspace.party_type, workspace.vendor_category, workspace.role_name)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'active' | 'completed'>('active')

  useEffect(() => {
    api.get<{ assignments: Assignment[] }>('/admin/field-assignments?view=mine')
      .then((res) => setAssignments(res.assignments))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const mine = useMemo(() => assignments.filter((a) => a.vendor_user_id === user?.id), [assignments, user?.id])
  const list = useMemo(() => mine.filter((a) => (tab === 'active' ? a.status !== 'completed' && a.status !== 'cancelled' : a.status === 'completed')), [mine, tab])
  const activeCount = useMemo(() => mine.filter((a) => a.status !== 'completed' && a.status !== 'cancelled').length, [mine])

  return (
    <div className="vendor-field-list">
      <PageIntro
        kicker={copy.homeKicker}
        title="My assignments"
        subtitle={copy.homeSubtitle}
        leading={user ? <Avatar userId={user.id} name={user.full_name} size={56} editable uploadPath="/me/avatar" /> : undefined}
      />
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('active')}
          className={`min-h-11 rounded-md border px-4 py-2 text-xs font-medium ${tab === 'active' ? 'border-gold/50 bg-gold/10 text-gold' : 'border-white/10 text-slate-300 hover:border-white/25'}`}
        >
          Active {activeCount > 0 && (
            <span className="ml-1 rounded bg-black/20 px-1.5 py-0.5 text-[10px]">{activeCount}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('completed')}
          className={`min-h-11 rounded-md border px-4 py-2 text-xs font-medium ${tab === 'completed' ? 'border-gold/50 bg-gold/10 text-gold' : 'border-white/10 text-slate-300 hover:border-white/25'}`}
        >
          Completed
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : list.length === 0 ? (
        <Panel>
          <EmptyState label={tab === 'active' ? 'No active assignments right now.' : 'No completed assignments yet.'} />
        </Panel>
      ) : (
        <div className="space-y-3">
          {list.map((assignment) => {
            const tone = statusTone(assignment.status)
            return (
              <button
                key={assignment.id}
                type="button"
                onClick={() => navigate(p(`field-work/${assignment.id}`))}
                className="w-full rounded-md border border-white/10 bg-white/[.02] p-4 text-left transition hover:border-gold/40 hover:bg-white/[.04] active:scale-[.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Tag tone={tone.tone}>{tone.label}</Tag>
                      {assignment.kind === 'ron' && <Tag tone="blue">RON</Tag>}
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-white">{assignment.title || assignment.service_key.replace(/_/g, ' ')}</p>
                    <p className="mt-1 truncate text-xs text-slate-400">{siteLine(assignment)}</p>
                    <p className="mt-1 text-xs text-slate-500">Client: {assignment.client_name || assignment.client_email || 'Not provided'}</p>
                    {assignment.vendor_fee_cents ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Offered payout: <span className="text-slate-300">{formatVendorFee(assignment.vendor_fee_cents)}</span>
                        {assignment.vendor_fee_adjustment_cents ? (
                          <span className="text-gold"> ({assignment.vendor_fee_adjustment_cents > 0 ? '+' : ''}{(assignment.vendor_fee_adjustment_cents / 100).toFixed(0)} local)</span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------
// Detail page: the whole depart/arrive/document/sign flow.
// -------------------------------------------------------------

export default function FieldWorkDetail() {
  const { user } = useAuth()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const p = useAppPath()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'depart' | 'arrive' | 'complete' | null>(null)
  const [addingDoc, setAddingDoc] = useState(false)
  const [assigningSelf, setAssigningSelf] = useState(false)
  const [signatureType, setSignatureType] = useState<'typed' | 'drawn'>('typed')
  const [signatureName, setSignatureName] = useState('')
  const [signatureAck, setSignatureAck] = useState(false)
  const [drawn, setDrawn] = useState<string>('')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const res = await api.get<{ assignment: Assignment; documents: DocumentRow[] }>(`/admin/field-assignments/${id}`)
      setAssignment(res.assignment)
      setDocuments(res.documents)
      if (!signatureName && res.assignment.vendor_name) setSignatureName(res.assignment.vendor_name)
    } catch {
      toast.error('Could not load this assignment.')
    } finally {
      setLoading(false)
    }
  }, [id, signatureName])

  useEffect(() => { void load() }, [load])

  async function assignToMe() {
    if (!assignment) return
    setAssigningSelf(true)
    try {
      await api.post(`/admin/work-assignments/field_assignment/${assignment.id}/assign-self`)
      toast.success('Field job assigned to you.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not assign this field job.')
    } finally {
      setAssigningSelf(false)
    }
  }

  async function markDeparted() {
    if (!assignment) return
    setBusy('depart')
    try {
      const pos = await getPosition()
      await api.post(`/admin/field-assignments/${assignment.id}/depart`, {
        lat: pos?.coords.latitude ?? null,
        lng: pos?.coords.longitude ?? null,
      })
      toast.success('Departure recorded. Drive safe.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not record departure.')
    } finally {
      setBusy(null)
    }
  }

  async function markArrived(source: 'manual' | 'auto_geofence' = 'manual') {
    if (!assignment) return
    setBusy('arrive')
    try {
      const pos = await getPosition()
      await api.post(`/admin/field-assignments/${assignment.id}/arrive`, {
        lat: pos?.coords.latitude ?? null,
        lng: pos?.coords.longitude ?? null,
        source,
      })
      toast.success(source === 'auto_geofence' ? 'Auto-arrived by geofence.' : 'Marked as on-site.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not mark arrival.')
    } finally {
      setBusy(null)
    }
  }

  // Live map ping: while traveling or on site, report GPS so HQ can see the agent.
  useEffect(() => {
    if (!assignment) return
    if (!['traveling', 'on_site', 'documented', 'signed'].includes(assignment.status)) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    let lastSent = 0
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now()
        if (now - lastSent < 20_000) return
        lastSent = now
        void api.post(`/admin/field-assignments/${assignment.id}/ping`, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
        }).catch(() => {})
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 8000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [assignment?.id, assignment?.status])

  // Auto-arrival: while we're in the 'traveling' state and we have a target
  // pin, poll geolocation lightly and flip to on_site when the vendor gets
  // within the geofence radius. Only runs while the tab is open.
  useEffect(() => {
    if (!assignment || assignment.status !== 'traveling') return
    if (assignment.site_lat === null || assignment.site_lng === null) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    const target = { lat: assignment.site_lat, lng: assignment.site_lng }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        if (distanceMeters(here, target) <= AUTO_ARRIVE_RADIUS_M) {
          void markArrived('auto_geofence')
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 8000 },
    )
    return () => navigator.geolocation.clearWatch(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.status, assignment?.site_lat, assignment?.site_lng])

  async function addDocument(form: DocumentDraft) {
    if (!assignment) return
    try {
      await api.post(`/admin/field-assignments/${assignment.id}/documents`, {
        document_type: form.document_type,
        signer_names: form.signer_names.split(',').map((s) => s.trim()).filter(Boolean),
        witness_role: form.witness_role,
        oath_administered: form.oath_administered,
        stamps_count: form.stamps_count,
        notes: form.notes || null,
      })
      setAddingDoc(false)
      toast.success('Document recorded.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add document.')
    }
  }

  async function removeDocument(docId: string) {
    if (!assignment) return
    try {
      await api.del(`/admin/field-assignments/${assignment.id}/documents/${docId}`)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove document.')
    }
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    drawingRef.current = true
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.beginPath()
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
  }
  function drawMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#f5c76e'
    ctx.stroke()
  }
  function endDraw() {
    drawingRef.current = false
    const canvas = canvasRef.current
    if (!canvas) return
    setDrawn(canvas.toDataURL('image/png'))
  }
  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setDrawn('')
  }

  async function complete() {
    if (!assignment) return
    if (documents.length === 0) return toast.error('Add at least one document before completing.')
    if (!signatureAck) return toast.error('Confirm the certification statement to sign and complete.')
    if (signatureType === 'typed' && signatureName.trim().length < 2) return toast.error('Type your full name to sign.')
    if (signatureType === 'drawn' && !drawn) return toast.error('Draw your signature before completing.')
    setBusy('complete')
    try {
      // Drawn signatures are captured on the canvas but stored as a data URL
      // (server side keeps it in vendor_signature_image_key). Skips having to
      // stand up a separate R2 upload endpoint just for signature PNGs.
      const signatureImagePayload = signatureType === 'drawn' ? drawn : null
      const pos = await getPosition()
      await api.post(`/admin/field-assignments/${assignment.id}/complete`, {
        lat: pos?.coords.latitude ?? null,
        lng: pos?.coords.longitude ?? null,
        signature_type: signatureType,
        signature_name: signatureType === 'typed' ? signatureName.trim() : (signatureName.trim() || 'Signature on file'),
        signature_image_key: signatureImagePayload,
      })
      toast.success('Assignment completed. Audit trail sent.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not complete the assignment.')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>
  if (!assignment) return <p className="text-sm text-slate-400">Assignment not found.</p>

  const tone = statusTone(assignment.status)
  const isRon = assignment.kind === 'ron'
  const done = assignment.status === 'completed'

  return (
    <div className="vendor-field-detail pb-24 lg:pb-0">
      <button
        type="button"
        onClick={() => navigate(p('field-work/mine'))}
        className="mb-3 inline-flex min-h-11 items-center gap-1 text-xs text-slate-400 hover:text-white"
      >
        <ChevronLeft size={14} /> Back to my assignments
      </button>
      <PageIntro
        kicker={isRon ? 'Remote Online Notarization' : 'Field assignment'}
        title={assignment.title || assignment.service_key.replace(/_/g, ' ')}
        subtitle={siteLine(assignment)}
        action={<div className="flex items-center gap-2">{assignment.vendor_user_id !== user?.id && <button type="button" disabled={assigningSelf} onClick={() => void assignToMe()} className={`${btnOutline} disabled:opacity-50`}>{assigningSelf ? <Loader2 size={14} className="animate-spin" /> : null} Assign to me</button>}<Tag tone={tone.tone}>{tone.label}</Tag></div>}
      />

      {!isRon && !done && (
        <div className="sticky top-14 z-20 -mx-3 mb-4 border-b border-white/10 bg-navy-950/95 px-3 py-2 backdrop-blur lg:hidden">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={markDeparted}
              disabled={busy === 'depart' || !!assignment.departed_at}
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition disabled:opacity-60 ${
                assignment.departed_at ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-gold/40 bg-gold/10 text-gold'
              }`}
            >
              {busy === 'depart' ? <Loader2 size={16} className="animate-spin" /> : <Car size={18} />}
              {assignment.departed_at ? 'Departed' : 'Depart'}
            </button>
            <button
              type="button"
              onClick={() => markArrived('manual')}
              disabled={busy === 'arrive' || !!assignment.arrived_at || !assignment.departed_at}
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition disabled:opacity-60 ${
                assignment.arrived_at ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-white/15 bg-white/[.02] text-white'
              }`}
            >
              {busy === 'arrive' ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={18} />}
              {assignment.arrived_at ? 'On site' : 'Arrive'}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* left column: workflow */}
        <div className="space-y-4">
          {!isRon && (
            <Panel>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">1. Travel</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={markDeparted}
                  disabled={busy === 'depart' || done || !!assignment.departed_at}
                  className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border px-4 py-4 text-sm font-semibold transition disabled:opacity-60 ${
                    assignment.departed_at ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-gold/40 bg-gold/10 text-gold hover:bg-gold/15'
                  }`}
                >
                  {busy === 'depart' ? <Loader2 size={16} className="animate-spin" /> : <Car size={18} />}
                  {assignment.departed_at ? 'Departure recorded' : 'Leave for site'}
                </button>
                <button
                  type="button"
                  onClick={() => markArrived('manual')}
                  disabled={busy === 'arrive' || done || !!assignment.arrived_at || !assignment.departed_at}
                  className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border px-4 py-4 text-sm font-semibold transition disabled:opacity-60 ${
                    assignment.arrived_at ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-white/15 bg-white/[.02] text-white hover:border-gold/40 hover:text-gold'
                  }`}
                >
                  {busy === 'arrive' ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={18} />}
                  {assignment.arrived_at ? `Arrived (${assignment.arrival_source === 'auto_geofence' ? 'auto' : 'manual'})` : 'I have arrived'}
                </button>
              </div>
              {assignment.status === 'traveling' && assignment.site_lat !== null && (
                <p className="mt-2 text-xs text-slate-500">
                  Auto-arrival watching within {AUTO_ARRIVE_RADIUS_M}m of the site pin. You can also tap "I have arrived" at any time.
                </p>
              )}
            </Panel>
          )}

          <Panel>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{isRon ? '1' : '2'}. Documents handled</p>
                <p className="mt-1 text-xs text-slate-500">Record every document: signers, witness role, oath, stamps. Add each one as you complete it.</p>
              </div>
              {!done && (
                <button type="button" onClick={() => setAddingDoc((v) => !v)} className={btnOutline}>
                  <Plus size={14} /> Add document
                </button>
              )}
            </div>
            {addingDoc && <DocumentForm onCancel={() => setAddingDoc(false)} onSave={addDocument} />}
            {documents.length === 0 ? (
              <EmptyState label="No documents recorded yet." />
            ) : (
              <ul className="mt-3 divide-y divide-white/5">
                {documents.map((doc) => {
                  const signers = safeSigners(doc.signer_names)
                  return (
                    <li key={doc.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white">{doc.document_type}</p>
                        {signers.length > 0 && (
                          <p className="mt-0.5 text-xs text-slate-400">Signers: {signers.join(', ')}</p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          {doc.oath_administered ? <span className="text-gold">Oath administered</span> : null}
                          {doc.witness_role ? <span className="text-gold">Vendor served as witness</span> : null}
                          <span>Stamps: <strong className="text-slate-300">{doc.stamps_count}</strong></span>
                        </div>
                        {doc.notes && <p className="mt-1 text-xs text-slate-500">{doc.notes}</p>}
                      </div>
                      {!done && (
                        <button
                          type="button"
                          onClick={() => removeDocument(doc.id)}
                          className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-rose-300"
                          title="Remove"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{isRon ? '2' : '3'}. Signature &amp; complete</p>
            {done ? (
              <div className="mt-3 rounded-md border border-emerald-400/30 bg-emerald-400/[.05] p-4 text-sm text-emerald-100">
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                  <div>
                    <p className="font-semibold">Assignment completed.</p>
                    <p className="mt-1 text-xs text-emerald-200/80">
                      Audit trail email sent to {assignment.client_email || 'client on file'} at {new Date(assignment.audit_email_sent_at || assignment.completed_at || '').toLocaleString()}.
                    </p>
                    <p className="mt-1 text-xs text-emerald-200/80">
                      Signed by {assignment.vendor_signature_name || 'signature image on file'} ({assignment.vendor_signature_type || 'typed'})
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSignatureType('typed')}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${signatureType === 'typed' ? 'border-gold/50 bg-gold/10 text-gold' : 'border-white/10 text-slate-300 hover:border-white/25'}`}
                  >
                    <Type size={13} /> Typed name
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignatureType('drawn')}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${signatureType === 'drawn' ? 'border-gold/50 bg-gold/10 text-gold' : 'border-white/10 text-slate-300 hover:border-white/25'}`}
                  >
                    <PenLine size={13} /> Drawn signature
                  </button>
                </div>

                {signatureType === 'typed' ? (
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-400">Full legal name</span>
                    <input
                      className={inputCls}
                      autoComplete="name"
                      value={signatureName}
                      onChange={(e) => setSignatureName(e.target.value)}
                    />
                  </label>
                ) : (
                  <div>
                    <span className="mb-1 block text-xs text-slate-400">Sign below with your finger or stylus</span>
                    <canvas
                      ref={canvasRef}
                      width={480}
                      height={140}
                      className="w-full touch-none rounded-md border border-white/10 bg-white/[.02]"
                      onPointerDown={startDraw}
                      onPointerMove={drawMove}
                      onPointerUp={endDraw}
                      onPointerLeave={endDraw}
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={clearCanvas} className={btnOutline}>Clear</button>
                      <input
                        className={`${inputCls} flex-1`}
                        placeholder="Printed name (optional)"
                        value={signatureName}
                        onChange={(e) => setSignatureName(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <label className="flex items-start gap-2 text-xs leading-5 text-slate-400">
                  <input
                    type="checkbox"
                    checked={signatureAck}
                    onChange={(e) => setSignatureAck(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/[.04] accent-gold"
                  />
                  <span>
                    I certify that the information above is accurate to the best of my knowledge, and I intend the {signatureType === 'typed' ? 'name typed above' : 'signature drawn above'} to serve as my electronic signature on this record.
                  </span>
                </label>

                <button
                  type="button"
                  onClick={complete}
                  disabled={busy === 'complete'}
                  className={`${btnPrimary} w-full !py-3 disabled:opacity-60`}
                >
                  {busy === 'complete' ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  Sign &amp; mark assignment completed
                </button>
              </div>
            )}
          </Panel>
        </div>

        {/* right column: at-a-glance details */}
        <div className="space-y-4">
          <Panel>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Client</p>
            <p className="mt-1 text-sm font-medium text-white">{assignment.client_name || 'Not provided'}</p>
            <p className="text-xs text-slate-500">{assignment.client_email}</p>
          </Panel>
          <Panel>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Site</p>
            <p className="mt-1 text-sm text-white">{siteLine(assignment)}</p>
            {assignment.site_lat !== null && assignment.site_lng !== null && (
              <a
                href={`https://www.google.com/maps?q=${assignment.site_lat},${assignment.site_lng}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-gold hover:underline"
              >
                <MapPin size={12} /> Open in Maps
              </a>
            )}
          </Panel>
          {assignment.vendor_fee_cents ? (
            <Panel>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Your payout offer</p>
              <p className="mt-1 text-lg font-semibold text-white">{formatVendorFee(assignment.vendor_fee_cents)}</p>
              {assignment.vendor_fee_base_cents && assignment.vendor_fee_base_cents !== assignment.vendor_fee_cents ? (
                <p className="mt-1 text-xs text-slate-500">
                  Catalog base {formatVendorFee(assignment.vendor_fee_base_cents)}
                  {assignment.vendor_fee_adjustment_cents ? (
                    <span className="text-gold"> · {assignment.vendor_fee_adjustment_cents > 0 ? '+' : ''}{(assignment.vendor_fee_adjustment_cents / 100).toFixed(0)} local adjustment</span>
                  ) : null}
                </p>
              ) : null}
              {assignment.vendor_fee_reason ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">{assignment.vendor_fee_reason}</p>
              ) : null}
            </Panel>
          ) : null}
          {assignment.notes && (
            <Panel>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Job notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{assignment.notes}</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------------------
// Document sub-form.
// -------------------------------------------------------------

interface DocumentDraft {
  document_type: string
  signer_names: string
  witness_role: boolean
  oath_administered: boolean
  stamps_count: number
  notes: string
}

function DocumentForm({ onSave, onCancel }: { onSave: (draft: DocumentDraft) => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState<DocumentDraft>({
    document_type: '',
    signer_names: '',
    witness_role: false,
    oath_administered: false,
    stamps_count: 1,
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  return (
    <div className="mt-4 space-y-3 rounded-md border border-gold/20 bg-gold/[.03] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-xs text-slate-400">Document type</span>
          <input
            className={inputCls}
            placeholder="e.g. Warranty deed, POA, Affidavit"
            value={draft.document_type}
            onChange={(e) => setDraft({ ...draft, document_type: e.target.value })}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs text-slate-400">Signer(s), comma-separated</span>
          <input
            className={inputCls}
            placeholder="John Smith, Jane Smith"
            value={draft.signer_names}
            onChange={(e) => setDraft({ ...draft, signer_names: e.target.value })}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs text-slate-400">Stamps completed</span>
          <input
            className={inputCls}
            type="number"
            min={0}
            value={draft.stamps_count}
            onChange={(e) => setDraft({ ...draft, stamps_count: Math.max(0, parseInt(e.target.value || '0', 10) || 0) })}
          />
        </label>
        <div className="grid gap-2 sm:pt-5">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={draft.oath_administered}
              onChange={(e) => setDraft({ ...draft, oath_administered: e.target.checked })}
              className="h-4 w-4 accent-gold"
            />
            Oath / affirmation administered
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={draft.witness_role}
              onChange={(e) => setDraft({ ...draft, witness_role: e.target.checked })}
              className="h-4 w-4 accent-gold"
            />
            I served as witness on this document
          </label>
        </div>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-slate-400">Notes (optional)</span>
        <textarea
          className={`${inputCls} min-h-16`}
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className={btnOutline}>Cancel</button>
        <button
          type="button"
          disabled={saving || !draft.document_type.trim()}
          onClick={async () => { setSaving(true); try { await onSave(draft) } finally { setSaving(false) } }}
          className={`${btnPrimary} disabled:opacity-60`}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />} Save document
        </button>
      </div>
    </div>
  )
}

function safeSigners(json: string): string[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}
