import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAppPath } from '../../lib/basePath'

const STORAGE_KEY = 'pmv_client_portal_tour_complete'

const steps = [
  {
    eyebrow: 'Your home base',
    title: 'Start with the next useful thing.',
    body: 'Your dashboard is designed to surface the next action that matters, not make you scan every part of the portal each time you sign in.',
  },
  {
    eyebrow: 'The work stays together',
    title: 'Tasks, files, messages, and appointments live with the relationship.',
    body: 'Use the portal as the shared place for what Pinnacle is coordinating with you. You should not have to reconstruct the project from separate inboxes.',
  },
  {
    eyebrow: 'Discover as you need it',
    title: 'Other services stay available without getting in your way.',
    body: 'Your current work comes first. When another need comes up, Services lets you learn what Pinnacle can help with and start that conversation in context.',
  },
  {
    eyebrow: 'You stay in control',
    title: 'Your account can grow without giving away the keys.',
    body: 'Security, notifications, and Trusted Contacts let you control your own access and decide when someone you trust can see or edit specific parts of your account.',
  },
] as const

export function PortalTour() {
  const p = useAppPath()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const requested = params.get('tour') === '1'
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const complete = window.localStorage.getItem(STORAGE_KEY) === '1'
    if (requested || !complete) setOpen(true)
  }, [requested])

  function finish() {
    window.localStorage.setItem(STORAGE_KEY, '1')
    setOpen(false)
    if (requested) navigate(p(), { replace: true })
  }

  if (!open) return null
  const step = steps[index]
  const last = index === steps.length - 1

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/65 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="portal-tour-title">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-white/15 bg-navy-900 shadow-2xl">
        <div className="border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Portal introduction · {index + 1} of {steps.length}</p>
            <button type="button" onClick={finish} className="text-xs font-medium text-slate-500 hover:text-white">Skip</button>
          </div>
          <div className="mt-3 flex gap-1.5" aria-hidden="true">{steps.map((_, stepIndex) => <span key={stepIndex} className={`h-1 flex-1 rounded-full ${stepIndex <= index ? 'bg-gold' : 'bg-white/10'}`} />)}</div>
        </div>
        <div className="px-5 py-6 sm:px-6 sm:py-7">
          <p className="eyebrow">{step.eyebrow}</p>
          <h2 id="portal-tour-title" className="mt-2 font-display text-2xl font-medium text-white">{step.title}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">{step.body}</p>

          {last && (
            <div className="mt-5 grid gap-2 border-y border-white/10 py-4 text-sm sm:grid-cols-2">
              <Link to={p('messages')} onClick={finish} className="text-slate-300 hover:text-gold">Message Pinnacle →</Link>
              <Link to={p('services')} onClick={finish} className="text-slate-300 hover:text-gold">Explore services →</Link>
              <Link to={p('trusted-contacts')} onClick={finish} className="text-slate-300 hover:text-gold">Trusted Contacts →</Link>
              <Link to={p('security')} onClick={finish} className="text-slate-300 hover:text-gold">Security →</Link>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4 sm:px-6">
          <button type="button" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))} className="btn-outline !px-4 !py-2 text-xs disabled:invisible">Back</button>
          <button type="button" onClick={() => last ? finish() : setIndex((value) => value + 1)} className="btn-gold !px-4 !py-2 text-xs">{last ? 'Start using my portal' : 'Next'}</button>
        </div>
      </div>
    </div>
  )
}
