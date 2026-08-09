import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'

interface JourneyStats {
  open_tasks: number
  pending_documents: number
  open_invoices: number
  open_tickets: number
}

interface OnboardingState {
  completed: boolean
  services: string[]
}

export function ClientJourney({ stats, className = '' }: { stats?: JourneyStats | null; className?: string }) {
  const p = useAppPath()
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    api.get<OnboardingState>('/portal/onboarding').then(setOnboarding).catch(() => setOnboarding(null))
  }, [])

  const next = useMemo(() => {
    if (onboarding && !onboarding.completed) return { eyebrow: 'Start here', title: 'Tell us what brought you to Pinnacle', body: 'A short guided setup gives us enough context to start helping. You can explore the portal before finishing it.', to: p('onboarding'), label: 'Continue my welcome' }
    if ((stats?.open_tasks || 0) > 0) return { eyebrow: 'Your next step', title: 'You have work waiting for you', body: `${stats!.open_tasks} open ${stats!.open_tasks === 1 ? 'task is' : 'tasks are'} ready for your attention.`, to: p('tasks'), label: 'Review my tasks' }
    if ((stats?.pending_documents || 0) > 0) return { eyebrow: 'Your next step', title: 'A document needs attention', body: 'Keep the work moving by reviewing what is waiting in your document area.', to: p('documents'), label: 'Open documents' }
    if ((stats?.open_invoices || 0) > 0) return { eyebrow: 'Your next step', title: 'Billing has an open item', body: 'Your billing area keeps invoices and payment status together.', to: p('billing'), label: 'Review billing' }
    if ((stats?.open_tickets || 0) > 0) return { eyebrow: 'We’re working with you', title: 'Your support request is open', body: 'You can follow the status and add context from Support.', to: p('support'), label: 'Open support' }
    return { eyebrow: 'Your journey', title: 'Your portal is ready when you need it', body: 'Use Pinnacle for the work in front of you. Other services stay available to discover when they become relevant.', to: p('services'), label: 'Explore what Pinnacle can help with' }
  }, [onboarding, p, stats])

  return (
    <section className={`overflow-hidden rounded-xl border border-white/10 bg-white/[0.025] ${className}`}>
      <div className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="max-w-2xl">
          <p className="eyebrow">{next.eyebrow}</p>
          <h2 className="mt-1 text-lg font-semibold text-white">{next.title}</h2>
          <p className="mt-1.5 text-sm leading-6 text-slate-400">{next.body}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setExpanded((value) => !value)} className="btn-outline !px-3 !py-2 text-xs">{expanded ? 'Hide journey' : 'See how the portal works'}</button>
          <Link to={next.to} className="btn-gold !px-4 !py-2 text-xs">{next.label}</Link>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/10 bg-white/[0.018] px-5 py-5 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">How we work together</p>
          <div className="mt-4 grid gap-5 md:grid-cols-4">
            {[
              ['1', 'Start with the situation', 'Tell us what is happening. You do not need to diagnose the service yourself.'],
              ['2', 'We organize the next move', 'Pinnacle reviews the context, clarifies scope, and coordinates the right people or information.'],
              ['3', 'Keep it moving here', 'Tasks, messages, files, appointments, and billing stay connected to the work instead of scattered across inboxes.'],
              ['4', 'Add support as life changes', 'Explore another service only when it becomes useful. Your portal grows with the relationship.'],
            ].map(([number, title, body]) => (
              <div key={number} className="border-l border-white/10 pl-4">
                <p className="text-xs font-semibold text-gold">{number}</p>
                <p className="mt-1 text-sm font-medium text-white">{title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
