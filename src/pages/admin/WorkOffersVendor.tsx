import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, SkeletonTable, btnPrimary, btnOutline, inputCls, type Tone } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import {
  formatCents,
  proposalKindLabel,
  proposalStatusLabel,
  proposalStatusTone,
  vendorNeedsToAct,
} from '../../../shared/vendorProposals'

interface Offer {
  id: string
  kind: string
  service_key: string
  title: string | null
  summary: string | null
  site_label: string | null
  site_address: string | null
  site_city: string | null
  site_state: string | null
  site_postal_code: string | null
  scheduled_at: string | null
  respond_by: string | null
  offer_notes: string | null
  status: string
  status_effective?: string
  responded_at: string | null
  vendor_response_note: string | null
  field_assignment_id: string | null
  total_cents: number
  client_name: string | null
}

interface Item { id: string; label: string; detail: string | null; quantity: number | null; unit: string | null; amount_cents: number }

const TONE_MAP: Record<string, Tone> = { neutral: 'slate', info: 'blue', active: 'sea', success: 'green', warn: 'gold', danger: 'red' }

function tagTone(status: string): Tone {
  return TONE_MAP[proposalStatusTone(status)] ?? 'slate'
}

function shownStatus(o: { status: string; status_effective?: string }): string {
  return o.status_effective || o.status
}

function when(iso: string | null): string {
  if (!iso) return 'To be confirmed'
  const ms = Date.parse(iso.includes('T') || iso.includes(' ') ? iso : `${iso}T00:00:00Z`)
  if (!Number.isFinite(ms)) return iso
  return new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function siteText(o: Offer): string {
  const cityState = [o.site_city, o.site_state].filter(Boolean).join(', ')
  const parts = [o.site_address, cityState, o.site_postal_code].filter(Boolean)
  return [o.site_label, parts.join(' ')].filter(Boolean).join(' - ') || 'Details to follow'
}

/** The full offer, with the two buttons that are the whole point of the page. */
export function WorkOfferDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [offer, setOffer] = useState<Offer | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const res = await api.get<{ proposal: Offer; items: Item[]; total_cents: number }>(`/admin/vendor-proposals/${id}`)
      setOffer(res.proposal)
      setItems(res.items)
      setTotal(res.total_cents)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load this offer.')
    } finally {
      setLoaded(true)
    }
  }, [id])
  useEffect(() => { void load() }, [load])

  async function respond(decision: 'accepted' | 'declined') {
    if (!id) return
    setBusy(true)
    try {
      await api.post(`/admin/vendor-proposals/${id}/respond`, { decision, note: note.trim() || null })
      toast.success(decision === 'accepted' ? 'Accepted. We will confirm the assignment shortly.' : 'Thanks for letting us know.')
      setNote('')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That did not go through.')
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return <Panel><SkeletonTable rows={5} cols={2}/></Panel>
  if (!offer) return <EmptyState label="This offer is no longer available."/>

  const status = shownStatus(offer)
  const canRespond = vendorNeedsToAct(status)

  return (
    <div className="space-y-4">
      <PageIntro section="Delivery"
        kicker="Work offer"
        title={offer.title || proposalKindLabel(offer.kind)}
        subtitle={canRespond ? 'Read the details, then tell us whether you can take it.' : proposalStatusLabel(status)}
        action={<button type="button" className={btnOutline} onClick={() => navigate('../work-offers')}>Back</button>}
      />

      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone={tagTone(status)}>{proposalStatusLabel(status)}</Tag>
          <Tag>{proposalKindLabel(offer.kind)}</Tag>
        </div>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3"><dt className="text-slate-500">{offer.kind === 'ron' ? 'Session' : 'Where'}</dt><dd className="text-right text-slate-200">{siteText(offer)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">When</dt><dd className="text-right text-slate-200">{when(offer.scheduled_at)}</dd></div>
          {offer.respond_by && <div className="flex justify-between gap-3"><dt className="text-slate-500">Respond by</dt><dd className="text-right text-slate-200">{when(offer.respond_by)}</dd></div>}
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Pay</dt><dd className="text-right font-bold text-white tabular-nums">{formatCents(total)}</dd></div>
        </dl>

        {offer.summary && (
          <div className="rounded-md border border-white/10 bg-white/[.02] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Scope of work</p>
            <p className="mt-1.5 whitespace-pre-line text-sm text-slate-300">{offer.summary}</p>
          </div>
        )}

        {items.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Itemized</p>
            <ul className="divide-y divide-white/[.06]">
              {items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <span className="text-slate-200">
                    {item.label}
                    {(item.quantity || item.detail) && (
                      <span className="mt-0.5 block text-xs text-slate-500">{[item.quantity ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : '', item.detail].filter(Boolean).join(' - ')}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-slate-300 tabular-nums">{formatCents(item.amount_cents)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {offer.offer_notes && <p className="text-xs text-slate-400">{offer.offer_notes}</p>}

        {canRespond ? (
          <div className="space-y-2 border-t border-white/10 pt-3">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">Anything we should know (optional)</span>
              <textarea className={`${inputCls} min-h-20`} placeholder="Timing, access, or a question" value={note} onChange={(e) => setNote(e.target.value)}/>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} disabled={busy} onClick={() => void respond('accepted')}>Accept this work</button>
              <button type="button" className={btnOutline} disabled={busy} onClick={() => void respond('declined')}>Cannot take it</button>
            </div>
            <p className="text-xs text-slate-500">Accepting confirms you can perform this work on the terms above. Our team confirms the assignment before it becomes scheduled work, and you will get a separate notice when that happens.</p>
          </div>
        ) : (
          <div className="border-t border-white/10 pt-3">
            {offer.vendor_response_note && <p className="mb-2 text-sm text-slate-400">Your note: {offer.vendor_response_note}</p>}
            {offer.status === 'accepted' && <p className="text-sm text-slate-300">You accepted this. It is with our team for confirmation.</p>}
            {offer.status === 'released' && offer.field_assignment_id && (
              <button type="button" className={btnPrimary} onClick={() => navigate(`../field-work/${offer.field_assignment_id}`)}>Open the assignment</button>
            )}
          </div>
        )}
      </Panel>
    </div>
  )
}

/** The provider's list of offers, with the ones needing an answer on top. */
export default function WorkOffersVendor() {
  const navigate = useNavigate()
  const [offers, setOffers] = useState<Offer[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.get<{ proposals: Offer[] }>('/admin/vendor-proposals/mine')
      .then((r) => setOffers(r.proposals ?? []))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Could not load your offers.'))
      .finally(() => setLoaded(true))
  }, [])

  const open = offers.filter((o) => vendorNeedsToAct(shownStatus(o)))

  return (
    <div className="space-y-4">
      <PageIntro
        kicker="Your work"
        title="Work Offers"
        subtitle={open.length ? `${open.length} offer${open.length === 1 ? '' : 's'} waiting on your answer.` : 'Offers we send you show up here.'}
      />

      {!loaded ? <Panel><SkeletonTable rows={3} cols={3}/></Panel> : offers.length === 0 ? (
        <EmptyState label="No offers yet. When we have work for you, it lands here and in your email."/>
      ) : (
        <ul className="space-y-2">
          {offers.map((o) => {
            const status = shownStatus(o)
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => navigate(`../work-offers/${o.id}`)}
                  className="w-full rounded-lg border border-white/10 bg-white/[.02] p-4 text-left transition hover:border-gold/35 hover:bg-white/[.04]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag tone={tagTone(status)}>{proposalStatusLabel(status)}</Tag>
                      <span className="text-sm font-semibold text-white">{o.title || proposalKindLabel(o.kind)}</span>
                    </div>
                    <span className="text-sm font-bold text-white tabular-nums">{formatCents(o.total_cents)}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">{when(o.scheduled_at)} · {siteText(o)}</p>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
