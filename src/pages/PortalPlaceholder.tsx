import { Link } from 'react-router-dom'
import { Card, StatusBadge, Logo } from '../components/ui'

const modules = [
  'Dashboard', 'Services', 'Matters', 'Tasks', 'Documents', 'Messages',
  'Calendar', 'Billing', 'Funding', 'Property', 'Tax', 'Support',
]

export default function PortalPlaceholder() {
  return (
    <div className="min-h-screen bg-navy-radial">
      <header className="border-b border-white/5 bg-navy-950/70 backdrop-blur">
        <div className="container-pmv flex h-16 items-center justify-between">
          <Link to="/"><Logo /></Link>
          <StatusBadge tone="blue">Client Portal — scaffold</StatusBadge>
        </div>
      </header>
      <main className="container-pmv py-14">
        <p className="eyebrow">Coming next</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Secure client portal</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          This route is wired and ready. Phase 2 adds authentication (password + 2FA), a database with
          row-level security, and each module below. Nothing here is live yet.
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
