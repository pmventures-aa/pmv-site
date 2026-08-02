import { Link } from 'react-router-dom'
import { Card, StatusBadge, Logo } from '../components/ui'

const modules = [
  'Inbox', 'Clients', 'Invites', 'Document Review', 'Invoices',
  'Funding', 'Tickets', 'Notify', 'Roles & Access', 'Settings',
]

export default function AdminPlaceholder() {
  return (
    <div className="min-h-screen bg-navy-radial">
      <header className="border-b border-white/5 bg-navy-950/70 backdrop-blur">
        <div className="container-pmv flex h-16 items-center justify-between">
          <Link to="/"><Logo /></Link>
          <StatusBadge tone="gold">Admin Console — scaffold</StatusBadge>
        </div>
      </header>
      <main className="container-pmv py-14">
        <p className="eyebrow">Employee side</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Staff admin console</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Role-based console for the team. Phase 3 adds the RBAC roles and per-client assignment with
          enforced access scopes. Placeholder only.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <Card key={m} className="flex items-center justify-between">
              <span className="font-medium text-white">{m}</span>
              <StatusBadge tone="slate">Planned</StatusBadge>
            </Card>
          ))}
        </div>
        <div className="mt-10"><Link to="/" className="btn-outline">&larr; Back to site</Link></div>
      </main>
    </div>
  )
}
