import { NavLink } from 'react-router-dom'
import { BookOpen, FileText, PenTool, Send } from 'lucide-react'
import { useAppPath } from '../../lib/basePath'

const ITEMS = [
  { to: 'document-center', label: 'Working docs', icon: FileText },
  { to: 'esign-platform', label: 'E-Sign', icon: PenTool },
  { to: 'envelopes', label: 'Signed', icon: Send },
  { to: 'community-documents', label: 'Templates', icon: BookOpen },
] as const

export function DocumentWorkspaceNav() {
  const p = useAppPath()
  return (
    <nav aria-label="Document workspace" className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-white/[.08] bg-white/[.018] p-1">
      {ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={p(item.to)}
            className={({ isActive }) =>
              `inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-bold transition ${
                isActive ? 'bg-gold/[.12] text-white' : 'text-slate-400 hover:bg-white/[.04] hover:text-white'
              }`
            }
            end={item.to === 'document-center'}
          >
            <Icon size={14} />
            {item.label}
          </NavLink>
        )
      })}
    </nav>
  )
}
