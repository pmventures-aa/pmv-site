import type { ReactNode } from 'react'
import { ViewTransitionLink } from './ViewTransitionLink'

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <ViewTransitionLink to="/" className="font-medium text-slate-400 transition-colors hover:text-gold">Home</ViewTransitionLink>
        </li>
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-slate-700">/</span>
            {item.to && i < items.length - 1 ? (
              <ViewTransitionLink to={item.to} className="font-medium text-slate-400 transition-colors hover:text-gold">{item.label}</ViewTransitionLink>
            ) : (
              <span aria-current="page" className="font-semibold text-slate-300">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function BreadcrumbSlot({ children }: { children: ReactNode }) {
  return <div className="container-pmv pt-8">{children}</div>
}